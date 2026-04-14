---
title: Canary Deployment for AWS Lambda
author: "Benjamen Pyle"
description: "In life, when working on anything, small and iterative changes give us the best opportunity for feedback and learning. And it's through that feedback and failure even that we get better. The same thin"
pubDatetime: 2023-03-06T00:00:00Z
tags:
  - aws
  - golang
  - infrastructure
  - serverless
draft: false
---

In life, when working on anything, small and iterative changes give us the best opportunity for feedback and learning. And it's through that feedback and failure even that we get better. The same thing can be applied to building software. Small, iterative and independent deploys help us as builders understand if we've built the right thing and architected it correctly to handle the conditions asked of it. A technique called Canary Deployment is a popular model and the article below will demonstrate how to perform Canary Deployment for AWS Lambda

However, when deploying more frequently, we also need to do it safely. Shipping unfinished or potentially risky changes can have a big impact on our user base. No one wants to be in the middle of using your software only to be interrupted by a bad change. While we can't be perfect in our ability to predict the impact or blast radius of a change, we can make it so that if the deploy shows signs of not being good, we can roll that change back without the need for human intervention.

When deploying AWS Lambda functions you have a few options for how you want to deploy the code into the live environment. Just to touch on them before diving in a little deeper

- All At Once -- what it sounds like. Full replacement of old code
- Canary - Deploy and route a percentage of traffic and then fully cut over in the future
- Linear - Deploy and route increments of traffic spread across increments of time

For the sake of this article I'm going to focus on using a Canary strategy but I'll point out where you can adjust based upon your needs. In addition, you want a more robust pipeline to run these deploys. For an example of how to setup CDK Pipelines as that mechanism, here's an [article](https://binaryheap.com/cdk-pipelines-the-construct/) for that

## Canary Deployment for AWS Lambda Setup

For this example, I'll be using the following bits of tech to demonstrate

- CDK (TypeScript)
- Golang for the Lambda
- Deploying locally up to AWS but could easily be put into a pipeline.

### Basic CDK Code

The `app.ts` file is pretty straightforward. I'm doing local deployments so running from your terminal will build up the necessary resources. You can run it like `cdk deploy --profile=<your-aws-profile>`

```typescript
#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { MainStack } from "../lib/main-stack";

const app = new cdk.App();
new MainStack(app, "LambdaDeploymentSample");
```

The above simple creates a new instance of the MainStack class. It's pretty basic as well and looks like the below

```typescript
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { HandlerFunc } from "./queue-handler-func";

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const handler = new HandlerFunc(this, "HandlerFunc");
  }
}
```

The MainStack extends `cdk.Stack` and provides the basis for building other infrastructure components. In this case, a simple `HandlerFunc` is all that's constructed

Let's have a look at the `HandlerFunc` code and see what gets put together. I'm going to break this down in blocks, so if you want to look at the code in its entirety, you check out the link to the Github repos at the bottom.

First off, I'm creating a Lambda that's deployed with Golang runtime referenced from `@aws-cdk/aws-lambda-go-alpha`

```typescript
const func = new GoFunction(scope, "Function", {
  entry: path.join(__dirname, "../src/one"),
  functionName: "sample-handler",
  timeout: Duration.seconds(30),
  environment: {},
});
```

With the function created, I'm going to use a couple of properties of Lambdas that I don't know that people use very often. First is the version and next is the alias

```typescript
const version = new Date().toISOString();
const aliasName = "main";
Tags.of(func).add("version", version);

const stage = new Alias(scope, "FunctionAlias", {
  aliasName: aliasName,
  version: func.currentVersion,
});
```

#### Versions

Versions are pretty much what you think they are. Copies of your code that is deployed and marked with a number or a string; however you want to tag them. I often use versions in tags as well as it can give you another piece of data to query and look at logs with

#### Aliases

Aliases can be thought of as (Lambda) function pointers. No, not `*` kind of pointers, but references to specific deployment versions of your Lambda. In our scenario with Canary deployments, we will have an alias called **main** with mutliple versions they get different _weights_ which means that so much traffic is flowing to one version while the other target gets the balance of the traffic

#### Pipeline Alarming

Next up is creating an alarm. This alarm exists to tell your deployment **when** to rollback your code if that's your desire. I've got a pretty simple alarm built purely for example. You could obviously extend it and make it more robust if you wish.

