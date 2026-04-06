---
title: Streaming DynamoDB to EventBridge Pipes
author: "Benjamen Pyle"
description: "Stream AWS DynamoDB changes to a Lambda via AWS EventBridge Pipes, Rules and CDK"
pubDatetime: 2023-02-12T00:00:00Z
tags:
  - aws
  - cdk
  - eventbridge
  - golang
  - pipes
  - programming
  - serverless
draft: false
---

There is a real push and thought process around moving as much of your boilerplate code up into your serverless cloud components as possible. By streaming DynamoDB to EventBridge Pipes, you can move a large chunk of that boilerplate into the cloud. The thinking is that for things that really don't differentiate your solution, why not let your cloud provider take care of that for you. Their integrations are well tested, highly scalable and highly available and can be more cost effective as you don't waste CPU cycles on things like

-   Polling
-   Error handling
-   Data transformation
-   Filtering
-   Enrichment
-   Event management

All of those things "could" be done say in a container or in a Lambda but again, why pay the cycles, write all of this code over and over and over when you can push it up as configuration and as a part of your CDK or SAM code that handles the deployments

As usual, if you want to skip straight to a working sample, here's the [Github repository](https://github.com/benbpyle/dynamodb-eventbridge-pipes). Feel free to pull it and then run `cdk deploy npx ts-node bin/app.ts` and off you go.

### EventBridge Pipes

