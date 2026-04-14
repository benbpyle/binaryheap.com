---
title: Subscribe SNS to EventBridge Pipes
author: "Benjamen Pyle"
description: "I've been thinking and working hard on how I can start to introduce EventBridge and Pipes into some of my existing applications. Unfortunately, I have SNS in front of a lot of my service code and you"
pubDatetime: 2023-03-12T00:00:00Z
tags:
  - aws
  - cdk
  - programming
  - serverless
draft: false
---

### Legacy Serverless to New Serverless

I've been thinking and working hard on how I can start to introduce EventBridge and Pipes into some of my existing applications. Unfortunately, I have SNS in front of a lot of my service code and you can't natively subscribe SNS to EventBridge Pipes. So I've started pondering this idea of how to integrate Legacy Serverless Applications into an ecosystem as new features are developed with more modern Serverless concepts. What I really want is a way to connect SNS to EventBridge Pipes.

What do I mean by Legacy Serverless. I mean code that is written in a Serverless component that no longer needs to be there due to the advancements in Serverless tooling. An example of such a workflow might look like the image below.

![SNS to SQS to Lambda](/images/legacy_serverless-1024x216.png)

### Workflow Description

Just to briefly touch upon what's going on above is an SNS based workflow that SNS receives a message. SQS has a subscription to that queue and a Lambda listens on that queue, filters and transforms the payload and the forwards it on to another Lambda or some other AWS Service downstream. Sure, I can have a few filters in the SNS subscription but I have a great deal of code that transforms the data in the Lambda before doing something with it.

Even if that means using a Step Function that is triggered the Lambda, there's still a lot of "plumbing" code that just seems super wasteful. And let's be real, you can't just "start over" or "replace" when you are in production with customers. You have to find ways to work with what you have by evolving your architecture. And in order to connect SNS to EventBridge Pipes, that's exactly what I'm going to in the article below.

