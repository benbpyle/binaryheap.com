---
title: Intro to CDK
author: "Benjamen Pyle"
description: introduction to aws cdk with typescript
pubDatetime: 2022-11-19T00:00:00Z
tags:
  - aws
  - cdk
  - infrastructure
  - programming
draft: false
---

AWS CDK (Cloud Developer Kit) is a new way to develop cloud infrastructure as it relates to AWS by brining your favorite programming language to apply abstractions on top of CloudFormation. This won't be a super in-depth post on the tech and how to apply it (I'll follow up with more articles later) but I'd like outline some of the benefits and reasons that you might consider your next feature's infrastructure be coded up with it.

## Why Choose CDK

Developer productivity. Hard to call it traditional considering how far Cloud Infra development has come, but usually infra has been constructed by another team. CloudFormation often proved a high bar for developers to overcome and take ownership over. Reasons for this

-   The testing of such markup required deployment into the environment to validate effectiveness of the YAML or JSON
-   The options and best practice settings for AWS Services are yet another thing that the developer needed to learn and/or master
-   Organizational settings such as when to use a KMS key on a service, when to use a Customer Managed KMS key, when to tag and what to tag as well as other things like VPC placement and even subnets can all seem like a bunch to keep track of

How does CDK address the above?

-   Testing can be done via the testing framework of your choice. For instance, if you are coding your infra in Typescript, you can use Jest and test the presence of resources in a template like this

```
test('Should have Queue with Name', () => {
  let stack = new Stack();
  let ms = new MessagingStack(stack, 'TestLib', props);

  let template = Template.fromStack(ms);
  template.hasResourceProperties('AWS::SQS::Queue', {
    QueueName: `${props.stackPrefix}-${props.queueName}-queue`,
  });
});

```

-   Using CDK Constructs you can organize and build structures that encompass the best practices of your organization like below

```
import { Construct } from 'constructs';

export class YourConstruct extends Construct {
    // insert all of your specifics here like defining a Lambda function with
    // a queue that allows a developer to use this while getting 
    // organizational best practices
```

By giving developers constructs like included testing and allowing them to take advantage of organizational best practices, you can reduce the burden on your Cloud/DevOps teams to focus other key tasks. Another nice benefit is that you can code up this infra in (as of now)

-   TypeScript
-   JavaScript
-   Python
-   Java
-   C#/. Net
-   Go

Also, you spread the Cloud awareness so that everyone is super familiar with the infra and services that are being used in your organization

## How to get Started

The place I did was to have a look at the [CDK Pipelines Construct](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html). Also this is a great [AWS Article](https://aws.amazon.com/blogs/developer/cdk-pipelines-continuous-delivery-for-aws-cdk-applications/) describing what it all means and how to use it.

What does this mean? A very opinionated set of code that easily allows you as the developer to focus on deploying code and not worrying about how. The construct will build pipeline that

-   Checks out code from source
-   Compile (sythensize) the application
-   Self updates - this is important as it means that once the pipeline is checked in you can mutate it from just repos commits
-   Asset bundling
-   Deployment via CloudFormation to however many environments you want

Important thing about CDK. It ultimately boils down to building really good CloudFormation code with the appropriate permissions and restrictions so that you aren't just granting "\*" on all resources with a give permission.

## Wrap Up

Give CDK a shot if you are looking to start a new feature or you are looking to expand your team's knowledge in your Cloud Infra while also removing some burden on the CloudOps team. I know that I've personally seen the speed and safety that it's brought to my groups and the relief in terms of having to make changes in the way a teams code is deployed.

## Next Steps

-   [AWS CDK](https://aws.amazon.com/cdk/)
-   [CDK on Github](https://github.com/aws/aws-cdk)
-   [Construct Hub](https://constructs.dev)
-   [API Documentation](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html)
