---
title: DynamoDB Streams EventBridge Pipes Multiple Items
author: "Benjamen Pyle"
description: "I've written a few articles lately on EventBridge Pipes and specifically around using them with DynamoDB Streams. I've written about Enrichment. And I've written about just straight Streaming. I belie"
pubDatetime: 2023-09-10T00:00:00Z
tags:
  - aws
  - cdk
  - golang
  - programming
  - serverless
draft: false
---

I've written a few articles lately on EventBridge Pipes and specifically around using them with DynamoDB Streams. I've written about [Enrichment](https://binaryheap.com/dynamodb-eventbridge-pipes-enrichment/). And I've written about just straight [Streaming](https://binaryheap.com/streaming-aws-dynamodb-to-a-lambda-via-eventbridge-pipes/). I believe that using EventBridge Pipes plays a nice part in a Serverless, Event-Driven approach. So in this article, I want to explore Streaming DynamoDB to EventBridge Pipes with multiple items in one table.

Several of the comments I received about [Streaming DynamoDB to EventBridge Pipes](https://binaryheap.com/dynamodb-eventbridge-pipes-enrichment/) were around, "What if I have multiple item collections in the same table?". I intend to show a pattern for handling that exact problem in this article. At the bottom, you'll find a working code sample that you can deploy and build on top of. I've used this exact setup in production, so rest assured that this is a great base to start from.

## Architecture

Let's start with defining the setup that I'll be walking through.

- DynamoDB Table with 2 Item Types
  - Patient
  - Address
- DynamoDB Stream connected to an EventBridge Pipe
- EB Pipe will
  - Filter
  - Enrich
  - Put into the EventBridge Default Bus
- EB Rules carved out for
  - Lambda Handler for Patient
  - Lambda Handler for Address

![EventBridge Pipe Stream](/images/Multi-Arch.png)

## Step Through the Code

### DynamoDB Table

The DynamoDB Table I'm working from is going to contain multiple item types. This can be described as Single-Table design, Multi-Item Collection Design or whatever you like. The point is, that DynamoDB is great at storing things that are related in the same table. I'm defining an `id` field as the Partition Key and then `sk` as the Range Key.

```typescript
this._table = new Table(this, id, {
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
  partitionKey: { name: "id", type: AttributeType.STRING },
  sortKey: { name: "sk", type: AttributeType.STRING },
  tableName: `Patients`,
  encryption: TableEncryption.CUSTOMER_MANAGED,
  encryptionKey: props.key,
  stream: StreamViewType.NEW_AND_OLD_IMAGES,
});
```

Notice as well that I'm defining a `stream` that will propagate changes with New and Old images attached to the change record. This will be useful as I get into the Pipe definition.

A Patient will look like this:

```json
{
  "id": "PATIENT#1",
  "sk": "PATIENT#1",
  "name": "Patient Name",
  "itemType": "Patient",
  "patientId": "1"
}
```

And an Address like this:

```json
{
  "id": "PATIENT#1",
  "sk": "ADDRESS#1",
  "address": "123 Some City, Some State USA",
  "addressId": "1",
  "itemType": "Address",
  "patientId": "1"
}
```

![Table Records](/images/db_records.png)

### EventBridge Pipe

When Streaming DynamoDB to EventBridge Pipes, the Pipe is the central player in the design. In this scenario, I'm ignoring Deletes and only dealing with DynamoDB Modify and Insert change types.

#### The Source

I want to first address the fact that your source component needs to have the proper IAM Permissions attached to read from the stream and decrypt the data.

```typescript
new PolicyDocument({
  statements: [
    new PolicyStatement({
      actions: [
        "dynamodb:DescribeStream",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:ListStreams",
      ],
      effect: Effect.ALLOW,
      resources: [table.tableStreamArn!],
    }),
    new PolicyStatement({
      actions: [
        "kms:Decrypt",
        "kms:DescribeKey",
        "kms:Encrypt",
        "kms:GenerateDataKey*",
        "kms:ReEncrypt*",
      ],
      resources: [key.keyArn],
      effect: Effect.ALLOW,
    }),
  ],
});
```

The next step is to configure the stream reader. I want to process 1 record at a time in addition to filtering in only the Modify and Inserts as described above.

```typescript
return {
  dynamoDbStreamParameters: {
    startingPosition: "LATEST",
    batchSize: 1,
  },
  filterCriteria: {
    filters: [
      {
        pattern: ' { "eventName": [ "MODIFY", "INSERT" ] }',
      },
    ],
  },
};
```

#### The Enrichment

In this case, I want to simply strip out the DynamoDB parts of the source event down a raw `struct` in Golang that I can pass along into the EventBridge Bus. To do that, I'm going to use a Lambda function as part of the Pipe workflow.

The Lambda will be triggered as a Request/Response that makes this synchronous in the workflow.

```typescript
return {
  lambdaParameters: {
    invocationType: "REQUEST_RESPONSE",
  },
  inputTemplate: ``,
};
```

The Lambda itself handles the shaping of the Stream Record.

```go
func Convert(r *events.DynamoDBEventRecord) (*CustomEvent, error) {
    // the body of this function parses out the values
    // and returns shaped record
    if itemType == "Patient" {
        i := r.Change.NewImage["id"]
        n := r.Change.NewImage["name"]
        t := r.Change.NewImage["itemType"]
        s := r.Change.NewImage["sk"]
        pid := r.Change.NewImage["patientId"]

        change := fmt.Sprintf("Patient%s", strings.Title(strings.ToLower(r.EventName)))
        return &CustomEvent{
            EventType:     change,
            CorrelationId: r.EventID,
            Body: &ItemOne{
                Id:        i.String(),
                Name:      n.String(),
                ItemType:  t.String(),
                Sk:        s.String(),
                PatientId: pid.String(),
            }}, nil
    } else if itemType == "Address" {
        i := r.Change.NewImage["id"]
        n := r.Change.NewImage["address"]
        t := r.Change.NewImage["itemType"]
        s := r.Change.NewImage["sk"]
        pid := r.Change.NewImage["patientId"]
        aid := r.Change.NewImage["addressId"]
        change := fmt.Sprintf("Address%s", strings.Title(strings.ToLower(r.EventName)))
        return &CustomEvent{
            EventType:     change,
            CorrelationId: r.EventID,
            Body: &ItemTwo{
                Id:        i.String(),
                Address:   n.String(),
                ItemType:  t.String(),
                Sk:        s.String(),
                PatientId: pid.String(),
                AddressId: aid.String(),
            }}, nil
    }
}
```

#### The Target

Once the event has been shaped in the format that I want, it's time to send the payload to an EventBridge Bus. I'm going to shape the output into a result that I prefer.

```typescript
return {
  eventBridgeEventBusParameters: {
    detailType: "PatientChange",
    source: "com.binaryheap.patient",
  },
  inputTemplate: `{
            "meta": {
                "correlationId": <$.eventId>,
                "changeType": <$.eventType>
            },
            "event": <$.body>
        }`,
};
```

Just like with the source input, I need to grant the consumer the ability to post to EventBridge.

```typescript
return new PolicyDocument({
  statements: [
    new PolicyStatement({
      resources: [busArn],
      actions: ["events:PutEvents"],
      effect: Effect.ALLOW,
    }),
  ],
});
```

### Rules to Handle Item Types

Now that I've got a Pipe publishing to EventBridge's Default Bus, I can craft some rules. When Streaming DynamoDB to EventBridge Pipes in a MultiCast scenario, my specific rules will help target Lambda functions that I want to handle the Item changes. These could also be queues or anything else you like. This is where having multiple Item Types in one table comes back together. You could have service consumers handling all changes from the Patients table or you could have specific consumers dealing with the specific Item Types. My example shows the latter. I want to be specific to highlight the pattern.

#### Patient Rule

When dealing with the Patient, I might want to address something specific about that record. I first need to build an EventBridge Rule for handling the Bus message and the target I want.

```typescript
this._handlerOne = new GoFunction(scope, "ItemOneHandlerFunction", {
  entry: "src/type-one-handler",
  functionName: `type-one-handler`,
  timeout: Duration.seconds(15),
  environment: {
    IS_LOCAL: "false",
    LOG_LEVEL: "DEBUG",
    VERSION: props.version,
  },
});
```

This code will deploy the Lambda that will be the target for my Patient rule.

```typescript
const rule = new Rule(scope, "ItemOnHandlerRule", {
  eventPattern: {
    detailType: ["PatientChange"],
    detail: {
      meta: {
        changeType: ["PatientModify", "PatientInsert"],
      },
    },
  },
  eventBus: EventBus.fromEventBusArn(scope, "DefaultBusItemOne", busArn),
  ruleName: "item-one-rule",
});

const dlq = new Queue(this, "ItemOneHandler-DLQ");
rule.addTarget(
  new targets.LambdaFunction(handler, {
    deadLetterQueue: dlq,
  })
);
```

As you can notice, I'm looking for the top-level detail-type of `PatientChange`. Then I'm looking deeper into the payload for the `PatientInsert` and `PatientModify` change types. That then forwards into my Item One Lambda.

#### Address Rule

Next, I build an almost identical rule, but specifically for Address.

```typescript
const rule = new Rule(scope, "ItemTwoHandlerRule", {
  eventPattern: {
    detailType: ["PatientChange"],
    detail: {
      meta: {
        changeType: ["AddressModify", "AddressInsert"],
      },
    },
  },
  eventBus: EventBus.fromEventBusArn(scope, "DefaultBusItemTwo", busArn),
  ruleName: "item-two-rule",
});

const dlq = new Queue(this, "ItemTwoHandler-DLQ");
rule.addTarget(
  new targets.LambdaFunction(handler, {
    deadLetterQueue: dlq,
  })
);
```

![Address Rule](/images/address_change_pattern.png)

On the backside of my targets, I have two separate Lambdas. They are identical for this example as they just print out the payload.

```go
func handler(ctx context.Context, e interface{}) (interface{}, error) {
    log.WithFields(log.Fields{
        "body": e,
    }).Debug("Printing out the body")

    return e, nil
}
```

**Patient Output**  
![Patient Output](/images/patient_log.png)

**Address Output**  
![Address Output](/images/address_log.png)

## Notes on the Pattern

When streaming DynamoDB to EventBridge Pipes you have so many options from filtering, enriching and then ultimately the targets. I continue personally to put Pipes into my workloads as I find it performs super efficiently and is easy to set up and reason about. I also find that where I was using Step Functions for these types of workflows, I'm now defaulting to Pipes.

## Wrap Up

To pull things back together, Streaming DynamoDB has a limit of 2 consumers that you can attach to the stream. That limit isn't a big deal when you have 1 type of record in the table. You could have one stream handling Inserts and Modifies and then another Pipe to handle the Deletes. But when you have a Single-Table or Multi-Type situation, you need a few more services layered in.

Using EventBridge's Rules and Targets is exactly the service and capability that makes this possible. I also find that if you've got local teams with permission boundaries as well, this can be even further enhanced with an [Event Bus Mesh](https://binaryheap.com/eventbus-mesh/).

As always, for a \[fully functioning [and working repository](https://github.com/benbpyle/ddb-stream-multi-cast), you can head on over to GitHub and clone it.

I hope this gets you a little more in your toolbox when working with DynamoDB Streams and EventBridge Pipes.

Happy Building!
