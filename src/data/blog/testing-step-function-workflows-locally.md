---
title: Testing Step Function workflows Locally
author: "Benjamen Pyle"
description: "If you've been following along for a bit, you know how much of a fan of Serverless I am. And even more specifically, how much I love Step Functions. If you have the problem of needing a highly availab"
pubDatetime: 2023-04-14T00:00:00Z
tags:
  - aws
  - cdk
  - infrastructure
  - programming
  - serverless
draft: false
---

If you've been following along for a bit, you know how much of a fan of Serverless I am. And even more specifically, how much I love Step Functions. If you have the problem of needing a highly available workflow coordinator, you can't do any better than picking it as your tool of choice. However, I am also unapologetically a fan of local development. And this is one place where I feel that Step Functions falls a little bit. So follow me along on this epic towards being able to test Step Function workflows locally.

## The Workflow

Here's the little one that we are going to spend some time working through

![State Machine Workflow](/images/local-workflow.png)

The purpose of this walkthrough is not to build a highly robust workflow but to show how to run some integration tests against the machine.

The crux of this state machine is that it presents a payload that either leads to "Success" or "Failure". Again, quite simple.

From here, let's dive in on how to test Step Function workflows locally.

## Setting up the State Machine

This sample is constructed using CDK as the infrastructure builder. If you aren't familiar with CDK, there's a [getting started over here.](https://binaryheap.com/intro-to-cdk/)

First up, let's create the State Machine using CDK with TypeScript.

```typescript
// code above omitted
const flow = this.buildStateMachine(scope);

this._stateMachine = new stepfunctions.StateMachine(this, "StateMachine", {
  stateMachineName: "SimpleStateMachine",
  definition: flow,
  stateMachineType: stepfunctions.StateMachineType.EXPRESS,
  timeout: Duration.seconds(30),
  logs: {
    level: LogLevel.ALL,
    destination: logGroup,
    includeExecutionData: true,
  },
});

// code above omitted
buildStateMachine = (scope: Construct): stepfunctions.IChainable => {
  const succeed = new Succeed(scope, "Succeed");
  const failure = new Fail(scope, "Fail");

  return (
    new Choice(this, "Success or Failure")
      // Look at the "status" field
      .when(Condition.stringEquals("$.path", "Succeed"), succeed)
      .when(Condition.stringEquals("$.path", "Fail"), failure)
      .otherwise(failure)
  );
};
```

## Deploy Step Functions Locally

Local cloud development can sometimes be a little bit tricky. I've used Localstack for many services in the past but when I found an AWS-officially supported image for Step Functions, I was excited to try it. For reference, [here](https://docs.aws.amazon.com/step-functions/latest/dg/sfn-local.html) is the link to that Docker image.

One of the nice things that I've found is that it has (so far) had all the parity of features that I need to be able to deploy, test and even run locally. Remember, this is "Amazon Web Services", the requests to these services are just "GET, PUT, POST" and you can interact with them locally the same way.

With it being a Docker image, I've built a simple Docker Compose file for starting up the container and a side container for Localstack. The reason for Localstack is that with the Step Functions local, you can specify the endpoints for things you want to "mock" like Lambda, SQS, SNS and so on. I'm not doing any of that for this sample, but it's there in case you want to extend it.

Let's have a look at the compose file

```yaml
version: "3.4"

services:
  localstack:
    container_name: sf_localstack
    image: localstack/localstack:latest
    environment:
      - AWS_DEFAULT_REGION=us-west-2
      - HOSTNAME_EXTERNAL=localhost
      - SERVICES=sqs # which services to start
      - DEBUG=0
    ports:
      - 4566:4566

  step-functions:
    container_name: step-functions
    image: amazon/aws-stepfunctions-local
    depends_on:
      - localstack
    environment:
      - AWS_DEFAULT_REGION=us-west-2 # this is used when resources are created
      - AWS_ACCESS_KEY_ID=12345 # just to fill in the blanks
      - AWS_SECRET_ACCESS_KEY=12345 # just to fill in the blanks
      - SQS_ENDPOINT=host.docker.internal:4566 # connected to Localstack
    ports:
      - 8083:8083
```

Basic of basic compose files. It starts up Localstack and then does the Step Functions container.

![Docker startup](/images/docker-startup.png)

## Deploying to the Local Container

Now here's where the rub lies. When deploying up to AWS the output of CDK is taken care of for us. That CloudFormation that is generated gets executed with no problem. However, I only want a part of the CloudFormation to get deployed.

I've previously seen another tool that did something like this, but I didn't quite like how it was returning output and instead of patching and issuing a PR, I decided to build my own. This was [Part 1](https://binaryheap.com/cdk-asl-definition-extractor/) that started this thought process. If you want to see the library, it's in that article or [here](https://www.npmjs.com/package/cdk-asl-definition-extractor)

The way it works is that it extracts the definition from the State Machine in the CloudFormation (JSON) and then outputs an array of Machines. The output looks like this:

```bash
[{"identifier":"SimpleStateMachine3C32178E","definition":"{\"StartAt\":\"Success or Failure\",\"States\":{\"Success or Failure\":{\"Type\":\"Choice\",\"Choices\":[{\"Variable\":\"$.path\",\"StringEquals\":\"Succeed\",\"Next\":\"Succeed\"},{\"Variable\":\"$.path\",\"StringEquals\":\"Fail\",\"Next\":\"Fail\"}],\"Default\":\"Fail\"},\"Fail\":{\"Type\":\"Fail\"},\"Succeed\":{\"Type\":\"Succeed\"}},\"TimeoutSeconds\":30}"}]

```

So what can we do with that? Simple, push it into the Step Functions container to create the State Machine.

```bash
aws stepfunctions --endpoint-url http://localhost:8083 create-state-machine --definition  --name  --role-arn "arn:aws:iam::012345678901:role/DummyRole" --type "EXPRESS"

```

After deploying, run a quick list:

```bash
# AWS CLI Command
aws stepfunctions --endpoint-url http://localhost:8083 list-state-machines

# the output
{
    "stateMachines": [
        {
            "stateMachineArn": "arn:aws:states:us-west-2:123456789012:stateMachine:SimpleStateMachine3C32178E",
            "name": "SimpleStateMachine3C32178E",
            "type": "EXPRESS",
            "creationDate": "2023-04-14T13:56:45.260000-05:00"
        }
    ]
}

```

Moving right along, now we can start testing

## Testing Step Function workflows locally

Now that we've got this State Machine up and running, how do we test it? So many ways.

- Postman
- cURL
- Jest
- jUnit
- ...

For this example, I'm going to show you how to set up Jest to test these. I like Jest for a couple of reasons

1.  I can use TypeScript which is what I'm using for the CDK code.
2.  AWS SDK v3 for [JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/index.html) is solid

To isolate my State Machine tests, I create a test suite like this.

```typescript
import { SFNClient, StartSyncExecutionCommand } from "@aws-sdk/client-sfn";

describe("SF Integration Tests", () => {
  const client = new SFNClient({
    region: "us-west-2",
    endpoint: "http://localhost:8083",
    disableHostPrefix: true,
  });
});
```

And then I can execute a test with the payload I want to like this

```typescript
it("Should Succeed Success Path", async () => {
  const startCommand = new StartSyncExecutionCommand({
    stateMachineArn:
      "arn:aws:states:us-west-2:123456789012:stateMachine:SimpleStateMachine3C32178E",
    input: '{"path": "Succeed"}',
  });

  const startOutput = await client.send(startCommand);
  expect(startOutput.status).toBe("SUCCEEDED");
});
```

So pay close attention to the way I'm starting the State Machine. You'll see a lot of info on the internet about not being able to run StartSync with the local container. That's not true anymore. The first gripe you'll find is that it doesn't support it. IT DOES. The second one is that StartSync appends `sync-` to the host for your endpoint. And when adjusting your endpoint for local runs, it would append `sync-http://localhost`. That's not a valid endpoint.

After some digging through the GitHub repository and reading that this support was in the Java SDK, I found the option. In the client setup, make sure you set `disableHostPrevix: true`

```typescript
const client = new SFNClient({
  region: "us-west-2",
  endpoint: "http://localhost:8083",
  disableHostPrefix: true, // &lt;----- HERE
});
```

A run of the suite will look like this

![Jest Run Local](/images/jest.png)

So when testing Step Function workflows locally, I can use the same tooling that I am used to.

- Docker
- CDK and TypeScript
- Bring my testing framework and tooling
- AWS SDK that works locally and in the cloud

## Putting it all Together

Testing Step Function workflows locally is amazing and adds so many checks to my local development workflow. And that is a good thing for sure. But what if I wanted to go a step further? What if I wanted to introduce this into my CI/CD pipeline for developing my infrastructure?

Let's do just that! Let's add the L3 Construct called CDK Pipelines into the mix. If you aren't familiar, [here](https://binaryheap.com/cdk-pipelines-the-construct/) is a quick primer.

The pipeline code looks like this.

```typescript
export class PipelineStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);
        const pipeline = new CodePipeline(this, &quot;Pipeline&quot;, {
            pipelineName: &quot;SamplePipeline&quot;,
            dockerEnabledForSynth: true,
            synth: new ShellStep(&quot;Synth&quot;, {
                input: CodePipelineSource.gitHub(
                    &quot;benbpyle/cdk-step-functions-local-testing&quot;,
                    &quot;main&quot;,
                    {
                        authentication: SecretValue.secretsManager(
                            &quot;sf-sample&quot;,
                            {
                                jsonField: &quot;github&quot;,
                            }
                        ),
                    }
                ),
                commands: [
                    &quot;npm i&quot;,
                    &quot;npm i cdk-asl-definition-extractor -g&quot;,
                    &quot;make test-start-local&quot;,
                ],
            }),
            synthCodeBuildDefaults: {
                buildEnvironment: {
                    buildImage: LinuxBuildImage.STANDARD_6_0,
                    environmentVariables: {
                        DOCKERHUB_USERNAME: {
                            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                            value: &quot;dockerhub:username&quot;,
                        },
                        DOCKERHUB_PASSWORD: {
                            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                            value: &quot;dockerhub:password&quot;,
                        },
                    },
                },
                partialBuildSpec: BuildSpec.fromObject({
                    phases: {
                        install: {
                            &quot;runtime-versions&quot;: {
                                nodejs: &quot;16&quot;,
                            },
                            commands: [
                                &quot;docker login --username $DOCKERHUB_USERNAME --password $DOCKERHUB_PASSWORD&quot;,
                            ],
                        },
                    },
                }),
            },
        });

        pipeline.addStage(new PipelineStage(this, &quot;PipelineStage&quot;));
    }
}

```

Few things to point out. First, the synth step is pulling from GitHub with the Personal API Key fetched from AWS Secrets Manager

```typescript
input: CodePipelineSource.gitHub(
    &quot;benbpyle/cdk-step-functions-local-testing&quot;,
    &quot;main&quot;,
    {
        // the IAM policy gets added by default
        authentication: SecretValue.secretsManager(
            &quot;sf-sample&quot;,
            {
                jsonField: &quot;github&quot;,
            }
        ),
    }
),

```

Second, I'm adding in the dependency for my NPM package mentioned above and then running this `Make` command

```typescript
commands: [
    "npm i",
    "npm i cdk-asl-definition-extractor -g",
    "make test-start-local",
],

```

Third, the `Make` command just runs the steps I've outlined above

```bash
test-start-local:
    npx cdk synth --quiet # build
    docker-compose up -d --quiet-pull # run the containers
    sleep 10 # pause to let localstack startup
    node scripts/index.js # a runner for posting the state machine into the local container
    npm run test-sf # executes the Jest tests
    make test-end-local # teardown

```

The steps are easy enough to follow but to document them they are:

1.  Run synth and build the CloudFormation output
2.  Bring up the Localstack and Step Functions local containers
3.  Slight pause ... this is for Localstack
4.  Run a script to POST in the State Machine Definition
5.  Run the tests we just looked at above
6.  Teardown the infra

To push this up to your AWS environment, run `cdk deploy` (after you've bootstrapped of course) and off you go. It should end up looking like the below

![CDK Pipeline](/images/local-pipeline.png)

A deeper dive into the Build step will yield logs that show that your tests were run.

![CodeBuild Testing Step Functions Locally](/images/code-build.png)

Additionally, I wanted to be able to bypass some of the Docker pull limits and take advantage of Node 16 support, so I made these changes to the CodeBuild Definition. Notice that I'm using SecretsManager again for pulling out my sensitive Docker credentials like the GitHub Personal Access Token. Such a cool service.

```typescript
synthCodeBuildDefaults: {
    buildEnvironment: {
        buildImage: LinuxBuildImage.STANDARD_6_0,
        environmentVariables: {
            DOCKERHUB_USERNAME: {
                type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                value: &quot;dockerhub:username&quot;,
            },
            DOCKERHUB_PASSWORD: {
                type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                value: &quot;dockerhub:password&quot;,
            },
        },
    },
    partialBuildSpec: BuildSpec.fromObject({
        phases: {
            install: {
                &quot;runtime-versions&quot;: {
                    nodejs: &quot;16&quot;,
                },
                commands: [
                    &quot;docker login --username $DOCKERHUB_USERNAME --password $DOCKERHUB_PASSWORD&quot;,
                ],
            },
        },
    }),
},

```

## Verifying the State Machine was Deployed

The very last piece of this sage is to verify that our CodePipeline pushed our State Machine out correctly.

And there it is! With the Workflow

![Verified](/images/state-machine.png)

![State Machine Workflow](/images/local-workflow.png)

We've come full circle!

## Wrapping Up

If you've been following along for this whole journey, here's the [GitHub repository](https://github.com/benbpyle/cdk-step-functions-local-testing) as your reward that you can fork, pull or whatever to play around with this code.

I hope that you can how testing Step Function workflows locally is not only possible but can also be included in your CI/CD platform. And by using the tooling that you are most comfortable with you can gain efficiencies in implementing something like this. I know for certain that being able to test locally has made a lot of difference for me personally in terms of efficiency and developer experience.

Hope you enjoyed the read and find this helpful!
