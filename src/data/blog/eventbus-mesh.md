---
title: EventBus Mesh
author: "Benjamen Pyle"
description: Using and EventBus Mesh can provide good separation of concerns when developing features usin an Event-Driven Architecture
pubDatetime: 2023-03-20T00:00:00Z
tags:
  - aws
  - cdk
  - infrastructure
  - programming
  - serverless
draft: false
---

I've been thinking about this topic a lot lately when bringing EventBridge's EventBus into some applications. On the current projects I'm working on with existing code, I've said 100 times, if EventBridge existed when I started them, I wouldn't have so much SNS->SQS based code lying around. But such is life when working in evolving tech. Enter the EventBus Mesh

### Microservice items of owernship

I want to start with the idea that in a Microservice architecture, I like to have everything be as independent as possible. That means the following items are each owned by the boundary itself

- API Definition
- Data model and data store
- Frontend and Backend code
- Any async communication channels
  - A way to publish that only that boundary to use
  - A way to subscribe that only that boundary can use

### Pub/Sub before EventBridge

Before EventBridge, I built a lot of software that looked like the one below. And for clarity, there is **100% nothing wrong with this approach**

![Traditional Pub-Sub](/images/Bus-Mesh-Traditional-2.png)

- Functions behind API Gateway
- A single or multiple DynamoDB Tables under its control
- SQS for subscribing to other SNS Topics (only it can read from)
- SNS Topic for publishing messages/events out to the ecosystem. Only it could publish on that topic