[AWS EventBridge Pipes](https://aws.amazon.com/eventbridge/pipes/) were launched at re:Invent in '22 and they brought a new capability into the ecosystem for working with event driven architectures. This now gives a developer a very straightforward pipeline to perform the below on a host of events that are generated in your system

-   Handle
-   Filter
-   Enrich
-   Ship

For the sake of this article, I'm going to walk through streaming DynamoDB to EventBridge Pipes , filtering out just the MODIFY events, transform that data and then put the event on an EventBridge custom bus. From there, I'll handle the event with a Rule that targets a Lambda. If you are interested in connecting Pipes to SNS then here's another read to [check out](https://binaryheap.com/subscribe-sns-to-eventbridge-pipes-with-cdk/)

![AWS EventBridge Pipe workflow](/images/pipe-1024x629.jpg)

Let's start with what this looks like once it's been deployed. You can see the 3 phases I discussed above.

### Table

Starting out with the Table streams need to be enabled on it. And for the sake of this demo, I'm using the following settings.

-   LATEST for only those most recent records
-   Batch of 1 because this is for a simple setup
-   Capturing both New and Old images

```typescript
this._table = new dynamodb.Table(this, id, {
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    partitionKey: {name: 'PK', type: dynamodb.AttributeType.STRING},
    sortKey: {name: 'SK', type: dynamodb.AttributeType.STRING},
    pointInTimeRecovery: false,
    tableName: 'SampleTable',
    stream: StreamViewType.NEW_AND_OLD_IMAGES
});

```

### Creating the Policies

Since the table is the Source for the pipe, it needs to go first. From there, adding in the Pipe is a pretty simple process. If you've worked with the Step Functions CDK API before then you'll feel pretty comfortable with the Construct. A month back, the CDK team added in L2 construct for Pipes that you can refer to [here](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_pipes.CfnPipe.html).

I'm going to create a source and target Policy for IAM first off that grants read access to the stream and write access to putEvents on the bus

```typescript
const sourcePolicy = new PolicyDocument({
    statements: [
        new PolicyStatement({
            resources: [this._table.tableStreamArn!],
            actions: [
                "dynamodb:DescribeStream",
                "dynamodb:GetRecords",
                "dynamodb:GetShardIterator",
                "dynamodb:ListStreams"
            ],
            effect: Effect.ALLOW,
        })
    ]
});

const targetPolicy = new PolicyDocument({
    statements: [
        new PolicyStatement({
            resources: [props.bus.eventBusArn],
            actions: ['events:PutEvents'],
            effect: Effect.ALLOW,
        }),
    ],
});

```

Then from the policies I create a Role

```typescript
const pipeRole = new Role(this, 'PipeRole', {
    assumedBy: new ServicePrincipal('pipes.amazonaws.com'),
    inlinePolicies: {
        sourcePolicy,
        targetPolicy,
    },
});

```

### Creating the Stream Pipe

```typescript
        // Create new Pipe
        const pipe = new pipes.CfnPipe(this, 'pipe', {
            name: 'SampleTableModifyPipe',
            roleArn: pipeRole.roleArn,
            source: this._table.tableStreamArn!,
            target: props.bus.eventBusArn,
            sourceParameters: {
                dynamoDbStreamParameters: {
                    startingPosition: 'LATEST',
                    batchSize: 1
                },
                filterCriteria: {
                    filters: [{
                        pattern: `{
                        "eventName": [{
                            "prefix": "MODIFY"
                        }]
                    }`}]
                }
            },
            targetParameters: {
                eventBridgeEventBusParameters: {
                    detailType: 'SampleTableModified',
                    source: 'com.sample'
                },
                inputTemplate: `
                    {
                      "details": {
                        "meta-data": {
                          "correlationId": <$.eventID>
                        },
                        "data": {
                          "PK": <$.dynamodb.Keys.PK.S>,
                          "SK": <$.dynamodb.Keys.SK.S>,
                          "Field1": <$.dynamodb.NewImage.Field1.S>
                        }
                      }
                    }          
                `,
            },
        });

```

There are a few things that I had to look up when building this sample, so I want to highlight them individually.

### Stream Source Parameters

```typescript
sourceParameters: {
    dynamoDbStreamParameters: {
        startingPosition: 'LATEST',
        batchSize: 1
    },
    filterCriteria: {
        filters: [{
            pattern: `{
            "eventName": [{
                "prefix": "MODIFY"
            }]
        }`}]
    }
},

```

If you read through the Construct documentation, the `dynamoDbStreamParameters` is a specific field that details with setting up a stream handler. And then the `filterCriteria` allows the developer to specify how to filter the input should they desire. It's in a very similar style to how EventBridge Rules work so that [documentation](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns-content-based-filtering.html) was helpful as i was learning. Think of filters as removing noise from your system. And by filtering down to just one event you can really isolate the workflow. You could also have done this with EventBridge rules so again you've got choice and flexibility. So use it how you see fit.

### Target Parameters

```typescript
targetParameters: {
    eventBridgeEventBusParameters: {
        detailType: 'SampleTableModified',
        source: 'com.sample'
    },
    inputTemplate: `
        {
          "details": {
            "meta-data": {
              "correlationId": <$.eventID>
            },
            "data": {
              "PK": <$.dynamodb.Keys.PK.S>,
              "SK": <$.dynamodb.Keys.SK.S>,
              "Field1": <$.dynamodb.NewImage.Field1.S>
            }
          }
        }          
    `,
},

```

So here is where I find a ton of value. I spend a lot of time transforming data so that I can get it into a payload that makes sense.

### Raw Event and Transformed

```json
{
    "eventID": "b8f3cb6ec96bde1583a951cbf29cf3e4",
    "eventName": "MODIFY",
    "eventVersion": "1.1",
    "eventSource": "aws:dynamodb",
    "awsRegion": "us-west-2",
    "dynamodb": {
        "ApproximateCreationDateTime": 1676153518,
        "Keys": {
            "SK": {
                "S": "KEY1"
            },
            "PK": {
                "S": "KEY1"
            }
        },
        "NewImage": {
            "SK": {
                "S": "KEY1"
            },
            "PK": {
                "S": "KEY1"
            },
            "Field1": {
                "S": "Some value a"
            }
        },
        "OldImage": {
            "SK": {
                "S": "KEY1"
            },
            "PK": {
                "S": "KEY1"
            },
            "Field1": {
                "S": "Some value"
            }
        },
        "SequenceNumber": "1300000000034821079730",
        "SizeBytes": 70,
        "StreamViewType": "NEW_AND_OLD_IMAGES"
    }
}
```

Lots and lots of really good data but is pretty noisy and then puts the formatting and prep work on the client. I'd really rather the client just pick up the data and do its work. All the transformation should happen once and in a single and testable place.

So by applying that inputTemplate up above, the developer can shape the input into something that makes sense for their ecosystem. Meaning the final message might look like this

```json
{
        "account": "xxxxxxx",
        "detail": {
                "data": {
                    "Field1": "Some value again - This time",
                    "PK": "KEY1",
                    "SK": "KEY1"
                },
                "meta-data": {
                    "correlationId": "eea1d60888eb59d75cf6c210cafb9bff"
                }
            
        },
        "detail-type": "SampleTableModified",
        "id": "15cf1aad-9d98-7dd4-6a00-3ec41cc08873",
        "region": "us-west-2",
        "resources": [],
        "source": "com.sample",
        "time": "2023-02-12T16:42:23Z",
        "version": "0"
    }
```

Much much cleaner output.

So now that the event is formatted and it gets put onto EventBridge how does that translate into something that a Lambda can handle?

### Lambda

For this demo, I did a very simple Go lambda that just dumps the input out to Cloudwatch

The handler definition

```typescript
this._handler = new GoFunction(this, `SampleHandlerFunc`, {
    entry: path.join(__dirname, `../src/sample-handler`),
    functionName: `sample-handler`,
    timeout: Duration.seconds(30),
});
```

And the handler cod

```go
func handler(ctx context.Context, event interface{}) error {
	log.SetLevel(log.InfoLevel)
	log.SetFormatter(&log.JSONFormatter{})
	log.WithFields(
		log.Fields{
			"event": event,
		}).Info("Logging out the event")

	return nil
}

```

### EventBridge Rule

Lastly, we need to wire up the Event to a Rule that Targets the Lambda.

Here's a super simple rule that looks for a `source` and then forwards it along. There are so many more options to explore when setting this up and I wouldn't advise this setup for production since it's lacking error handling and failure.

```typescript
const rule = new events.Rule(this, 'ModifySampleRule', {
    eventPattern: {
        source: ["com.sample"]
    },
    ruleName: "sample-table-modified-rule",
    eventBus: props.bus
});


rule.addTarget(new LambdaFunction(props.func, {
    maxEventAge: cdk.Duration.hours(2),
    retryAttempts: 1,
}));

```

### The Output

When it's all said and done, you'll have an output that looks like this in Cloudwatch

![AWS Cloudwatch JSON output](/images/output-1024x529.jpg)

## Wrap Up

Hopefully the above has been a helpful starter into your world of streaming DynamoDB to EventBridge Pipes for filtering, enriching and transforming events as they move through your systems.

With any technology or approach as it relates to AWS, there are usually many ways to build things and I wouldn't say this is the only way, but for me personally I'm going to be looking to use these techniques in systems that have needs for Event Routing, Event shaping and Event forwarding.

Thanks for reading!
