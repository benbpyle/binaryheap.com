---
title: Golang Private Module with CDK CodeBuild
author: "Benjamen Pyle"
description: "Even experienced builders run into things from time to time that they haven't seen before and this causes them some trouble. I've been working with CDK, CodePipeline, CodeBuild and Golang for several"
pubDatetime: 2023-05-06T00:00:00Z
tags:
  - aws
  - cdk
  - golang
  - infrastructure
  - programming
draft: false
---

Even experienced builders run into things from time to time that they haven't seen before and this causes them some trouble. I've been working with [CDK](https://binaryheap.com/intro-to-cdk/), [CodePipeline](https://binaryheap.com/cdk-pipelines-the-construct/), CodeBuild and Golang for several years now and haven't needed to construct a private Golang module. That changed a few weeks ago and it threw me, as I needed to also include it in a CodePipeline with a CodeBuild step. This article is more documentation and reference for the future, as I want to share the pattern learned for building Golang private modules with CodeBuild.

## Solution Diagram

For reference, here is the solution diagram that I'll be referencing throughout the article. For the infrastructure, I'll be using CDK with TypeScript.

![Building Golang private modules CodeBuild](/images/Private_Repos.png)

### The Pipeline

Let's walk through the CodePipeline that'll be responsible for receiving changes from GitHub and then running the build and deployment.

```typescript
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const pipeline = new CodePipeline(this, "Pipeline", {
      pipelineName: "SamplePipeline",
      dockerEnabledForSynth: true,
      synth: new CodeBuildStep("Synth", {
        input: CodePipelineSource.gitHub(
          "benbpyle/cdk-step-functions-local-testing",
          "main",
          {
            authentication: SecretValue.secretsManager("sf-sample", {
              jsonField: "github",
            }),
          }
        ),

        buildEnvironment: {
          buildImage: LinuxBuildImage.STANDARD_6_0,
          environmentVariables: {
            GITHUB_USERNAME: {
              value: "benbpyle",
              type: BuildEnvironmentVariableType.PLAINTEXT,
            },
            GITHUB_TOKEN: {
              value: "sf-sample:github",
              type: BuildEnvironmentVariableType.SECRETS_MANAGER,
            },
          },
        },
        partialBuildSpec: BuildSpec.fromObject({
          phases: {
            install: {
              "runtime-versions": {
                golang: "1.18",
              },
            },
          },
        }),

        commands: [
          'echo "machine github.com login $GITHUB_USERNAME password $GITHUB_TOKEN" >> ~/.netrc',
          "npm i",
          "export GOPRIVATE=github.com/benbpyle",
          "npx cdk synth",
        ],
      }),
    });

    pipeline.addStage(new PipelineAppStage(this, `Deploy`, {}));
  }
}
```

I want to break down a few of the components of this.

#### The Source Action

I'm using a GitHub source and SecretsManager for storing a Personal Access Token that will handle changes and pulling the source into the CodeBuild step

```typescript
input: CodePipelineSource.gitHub(
    "benbpyle/cdk-step-functions-local-testing",
    "main",
    {
        authentication: SecretValue.secretsManager(
            "sf-sample",
            {
                jsonField: "github",
            }
        ),
    }
),

```

#### Build Step

The build step also needs to have access to the SecretsManager. I'll explain that in the `commands` block below. The BuildEnvironment allows me to set the build image and then environment variables. By using SecretsManager I can keep that access token hidden from view yet have access to it in the build. CodeBuild also does a nice job of masking `*****` the value if you try and `echo` it out.

```typescript
buildEnvironment: {
    buildImage: LinuxBuildImage.STANDARD_6_0,
    environmentVariables: {
        GITHUB_USERNAME: {
            value: "benbpyle",
            type: BuildEnvironmentVariableType.PLAINTEXT,
        },
        GITHUB_TOKEN: {
            value: "sf-sample:github",
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
        },
    },
},

```

#### Build Commands

The crux of this pattern is that I'm using the `~/.netrc` file to store my GitHub PAT for logging in when Golang issues the command to pull from GitHub. For more on `~/.netrc`, here's a link to [GNU](https://www.gnu.org/software/inetutils/manual/html_node/The-_002enetrc-file.html). And for reading how [Golang Modules](https://go.dev/blog/using-go-modules) work

```typescript
commands: [
    'echo "machine github.com login $GITHUB_USERNAME password $GITHUB_TOKEN" >> ~/.netrc',
    "npm i",
    "export GOPRIVATE=github.com/benbpyle",
    "npx cdk synth",
],

```

When the `npx cdk synth` command gets run, it'll find that there is a Golang function in the Stack and `go mod tidy` will be executed which initiates the pull from the dependencies. The other key piece is that I'm setting the `$GOPRIVATE` environment variable which tells go to not use the public package registry and pull packages from these specific locations. This variable can be a top-level path or it can a comma-separated list. [An article](https://go.dev/doc/go1.13) that describes its usage when it was released several Golang versions ago.

#### Deployment

For this example, I've got a single Stage that I'm deploying out to but in a production use case, you'd have your Dev, Test, Pre-Prod, Prod etc environments.

```typescript
// The stage
export class PipelineAppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: cdk.StageProps) {
    super(scope, id, props);

    new MainStack(this, `App`, {});
  }
}

// MainStack
export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    new ExampleFunc(this, "ExampleFunc");
  }
}

// Function Definition
export class ExampleFunc extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new GoFunction(scope, `ExampleFuncHandler`, {
      entry: path.join(__dirname, `../../../src/example-func`),
      functionName: `example-func`,
      timeout: Duration.seconds(30),
      bundling: {
        goBuildFlags: ['-ldflags "-s -w"'],
      },
    });
  }
}
```

Not much to discuss here, but you can see the definitions of the:

- AppStage
- MainStack
- ExampleFunc

Bringing it all together, adding the stage to the Pipeline

```typescript
pipeline.addStage(new PipelineAppStage(this, `Deploy`, {}));
```

### Building Golang private modules with CodeBuild

Golang leverages a `go.mod` file and a `go.sum` file that stores the dependencies, the versions and the checksum of those dependencies. You also have direct and indirect dependencies listed if your code imports something directly or something your code imports has that dependency.

The `go.mod` file for this example looks like this.

I've got dependencies on

- AWS
- Sirupsen (logrus)
- My personal private library

```go
module example

go 1.18

require (
    github.com/aws/aws-lambda-go v1.40.0
    github.com/sirupsen/logrus v1.9.0
)

require (
    github.com/benbpyle/golang-private-sample v0.0.0-20230506132255-dc7062e24dff
    github.com/stretchr/testify v1.8.2
    golang.org/x/sys v0.7.0
)

```

And the handler code references those things in the `go.mod` file and just prints out the message

```go
package main

import (
    "context"

    "github.com/aws/aws-lambda-go/lambda"
    s "github.com/benbpyle/golang-private-sample"
    "github.com/sirupsen/logrus"
)

func main() {
    lambda.Start(handler)
}

func handler(ctx context.Context, event interface{}) error {
    logrus.Info("Logging out the handler")

    s.TestMe("the handler")

    return nil
}

```

## Wrap Up

Putting this all together will give you the ability to have some level of privacy in your Golang modules if you need to. And when building Golang private modules with CodeBuild, you can include this easily into your pipelines with CDK, Terraform or native CloudFormation. This approach will work too if you are using another CI/CD execution framework than CodePipeline.

As always, the source code for this article is available on [GitHub](https://github.com/benbpyle/cdk-golang-private-module). Feel free to clone it and try it out. But note that you won't have access to the following.

- Replace my private repos with yours
- The `sf-sample` Secret is one I created, you'll need to create your own

Enjoy and happy building!