With the advent of [EventBridge Pipes](https://aws.amazon.com/eventbridge/pipes/) and the ability of EventBridge Rules to trigger a Step Function (like this pattern [EventBridge Step Function Rule](https://serverlessland.com/patterns/eventbridge-sfn)), I felt the need to explore replacing SNS/SQS with EventBridge for new features and projects.

Again, nothing wrong with any of the above but I wanted to gain some additional capabilities

### Benefits of Moving to EventBridge

- Rules - they are more expressive and powerful than simple SNS message filtering. Filtering saves execution cycles which saves on cost and saves on waste
- Schema Discovery - really nice feature to have messages/events be expressed through Schema
- Pipes - standalone, they are fantastic for filtering, enriching and transforming. For more on Pipes, have a read [here](https://binaryheap.com/3a7w)

With just these three benefits, I save on wasted execution, remove points of failure and eliminate Lambdas and other code that could introduce errors that have to be tested. [This old article by Jeff Barr](https://aws.amazon.com/blogs/aws/we_build_muck_s/) which describes the famous Keynote that Jeff Bezos did where he talks about "undifferentiated heavy lifting" is an example why I like pushing this kind of code up to the cloud

### What is an EventBus Mesh

I drew up this simple diagram to highlight how I see putting Buses together.

![EventBus Mesh](/images/bus_mesh.png)

Some of the core pieces of this pattern are this

- Functions respond to API requests
- Functions (Lambda or Step) interact with DynamoDB
- EventBridge becomes the glue
  - Service A Bus connects to Service B Bus
  - Service A Bus connects to Functions in Service A
  - EventBridge Pipes are used in connecting to DynamoDB on Service A and then are registered onto Service A Bus

The really important thing to nail down is the "boundaries". It's important to make sure that what owns what is isolated to that boundary. The real glue is Bus -> Bus. It's like Pub/Sub (and it is) but instead of subscribing an SQS Queue to an SNS Topic, you subscribe Service B's Bus to Service A's bus. Additionally, make sure to specify the Rules around the data that will connect those buses.

The big con for me is that Bus B when connected to Bus A knows about Bus A. But if Queue B knows about Topic A, in my mind it's about the same thing. And in the case where this is all internal to one collection of products, it doesn't bother me so hopefully, it doesn't bother you as well.

### Two Bus Setup

For this example, we are going to build two EventBuses and connect them. Very similar to the diagram above.

Let's look at some [CDK code](https://binaryheap.com/ojc1) to build

#### EventBus One

```typescript
export class EventBusOne extends Construct {
  private readonly _bus: EventBus;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this._bus = new events.EventBus(scope, "EventBusOne", {
      eventBusName: "event-bus-one",
    });
  }

  get eventBus(): EventBus {
    return this._bus;
  }
}
```

#### EventBus Two

```typescript
export class EventBusTwo extends Construct {
  private readonly _bus: EventBus;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this._bus = new events.EventBus(scope, "EventBusTwo", {
      eventBusName: "event-bus-two",
    });
  }

  get eventBus(): EventBus {
    return this._bus;
  }
}
```

When that gets run, the resources created will look like this in the console.

![EventBuses](/images/buses.jpg)

With a foundation of two EventBuses, let's take a look at connecting them together.

### Create the EventBus Mesh with a Rule

For this example, let's assume that Bus2 is interested in Events that land on Bus one that have the `detail-type` of "Busing". With CDK and TypeScript, we do that by this code.

```typescript
    private buildBusOneRule = (
        scope: Construct,
        props: EventBridgeRuleStackProps
    ) => {
        const rule = new Rule(this, "BusOne-BusTwo-Rule", {
            eventPattern: {
                detailType: ["Busing"],
            },
            ruleName: "bus-two-mesh",
            eventBus: props.busOne,
        });

        const dlq = new Queue(this, "BusOneBusTwoMesh-DLQ");

        const role = new Role(this, "BusOneBusTwoMesh-Role", {
            assumedBy: new ServicePrincipal("events.amazonaws.com"),
        });

        rule.addTarget(
            new targets.EventBus(props.busTwo, {
                deadLetterQueue: dlq,
                role: role,
            })
        );
    };

```

When connecting the buses together the output of that will look like the below in the console.

![Connecting Bus One to Bus Two](/images/bus_mesh.jpg)

I like using the naming convention of "mesh" in the name just so I know the Rules that are related to connecting Buses easily stand out. And they could be searched on that keyword.

### BusTwo Rules for Triggering Targets

Now that BusTwo is receiving events with `detail-type` of "Busing", it only makes sense to have that event go somewhere. In a real scenario, I might be responding to change in one system and needing to handle that change in another. By using EventBus and Rules you can get granular. For instance

- Only events that have a certain `detail-type` go to a specific State Machine
- Look for multiple `detal-type` that go to the same State Machine
- Look for matches in the payload itself
- So many other choices that can be explored [here](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html)

Things really scale well and can be extended to your actual liking.

```typescript
private buildBusTwoRule = (
        scope: Construct,
        props: EventBridgeRuleStackProps
    ) => {
        const rule = new Rule(this, "SampleEventSM-Rule", {
            eventPattern: {
                detailType: ["Busing"],
            },
            ruleName: "bus-two-busing",
            eventBus: props.busTwo,
        });

        const dlq = new Queue(this, "SampleEventSM-DLQ");

        const role = new Role(this, "SampleEventSM-Role", {
            assumedBy: new ServicePrincipal("events.amazonaws.com"),
        });

        rule.addTarget(
            new targets.SfnStateMachine(props.stateMachine, {
                input: RuleTargetInput,
                deadLetterQueue: dlq,
                role: role,
            })
        );
    };

```

The above code should look a lot like the code that connects the EventBuses but the Rule's target is now a StateMachine and not another EventBus.

When run and deployed up to the Cloud, the Console will show you that the rule presents like this.

#### Rule Event Pattern

![Bus Two Rule](/images/bus_two_rule-1.jpg)

#### Rule Target

![Bus Two Target](/images/bus_two_target.jpg)

### Executing the Target of the EventBus Mesh

The whole point of connecting two or more buses is so that a consumer of one of the buses can do something with the updated information or the command that was put on the wire.

In the case of this demonstration, I'm going to use Step Functions with a simple State Machine. Taking a quick look at what's deployed, you'll see that it's a single step. Of course, you'd want something more robust if you handled this event, but this is just a demo and this article is not on Step Functions

![EventBus Mesh State Machine](/images/state_machine.jpg)

```typescript
/**
 * Sets up the state machine. Brings in the roles, permissions and appropriate keys and whatnot
 * to allow the state machine to do its thing
 *
 *  @param {Construct} scope - the context for the state machine
 */
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
    timeout: Duration.seconds(5),
    logs: {
      level: LogLevel.ALL,
      destination: logGroup,
      includeExecutionData: true,
    },
  });
};

/**
 * Creates the workflow for the state machine.  Builds transitions and errors/catches/retries
 *
 *  @param {Construct} scope - the context for the state machine
 */
buildStateMachine = (scope: Construct): stepfunctions.IChainable => {
  return new Succeed(scope, "We made it and it finished");
};
```

## Wrap Up

Hopefully, you've seen a touch of the power of this pattern. By using an EventBus Mesh you gain the ability to connect multiple features and then gain the isolation and control of publishing and reading those events while also using Pipes to help filter, enrich and transform if needed.

With most things Serverless and AWS there are many different ways to solve problems but using EventBridge Meshes should be a new pattern that you can now introduce into your toolkit.

And as always, if you want to see this code in action, feel free to pull it down from the [Github repos](https://github.com/benbpyle/cdk-event-bridge-mesh). Then you can run

##### Prep the Environment

```
npm install

```

##### Deploy EventBus Mesh

```
cdk deploy

```

##### Destroy EventBus Mesh

```typescript
cdk destroy

```

Happy building!
