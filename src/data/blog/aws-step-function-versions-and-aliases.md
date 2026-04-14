---
title: AWS Step Function Versions and Aliases
author: "Benjamen Pyle"
description: "Up until last week, when you deployed a new version of your State Machine in AWS Step Functions, the old version was gone and the ability to test or rollback was limited by your ability to re-push a p"
pubDatetime: 2023-06-27T00:00:00Z
tags:
  - aws
  - infrastructure
  - programming
  - sam
  - serverless
draft: false
---

Up until last week, when you deployed a new version of your State Machine in AWS Step Functions, the old version was gone and the ability to test or rollback was limited by your ability to re-push a previous commit. However, [AWS has rolled out Step Function Versions and Aliases](https://aws.amazon.com/blogs/compute/deploying-state-machines-incrementally-with-versions-and-aliases-in-aws-step-functions/) so that you can accomplish just those tasks. Creating a unique combination of a version and ASL gives you the ability to use things like Deployment Preferences to accomplish Canary or Linear-type deployments. In the below article, I'm going to walk you through Step Function Versions and Aliases.

## Disclaimer

First up, I'm going to be using [SAM](https://aws.amazon.com/serverless/sam/) to build the infrastructure. I think this is the first SAM-based deployment article I've written. I know this makes [Allen Helton](https://www.readysetcloud.io/blog/) super happy. Second, I know the article from AWS says support for SAM and [CDK](https://binaryheap.com/intro-to-cdk/), but they haven't rolled this in as of the writing of this article. However, I'm using the SAM Nightly Builds and it does include the Transforms to make this happen. I could spend another few articles describing SAM and perhaps I will dig deeper later, but for now, here's the [AWS Docs](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-aws-serverless.html) on transforms.

## Step Function Versions and Aliases

For starters, these two concepts are very similar to how they work with Lambda Functions. A version is nothing more than a unique package of your workflow with a number associated with it. That version can be run via the console or the API just like you'd run the `latest` tag that's associated with a Lambda. Then you have an alias. This is nothing more than a pointer to a version that can also include routing type information. This is helpful when managing traffic that is supplied to your state machine. AWS did a nice job of visualizing these concepts with the images below

#### Alias

![Alias](/images/alias.png)

#### Version

![Version](/images/version.png)

## Sample Code

With this sample, I'm going to build a basic State Machine that has a `choice` and then based on the value, will either `Succeed` or `Fail` the machine. Then I'll show you how using Step Function Versions and Aliases can help prevent bad code from your environment./

![Choice Workflow](/images/choice_workflow.png)

What I'm going to demonstrate is how you can use DeploymentPreferences to protect your State Machines from a faulty definition by changing the `choice` selections to fail when the same input is supplied due to an error in the code.

The ASL for the workflow will start like this

```json
{
  "StartAt": "Basic Choice",
  "States": {
    "Basic Choice": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.type",
          "StringEquals": "B",
          "Next": "Passed"
        },
        {
          "Variable": "$.type",
          "StringEquals": "C",
          "Next": "Passed"
        },
        {
          "Variable": "$.type",
          "StringEquals": "D",
          "Next": "Passed"
        },
        {
          "Variable": "$.type",
          "StringEquals": "A",
          "Next": "Failed"
        }
      ]
    },
    "Passed": {
      "Type": "Succeed"
    },
    "Failed": {
      "Type": "Fail"
    }
  },
  "TimeoutSeconds": 30
}
```

Now let's walk through the SAM Template to build and deploy the infrastructure.

### SAM Template

#### State Machine

```yaml
AliasStateMachine:
  Type: AWS::Serverless::StateMachine
  DependsOn: StateMachineLogGroup
  Properties:
    Type: EXPRESS
    AutoPublishAlias: "main"
    Name: "SampleAliasMachine"
    DefinitionUri: statemachine/alias.asl.json
    Role:
      Fn::GetAtt: [StatesExecutionRole, Arn]
    Logging:
      Destinations:
        - CloudWatchLogsLogGroup:
            LogGroupArn: !GetAtt StateMachineLogGroup.Arn
      IncludeExecutionData: True
      Level: ALL
    DeploymentPreference:
      Alarms:
        - !Ref AliasStateMachineFailureAlarm
      Interval: 2
      Percentage: 50
      Type: LINEAR
```

So if you've built a State Machine before with SAM, some of this will look pretty standard. Bonus points if you've built a Lambda with SAM because the DeploymentPreference section should also look familiar. The things to take note of though are this.

- `AutoPublishAlias`: this will automatically create the alias for you and keep it up to date with the latest version
- `DeploymentPreference`: if you view the spec, it requires a Version, but when using it in SAM like this, the version will get added for you in the transform so no worries.

Running `sam deploy` will produce the following State Machine Alias setup.

![Version 1](/images/version_1.png)

### Deployment Alarm

Looking further at the DeploymentPreference, there is an Alarm defined in there. That alarm is watching for the FailedExecutions metric. This could be a metric used for other purposes, but in this article's case, it's to manage when to roll back. The definition takes this shape.

```yaml
AliasStateMachineFailureAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: Invocation alarm for Alias State Machine
    Namespace: AWS/States
    MetricName: ExecutionsFailed
    Dimensions:
      - Name: StateMachineArn
        Value: !Ref AliasStateMachine
      - Name: Alias
        Value: "main"
    Statistic: Sum
    ComparisonOperator: GreaterThanOrEqualToThreshold
    Threshold: 1
    EvaluationPeriods: 1
    Period: 300
    TreatMissingData: notBreaching
```

Building a CloudWatch alarm is about defining what metric to watch for, which dimensions or criteria are you paying attention to, what period to evaluate, how to evaluate missing data, what is the calculation and what's the comparator. With this release from AWS, they've also rolled out CloudWatch Step Function dimensions for Version and Alias. The alarm defined above does this:

- Sum the number of FailedExecutions over 5 minutes
- Filter those by the ARN of the State Machine and by the Alias supplied
- Treat no data as "OK"
- Compare that SUM that if it's >= 1 then ALARM

## Testing the Workflow

With the State Machine deployed at Version 1, I can now test that my workflow is as I intend and then show you how to use Step Function Versions and Aliases when the workflow is not good.

```bash
aws stepfunctions start-execution --state-machine-arn arn:aws:states:::stateMachine:SampleAliasMachine:main --input "{\"type\": \"B\"}"

```

![Choice Pass](/images/choice_pass.png)

This is going to run through the `Choice` step and trigger a `Succeed` because "B" is a passing type.

But let's for the sake of testing the deployment say that we change the workflow to the following defect and now "B" triggers a `Fail`. We could have executions and customer impacts because the State Machine that was working is now failing. This is where the `DeploymentPreference` and the Alarm come into play.

![Choice Pass](/images/choice_fail.png)

```json
{
  "Variable": "$.type",
  "StringEquals": "B",
  "Next": "Failed"
}
```

This could be bad, but thankfully when deploying, in this example, I'm using a LINEAR style deployment where traffic is weighted 50/50 for 2 minutes to monitor for issues and then the rest of the traffic is switched over to the new version should everything look good. [This article](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-cd-aliasing-versioning.html) will explain more of the options.

The Routing will look like this when it's happening.

![Routing](/images/deployment.png)

And if you run the failing choice while the deployment is happening, it will be automatically rolled back.

![Rollback](/images/deployment_failure.png)

## Wrap Up

My first thoughts when using this capability were how have I been using Step Functions without Versions and Aliases the whole time? But then as a stepped back, Lambda went through the same type of transition where you just always overwrote the existing function and didn't do much canary or linear type rollouts. I have a feeling that I'm not going to use this technique for everything but for mission-critical workflows, it's going to be a requirement.

If you are going to invest in leveraging Step Functions and ultimately in a deployment pipeline to manage releases, the automated verification before releasing to your customers is a critical step for zero downtime deployment. It is also a critical piece of continuing beyond just CI and moving towards a CD-style world. Step Function Versions and Aliases will help you get there.

Feel free to clone the [repository](https://github.com/benbpyle/stepfunctions-alias-sam) which is a full working sample of what I've shown above. Hopefully, it gets you started on this journey. And as always, I'd love to hear feedback!