```typescript
const failureAlarm = this.createFailureAlarm(
  scope,
  "LambdaFailure",
  func,
  aliasName
);

// further down in the class
createFailureAlarm = (
  c: Construct,
  id: string,
  func: GoFunction,
  funcAlias: string
): Alarm => {
  return new Alarm(c, id, {
    alarmDescription: "The latest deployment errors > 0", // give the alarm a name
    metric: new Metric({
      metricName: "Errors", // summing up the errors
      namespace: "AWS/Lambda", // aws namespace
      statistic: "sum",
      dimensionsMap: {
        Resource: `${func.functionName}:${func.currentVersion}`,
        FunctionName: func.functionName,
      },
      period: Duration.minutes(1),
    }),

    threshold: 1, // only want 1 error.  that's too many
    evaluationPeriods: 1, // how many periods to eval
  });
};
```

The definition is super simple. I gie it a name, declare it against the function I built above and the alias name that is important to me.

#### Deployment Group

Lastly, I've got to build the deployment group. Here is some good [AWS Documentation](https://docs.aws.amazon.com/codedeploy/latest/userguide/applications-create-lambda.html) on setting up CodeDeploy deployment groups. Like I mentioned at the beginning of the article, I'm going to show you Canary deployments, but there are others you can explore. And with Deployments you can use things like Triggers to test your deployment in an automated fashion to gain the comfort that you aren't siulating "live" customers against your new function but you could actually have synthetic traffic handle the tests.

```typescript
new LambdaDeploymentGroup(scope, "CanaryDeployment", {
  alias: stage,
  deploymentConfig: LambdaDeploymentConfig.CANARY_10PERCENT_5MINUTES,
  alarms: [failureAlarm],
});
```

Pretty simple stuff. What's the `stage` as defined above. Then the Config is a [LambdaDeploymentConfig](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_codedeploy.LambdaDeploymentConfig.html). Explore that documentation for more for the options on rollout and triggers. And then the alarm. Notice that it's an `[]` so you could have multiple alarms required to be failing for it to matter. For instance, failure, latency or others could be combined.

### Lambda Golang Code

There is really not a lot to look at here but for completeness here is the src for the lambda.

```go
package main

import (
    "context"
    "errors"

    "github.com/aws/aws-lambda-go/lambda"
    log "github.com/sirupsen/logrus"
)

func handler(ctx context.Context, event interface{}) error {
    log.SetFormatter(&log.JSONFormatter{})

    log.WithFields(log.Fields{
        "event": event,
    }).Info("Printing out the handler")

    // nothing to see here
    return nil
}

func main() {
    lambda.Start(handler)
}
```

### Putting the Deployment it Together

#### Running Deploy

When running Canary Deployment for AWS Lambda, the code is being deployed you'll see that there are 2 versions that currently exist. The previous version and then the new version that is being launched.

Because I chose `LambdaDeploymentConfig.CANARY_10PERCENT_5MINUTES`, 10% of the traffic will be used to test the quality of the code before rolling all of it live. The AWS Console will show you this

![Canary release](/images/during_deploy.png)

#### Deployment Success

And when you have success, the CodeDeploy Console will show you this

![Deployment succeeded](/images/success_deployment.png)

Pretty cool. Everything is happy and solid.

#### Breaking the Pipeline while running

Like I mentioned above, Triggers in the CodeDeploy are the way to go. I'll do a future article about how to add this in, but for now, I'm going to simulate failure by just deploying the code in a state that is "broken"

```
package main

import (
    "context"
    "errors"

    "github.com/aws/aws-lambda-go/lambda"
    log "github.com/sirupsen/logrus"
)

func handler(ctx context.Context, event interface{}) error {
    log.SetFormatter(&log.JSONFormatter{})

    log.WithFields(log.Fields{
        "event": event,
    }).Info("Printing out the handler")

    // breaking this on purpose
    return errors.New("failing on purpose")
}

func main() {
    lambda.Start(handler)
}
```

While this code is deploying I'm going to just call the function a few times from the console

![Lambda failure](/images/fail_testing.png)

And when that happens, the alarm will go into a **triggered** state and the deploy will rollback and the CloudFormation will fail

![Deployment failure](/images/failure_deployment.png)

Super simple and super powerful. New code that goes in clean if things look clean and rolls itself back if things don't look good. There is value in putting together good triggers and tests to validate this as it'll save you a ton of pain if it even catches one issue against live data. And having the rollback be automatic based upon the conditions you coded for is super helpful!

### Wrap Up

I hope you've seen the power of using Canary Deployment for AWS Lambda and that I've shown you a few options you can leverage to make it easier on your DevOps team and other developers that are responsible for supporting new rollouts. This article has covered a good bit of code, and as always, feel free to fork or clone the [Github repos](https://github.com/benbpyle/cdk-lambda-deployment-group) as you'd like.

I'm going to continue this with some discussion triggers in an upcoming article but for now this should get you going on safer code deploys with Lambdas.
