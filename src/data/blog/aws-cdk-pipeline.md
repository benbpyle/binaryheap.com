---
title: AWS CDK Pipeline
author: "Benjamen Pyle"
description: AWS CDK Pipelines construct provides an opinionated CI/CD pipeline with self-mutation, cross-account deploys, and automatic source monitoring.
pubDatetime: 2022-11-28T00:00:00Z
tags:
  - aws
  - cdk
  - infrastructure
  - programming
draft: false
---

Deploying code (assets) into AWS has never been easier than it is right now. A few months back our engineering team made the decision to go all in on AWS CDK and with that included the need/desire for full pipeline automation. We'd been using a smattering of Python/Node, CloudFormation and CodeCommit plus CodePipeline code for all of our services and honestly it works fine once it's set but getting it set per service became a pain. And honestly making modifications for idiosyncrasies for some of the services just was plain awful. So off we went and during that exploration phase we found the opinionated little construct called AWS CDK Pipelines. Below our walk through what it all meant for us.

To quote the CDK Documentation

> CDK Pipelines is an opinionated construct library. It is purpose-built to deploy one or more copies of your CDK applications using CloudFormation with a minimal amount of effort on your part. It is not intended to support arbitrary deployment pipelines, and very specifically it is not built to use CodeDeploy to applications to instances, or deploy your custom-built ECR images to an ECS cluster directly: use CDK file assets with CloudFormation Init for instances, or CDK container assets for ECS clusters instead.
>
> https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html

## So why AWS CDK Pipelines