Enter new Serverless. And enter not having to waste Lambda cycles on tranforms and filtering but doing so in the AWS managed runtimes like EventBridge Pipes. I wrote a previous article on streaming [DynamoDB to Pipes](https://binaryheap.com/streaming-aws-dynamodb-to-a-lambda-via-eventbridge-pipes/) so after you are done with this read, head over there to see how to use Pipes to connect up your DDB stream.

### The Architecture

![Subscribe SNS to EventBridge](/images/sns_pipes.png)

Quick walkthrough of what is above and how to subscribe SNS to EventBridge Pipes.

- Message is still published to SNS
- SQS has the subscription to SNS (this stays the same)
- Connect EventBridge Pipes to the SQS
  - Pipes allow a Filter to remove unecassary messages
  - Pipes allow a Transform to shape the data as needed
  - An EventBus is the target for the Pipe
- The EventBus can have targets that trigger downstream code/services

### Breaking down the Architecture

Let's walk through each step of the flow via code and images to show how to subscribe SNS to EventBridge Pipes. I'm going to be using CDK with TypeScript to demonstrate how to stand up this sample solution

#### Standing up the SNS and SQS

```typescript
// creating the SNS Topic
this._topic = new Topic(scope, "SampleTopic", {
  topicName: "sample-topic",
  displayName: "Sample Topic",
});

// creating the SQS Queue
this._queue = new Queue(scope, "SampleQueue", {
  queueName: `sample-queue`,
});

/// add the subscription
this._topic.addSubscription(
  new SqsSubscription(this._queue, {
    // SUPER IMPORTANT -- rawMessageDelivery
    rawMessageDelivery: true,
  })
);
```

The above does a few simple things.

- Creates the Topic
- Creates the Queue
- Adds the subscription **VERY IMPORTANT** make sure to include `rawMessageDelivery`. This tells SNS to send SQS just the message body and not all of the other SNS details. It keeps the JSON clean too so it's not escaped

##### Topic In AWS Console

![SNS Topic](/images/sample_topic.jpg)

##### Queue in AWS Console

![SQS Queue](/images/sample_queue.jpg)

##### Subscription of the Queue to the Topic

![Subscribe to SNS](/images/sample_sub.jpg)

Now let's move onto the EventBridge Pipe that will listen to the queue

#### Standing up the Pipe

First off, if you want to read more from AWS about the Pipes feature feel free to link out [here](https://aws.amazon.com/eventbridge/pipes/).

Now to build the pipe. Let's again dive into CDK

```typescript
// Create the role
const pipeRole = this.pipeRole(
  scope,
  this.sourcePolicy(props.queue),
  this.targetPolicy(props.bus)
);

// Create the pipe
const pipe = new pipes.CfnPipe(this, "Pipe", {
  name: "SampleEvent-Pipe",
  roleArn: pipeRole.roleArn,
  source: props.queue.queueArn,
  target: props.bus.eventBusArn,
  sourceParameters: this.sourceParameters(),
  targetParameters: this.targetParameters(),
});
```

This is what the `constructor` code of the `Construct` looks like. I am building up the Role that handles

- Source Policy (the queue)
- Target Policy (the bus)

Then adding in the `Source` and `Target` parameters. To explore this further.

##### Source Policy

Sets up permission to read, delete and get queue attributes

```typescript
sourcePolicy = (queue: IQueue): PolicyDocument => {
  return new PolicyDocument({
    statements: [
      new PolicyStatement({
        resources: [queue.queueArn],
        actions: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        effect: Effect.ALLOW,
      }),
    ],
  });
};
```

##### Target Policy

Sets up Bus permissiont to be able put events on the EventBus

```typescript
targetPolicy = (bus: IEventBus): PolicyDocument => {
  return new PolicyDocument({
    statements: [
      new PolicyStatement({
        resources: [bus.eventBusArn],
        actions: ["events:PutEvents"],
        effect: Effect.ALLOW,
      }),
    ],
  });
};
```

##### Source Parameters

This creates rules around how the Pipe reads from SQS in addition to adding in a Filter so that we don't get noise in our Pipe

```typescript
sourceParameters = () => {
  return {
    sqsQueueParameters: {
      batchSize: 1,
    },
    filterCriteria: {
      filters: [
        {
          pattern: `
                {
                    "body": {
                        "eventType": ["SampleEvent"]
                    }
                }`,
        },
      ],
    },
  };
};
```

Notice how I'm using the field `body` to start my filter. That's because EventBridge Pipes automatically pulls in the message structure frmo the Queue Message. To read more about how all this works, this [doc](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes-sqs.html) was extremely helpful for me.

##### Target Parameters

This creates rules around how the Pipe posts data into its target. You also get the ability to Transform the data that makes sense. I'm actually dropping some fields from the message to simplify it a little bit in addition to removing the `body` root field element so that the message looks like what I expect.

```typescript
targetParameters = () => {
  return {
    eventBridgeEventBusParameters: {
      detailType: "SampleEventTriggered",
      source: "com.binaryheap.sample-source",
    },
    inputTemplate: `
        {
            "metaBody" {
                "correlationId": <$.messageId>;
            },
            "messageBody" {
                "field1": <$.body.field1>,
                "field2": <$.body.field2>,
                "field3": <$.body.field3>;
            }
        }`,
  };
};
```

A thing to note about Source and Target parameters is that they are specific to the service that you are reading from and targeting. Which is why the `target` in this example looks like an EventBridge target becast that's where this is going.

And finally, here is the sample event that we are working with

```json
{
    "eventType": "SampleEvent",
    "field1;: "Sample Field 1",
    "field2: "Sample Field 2",
    "field3: "Sample Field 3";
}
```

With all that put together and SNS connected to EventBridge Pipes, let's take a look at When deployed the resources look like in the AWS Console

##### Source reading from the Queue

![subscribe SNS to EventBridge](/images/pipe_source.jpg)

##### Filter that helps Manage Downstream Load

![EventBridge Pipe Filter](/images/pipe_filtering.jpg)

##### Pipe Transformer that readies the Message

![EventBridge Pipe Target](/images/target_transofmer.jpg)

#### Transfomer Tool

I want to take a quick pause to highlight something that is super helpful. First off, I think being a good builder for the cloud is taking advantage of all thats at your disposal. Just because I'm a CLI/terminal/VSCode type of guy, doesn't mean I never use the AWS Console. That would be silly. And I'd be missing out on the wonderful power of this transformer tool.

As part of my development process to connect SNS to EventBridge Pipes, I found myself using this nice tool below. So, when you edit the Pipe and view the Transforms section of the target you get this

![EventBridge Pipe Transformer](/images/transformer_tool.jpg)

What this gives you is the ability to plug in a sample event, code up your transformer and then see live updates on the `Output` section to see how well your transform works. You can then take that and plug it into your CDK code like I've done above in the `TargetParameters`.

#### EventBridge Bus and the Rule

To keep moving through the architecture, the output of the Pipe is targeting an EventBridge Bus. For this sample, I've created a Custom Bus. You can surely use the default but I tend to prefer Custom Buses to isolate boundaries and then mesh them together with rules. There are pros and cons to either which are outside of the scope of this article.

```typescript
this._bus = new events.EventBus(scope, "EventBus", {
  eventBusName: "sample-event-bus",
});
```

The Bus is super simple. Give it a name and off we go

And now for the Rule

```swift
const rule = new Rule(this, "SampleEvent-Rule", {
    eventPattern: {
        detailType: ["SampleEventTriggered"],
    },
    ruleName: "sample-event-triggered-rule",
    eventBus: props.bus,
});

const dlq = new Queue(this, "SameEventTriggered-DLQ");

const role = new Role(this, "SameEventTriggered-Role", {
    assumedBy: new ServicePrincipal("events.amazonaws.com"),
});

rule.addTarget(
    new SfnStateMachine(props.stateMachine, {
        input: RuleTargetInput,
        deadLetterQueue: dlq,
        role: role,
    })
);
```

A few little pieces to breakdown with this code

First, creating the rule. You must give it an `eventPattern` which shoud look familar from the above code. I'm simply filtering on the root level field `detailType` and looking for the event we published on the Pipe

Second, create a `Role` that can be used by the target for triggering the State Machine.

Third, the Dead Letter Queue. If something goes wrong calling the State Machine, the message drops in that queue

And laslty, the target. There are many targets you can create, but in this case, I'm using a StateMachine target that has the

- Rule Input
- Dead Letter Queue
- Role used

##### EventBridge Rule

When the infra gets deployed, the rule will look like this in the AWS Console

![Connect EventBridge Rule](/images/eb_rule.jpg)

#### State Machine Build

And for the last piece of this journey, we need a State Machine to execute. I like connecting up to a State Machine because most of the time these days when I'm building async and Event Driven Architecture workflows, a State Machine makes a ton of sense.

For this example, the State Machine is basic. It just has a Succeed Task. Since this isn't a Step Functions article, there's no meat in there. But again, you can extend this as much as your needs require.

```typescript
finalizeStateMachine = (scope: Construct) => {
  const logGroup = new logs.LogGroup(this, "CloudwatchLogs", {
    logGroupName: "/aws/vendedlogs/states/sample-state-machine",
  });

  const role = new Role(this, "StateMachineRole", {
    assumedBy: new ServicePrincipal("states.us-west-2.amazonaws.com"),
  });

  const flow = this.buildStateMachine(scope);

  this._stateMachine = new stepfunctions.StateMachine(this, "StateMachine", {
    role: role,
    stateMachineName: "SampleStateMachine",
    definition: flow,
    stateMachineType: stepfunctions.StateMachineType.EXPRESS,
    timeout: Duration.seconds(30),
    logs: {
      level: LogLevel.ALL,
      destination: logGroup,
      includeExecutionData: true,
    },
  });
};
```

Walking through the above code

- Build up the CloudWatch LogGroup
- Create the StateMachine Role
- Build the StateMachine

```typescript
buildStateMachine = (scope: Construct): stepfunctions.IChainable => {
  return new Succeed(scope, "DefaultSucceed");
};
```

Again, the build is basic. But you can add all the `IChainable`s you want to make the Workflow that you require.

##### State Machine Definition

![State Machine](/images/state_machine_1.jpg)

#### The Execution

Finally time to put it all together to show how to subscribe SNS to EventBridge Pipes. If you are following along with the Github repos, now's the time you can start executing the worfklow.

To deploy `make deploy-local`

Grab a very quick beverage as it shouldn't take more than a couple of minutes and then head on over to the SNS Console

Take the sample input file located at `test/sample-message.json`

![Publish Message](/images/publish_message.jpg)

Now quickly ... and I mean quickly run on on over to the Step Functions Console (quick tip is to have it open in a tab)

You should see a successful execution and then you can drill in to see this output

![Execution Output](/images/sm_execution.jpg)

Notice how the EventBridge style format is carried over and we've removed any notion of this having come from SNS or SQS. Pretty cool isn't it? And to think we didn't use a Lambda. The code we wrote was configuration and IaC code in TypeScript to build a highly scalable and reliable cloud workload.

### Wrapping Up

A few points I want to highlight about this architectural pattern to subscribe SNS to EventBridge Pipes

1.  This is a Severless and Event Driven Style Architecture that will scale, be reliable and will deal with failure should bad things happen. It does not mean it's not complex, but with the parts being broken up as they are, problems are easy to find and easy to fix in isolation
2.  I meantioned `rawMessageDelivery` on the SNS subscription. Do not skip this.
3.  Cost/Load - by using Filters in the Pipes, you will not pay for unused cycles and your down stream code will not have to deal with filtering or working with data it dosen't desire. This will naturally help with load so you aren't wasting cycles.

There is a lot of code above and it's mostly in fragrments so if you want to pull the whole repos down and use it as a template or just see how it looks in your environment, [feel free to check it out](https://github.com/benbpyle/cdk-sns-eventbridge-pattern)

This was a lengthy and detailed article about connecting SNS to EventBridge Pipes to do something super useful. So thank you for reading and I hope you found it helpful. I can personally say that I'm using this pattern for connecting up these legacy Serverless components in my apps and it's paid some really great dividends and I know it will for you too!