If you are first on the fence about CDK, have a read [here](https://binaryheap.com/intro-to-cdk/) first. But if not, continuing with AWS CDK Pipelines you get a bunch of boilerplate items taking care of for you. For instance

- Source / Commit monitoring
- Build and synth phase which generates your artifacts
- Self updating pipeline (I'll explain more)
- Bundling and staging of the artifacts (including encryption)
- Deployment of these artifacts to any number of environments you wish either sequentially or in "waves"

When put together in CodePipeline it looks like the following ...

![AWS CDK Pipeline Source
](/images/pipeline-1-1024x622.jpg)

![AWS CDK Pipeline Build](/images/pipeline-2-1024x622.jpg)

![AWS CDK Pipeline Deploy](/images/pipeline-3-1024x622.jpg)

Pretty neat right? We get a consistent and repeatable way to deploy code. This is the "shell" of the construct which then gives developers and cloud ops engineers the foundation to have those nuances in their individual services. At the core though is this pipeline that simple

- Responds to commits
- Builds
- Bundles
- Deploys

And the final point I'll make on the pipeline ease is that once you deploy the initial pipeline, any change you wish to make like adding new stages or targets are a simple commit to the repo which automatically gets deployed out as updates.

## Setting up an AWS CDK Pipeline

The steps that we take to configure a pipeline are very straightforward. We build out a stack that is the pipeline, deploy that up locally to AWS (once) and that's it. The pipeline is up and live and ready for the team to modify their infra. So what does that look like?

```
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {PipelineStack} from "../lib/pipeline-stack";
import { getConfig } from './config';
import {AppStack} from "../lib/app-stack";

const app = new cdk.App();
const config = getConfig('main', 'SampleStack');

new PipelineStack(app, `${config.stackNamePrefix}-${config.stackName}-PipelineStack`, {
    env: {
        account: config.toolsAccount,
        region: config.defaultRegion
    },
    options: config,
    pipelineName: `${config.stackNamePrefix}-${config.reposName}-pipeline`,
});

```

What the above does is creates a CDK App that houses the main stack and then it's deployed with. And the pipeline stack looks like this below

```
import * as cdk from 'aws-cdk-lib';
import {StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Repository} from "aws-cdk-lib/aws-codecommit";
import {CodePipeline, CodePipelineSource, ShellStep} from "aws-cdk-lib/pipelines";
import {Options} from "../types/options";
import {Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {PipelineAppStage} from "./pipeline-app-stage";

interface PipelineStackProps extends StackProps {
    options: Options,
    pipelineName: string,
}

export class PipelineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: PipelineStackProps) {
        super(scope, id, props);

        const repos = Repository.fromRepositoryArn(this, `${props?.options.stackNamePrefix}-${props?.options.stackName}-repository`, `arn:aws:codecommit:${props?.options.defaultRegion}:${props?.options.codeCommitAccount}:${props?.options.reposName}`);
        const pipeline = new CodePipeline(this, `${props?.options.stackNamePrefix}-${props?.options.stackName}-Pipeline`, {
            crossAccountKeys: true,
            selfMutation: true,
            pipelineName: props?.pipelineName,
            dockerEnabledForSynth: true,
            synth: new ShellStep('Synth', {
                input: CodePipelineSource.codeCommit(repos, 'main'),
                commands: [
                    'npm ci',
                    'npm run build',
                    'npx cdk synth'
                ],
            })
        });

        pipeline.addStage(new PipelineAppStage(this, `${props?.options.stackNamePrefix}-${props?.options.stackName}-DevDeploymentStage`, {
            options: props.options,
            env: {account: props?.options?.devAccount, region: props?.options?.defaultRegion}
        }));
    }
}
```

Let me walk through what some of this does

Create a repository object so that the pipeline can build its source stage. If you notice all of the "stackNamePrefix" stuff littered in the code that's because I like the idea of being able to deploy multiple versions of the stack based upon say a branch or a commit. This gives teams the ability to play and test infra changes if they want without disrupting mainline changes

```
 const repos = Repository.fromRepositoryArn(this, `${props?.options.stackNamePrefix}-${props?.options.stackName}-repository`, `arn:aws:codecommit:${props?.options.defaultRegion}:${props?.options.codeCommitAccount}:${props?.options.reposName}`);

```

The pipeline itself I'll walk through few pieces inline with comments

```
const pipeline = new CodePipeline(this, `${props?.options.stackNamePrefix}-${props?.options.stackName}-Pipeline`, {
            crossAccountKeys: true, // use this if you need cross account KMS sharing
            selfMutation: true, // adds the self update step we've talked about
            pipelineName: props?.pipelineName, // name of the pipeline
            dockerEnabledForSynth: true, // if your build needs docker
            synth: new ShellStep('Synth', { // this is the build ... replaces the buildspec.yaml
                input: CodePipelineSource.codeCommit(repos, 'main'),
                commands: [
                    'npm ci',
                    'npm run build',
                    'npx cdk synth'
                 ],
            })
        });
```

Now to add a stage so that we deploy to an environment

```
pipeline.addStage(new PipelineAppStage(this, `${props?.options.stackNamePrefix}-${props?.options.stackName}-DevDeploymentStage`,
    {
        options: props.options,
        env: {account: props?.options?.devAccount, region: props?.options?.defaultRegion}
    }
));
```

What the above does is take the pipeline and creates a "stage" which is essential an account or environment you wish to deploy out too. The "env" field on the stage properties let's you define that. Additionally you probably notice I'm passing around this Options property. It's just a global setup that carries data I need in the pipeline. The type looks like this

```
export enum StageEnvironment {
    DEV = 'Dev',
    QA = 'Qa',
    STAGING = 'Staging',
    PROD = 'Prod',
    LOCAL = 'Local',
}

export type Options = {
    defaultRegion: string,
    stackNamePrefix: string,
    stackName: string,
    codeCommitAccount: string,
    toolsAccount: string,
    reposName: string,
    devAccount: string,
    qaAccount: string,
    stagingAccount: string,
    productionAccount: string,
    cdkBootstrapQualifier: string,
    pipelineName: string,
};
```

So that's a lot to digest I know but once you've got that, you can run the below command to get the pipeline deployed

```
cdk deploy --all -a "npx ts-node bin/app.ts"
```

## Wrap up

I want to wrap up with a few points and then give you some next steps when using AWS CDK Pipelines

First, The local deploy thing seems like a bummer when you start but there are things that are "prep" that need to be done once for each repos/pipeline. I'm going to write a subsequent article about cross account CodeCommit and how you trigger a pipeline say in a "Tools" account when the code is in a "CodeCommit" account. This split in accounts is helpful for permission isolation. I also won't cover Github as we really don't use that service day to day

Second, all of the above was in Typescript but you could build it in any of the languages I mentioned an article ago. Go, Java, C# and others. Have a look if that interests you.

Lastly, the CDK Documentation is fantastic and here's the link into the CDK Pipeline docs. It's got a few good examples and some class definitions. It does not cover the things like cross account CodeCommit, certain other gotchas with permissions as well. Big shoutout to our AWS support folks that we've been able to converse with as well along our journey. [CDK Documentation](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html)

## Up Next

I'm going to continue diving into CDK and showing/highlighting some of the beauties that we've found. I also plan to get into some Serverless and HealthLake as well.
