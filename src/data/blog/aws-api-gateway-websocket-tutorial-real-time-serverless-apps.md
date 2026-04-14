---
title: "AWS API Gateway WebSocket Tutorial: Real-time Serverless Apps"
author: "Benjamen Pyle"
description: AWS API Gateway WebSocket tutorial showing how to build real-time serverless apps with Lambda, DynamoDB, and CDK using Golang step by step.
pubDatetime: 2023-10-08T00:00:00Z
tags:
  - aws
  - cdk
  - golang
  - programming
  - serverless
draft: false
---

I was working recently with some backend code and I needed to communicate the success or failure of the result back to my UI. I instantly knew that I needed to put together a WebSocket to handle this interaction between the backend and the front end. With all the Serverless and non-Serverless options out there though, which way do I go? How about plain old WebSockets with AWS API Gateway and Serverless? Let's build an AWS API Gateway WebSocket in this tutorial.

## Design

> WebSocket is a computer communications protocol, providing full-duplex communication channels over a single TCP connection - Wikipedia

In a nutshell, a WebSocket is a persistent channel beyond two systems that can share data back and forth. There are many different ways to create and manage WebSockets but when I need to use one, I often reach for my favorite tools. AWS API Gateway, [Lambda and DynamoDB](https://binaryheap.com/api-gateway-lambda-dynamodb-rust/ "API Gateway, Lambda, DynamoDB and Rust").

![Architecture](/images/socket_diagram.png)

When using AWS API Gateway V2 as a WebSocket manager you have a few things to configure.

Establishing and breaking a connection has two handlers you can implement. Connect and Disconnect. These do what you think they do.

From the messaging standpoint, you can offer a variety of routes that can be used for duplex communication but for this example, I want to explore another approach. That is another backend component responding to an event and then broadcasting that change to all clients that have a socket connection established. The DynamoDB table will help maintain those connections.

## Building an AWS API Gateway WebSocket Tutorial

To build our WebSocket with AWS API Gateway and Serverless, I'm going to use [CDK with TypeScript](https://binaryheap.com/intro-to-cdk/) to provision the infrastructure and Golang for the Lambda source code.

I'm going to break down the article in this order

- Setting up the DynamoDB Table for the SocketRoster
- Defining the AWS API Gateway V2
- [Building Lambdas for handling](https://binaryheap.com/building-serverless-applications-with-aws-handling-events/ "Building Serverless Applications with AWS – Handling Events")
  - OnConnect
  - OnDisconnect
  - Listening to an SQS for changes and Publishing

### DynamoDB Table

The purpose of this table is to hold the roster of active WebSocket connections. This will be useful when I get to the point of publishing data to those established.

The table is super simple and is set up with a basic partition key and sort key.

```typescript
export class TableConstruct extends Construct {
  private readonly _table: Table;

  get table(): Table {
    return this._table;
  }

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this._table = new Table(scope, "SocketTable", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      tableName: `SocketRoster`,
    });
  }
}
```

A few things to note.

- The table is set to be destroyed when the stack is destroyed
- Pay-per-request pricing vs reserved
- Notice the key that I discussed above

### AWS API Gateway V2

I don't think most people reach for AWS API Gateway when building a WebSocket. For me personally, I like leveraging this component for a couple of reasons.

1.  It feels like using AWS API Gateway when using REST APIs. So familiarity
2.  AWS API Gateway is Serverless which means I have very little to manage and the burden is mostly on configuration

#### Defining the Gateway

To define an AWS API Gateway for building WebSockets, you'll need two additional CDK Packages.

- [WebSocket Integration](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-apigatewayv2-integrations-alpha-readme.html)
- [AWS API Gateway V2](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-apigatewayv2-alpha-readme.html)

```typescript
import { WebSocketApi, WebSocketStage } from "@aws-cdk/aws-apigatewayv2-alpha";
import { WebSocketLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
```

The API will be defined like this:

```typescript
this._api = new WebSocketApi(this, "RestApi", {
  description: "Sockets API",
  apiName: "sockets-api",
  connectRouteOptions: {
    integration: new WebSocketLambdaIntegration("ConnectIntegration", f),
  },
  disconnectRouteOptions: {
    integration: new WebSocketLambdaIntegration("DisConnectIntegration", f2),
  },
});

this._api.grantManageConnections(f3);
new WebSocketStage(this, "SocketStage", {
  webSocketApi: this._api,
  stageName: "main",
  autoDeploy: true,
});
```

It looks similar to using the REST API constructs with a couple of different route options. Let's first have a look at the Connect.

#### Connect Route Options

When the user or client connects to your WebSocket API you'll have the opportunity to perform some logic or store some data about this connection. For this example, I'm going to use a Lambda handler that will use the SocketRoster DynamoDB table to hold those active connections.

[Building the SocketConnectFunction in CDK](https://binaryheap.com/ecs-serviceconnect-with-cdk/ "ServiceConnect with CDK builds Strong Service Affinity") is straightforward.

```typescript
const f = new GoFunction(scope, "SocketConnectFunction", {
  entry: "src/socket-connect",
  functionName: `socket-connect`,
  timeout: Duration.seconds(15),
  environment: {
    IS_LOCAL: "false",
    LOG_LEVEL: "DEBUG",
  },
});
```

![Connect](/images/connect-socket.png)

The Golang handler code is a little bit different from a normal AWS API Gateway Proxy Request.

```go
func handler(ctx context.Context, event events.APIGatewayWebsocketProxyRequest) (*events.APIGatewayProxyResponse, error) {

    err := WriteConnection(ctx, dbClient, event.RequestContext.ConnectionID)

    if err != nil {
        logrus.WithFields(
            logrus.Fields{"connectionId": event.RequestContext.ConnectionID}).
            Error("Error writing the connection")
        return &events.APIGatewayProxyResponse{
            StatusCode:        500,
            MultiValueHeaders: nil,
            Body:              "{ "body": "bad" }",
        }, err
    }

    return &events.APIGatewayProxyResponse{
        StatusCode:        200,
        MultiValueHeaders: nil,
        Body:              "{ "body": "good" }",
    }, nil
}
```

The `APIGatewayWebsocketProxyRequest` struct contains key details about the request such as the ConnectionID. `event.RequestContext.ConnectionID`. This `ConnectionID` is what will be written into the SocketRoster table.

```go
func WriteConnection(ctx context.Context, client *dynamodb.Client, connectionId string) error {

    c := &Connection{
        PK:           "CONN#" + connectionId,
        SK:           "CONN#" + connectionId,
        ConnectionId: connectionId,
        Established:  time.Now(),
    }
    m, _ := attributevalue.MarshalMap(c)

    _, err := client.PutItem(ctx, &dynamodb.PutItemInput{
        TableName: aws.String("SocketRoster"),
        Item:      m,
    })

    return err
}
```

Back to why. The purpose of this data is so that I can use the active connections roster to publish messages later in the example.

#### Disconnect Route Options

When connecting WebSockets with AWS API Gateway, you need a way to unregister active connections in the DDB Roster. Enter the Disconnect integration.

Disconnect in CDK looks just like Connect.

```typescript
const f2 = new GoFunction(scope, "SocketDisConnectFunction", {
  entry: "src/socket-disconnect",
  functionName: `socket-disconnect`,
  timeout: Duration.seconds(15),
  environment: {
    IS_LOCAL: "false",
    LOG_LEVEL: "DEBUG",
  },
});
```

![Disconnect](/images/disconnect-socket.png)

Additionally, the Golang handler code looks similar as well.  
Another `APIGatewayWebsocketProxyRequest` will be used for removing the `Connection` by its ID from the table.

```go
func DeleteConnection(ctx context.Context, client *dynamodb.Client, connectionId string) error {
    _, err := client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
        TableName: aws.String("SocketRoster"),
        Key: map[string]types.AttributeValue{
            "PK": &types.AttributeValueMemberS{Value: "CONN#" + connectionId},
            "SK": &types.AttributeValueMemberS{Value: "CONN#" + connectionId},
        },
    })

    return err
}
```

#### Connect and Disconnect

With both of these events handled, the example code will now deal with the two key events in a WebSocket lifecycle. The last remaining component is publishing data to the connection.

### Publishing Data to Established Connections

Now that I've got a list of established connections, let's publish data into those listeners. Building WebSockets with AWS API Gateway can be further extended by mixing in some more Serverless components.

A popular example is extending a DynamoDB stream, reading data from Kinesis or the tried and true SQS listener that publishes into those connections. For the balance of the article, I'm going to use SQS as the source for the publisher.

#### Building the SQS Queue

Building the queue is simple with CDK. I'm also adding a DLQ just for good practice and in case I make any mistakes in my Lambda handler.

```typescript
export class QueueConstruct extends Construct {
  private readonly _queue: Queue;

  get queue(): Queue {
    return this._queue;
  }

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const dlq = new Queue(scope, "PublishDLQ", {
      queueName: "socket-dlq",
    });

    this._queue = new Queue(scope, "PublishQueue", {
      queueName: "socket-queue",
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 1,
      },
    });
  }
}
```

#### Attaching a Function Handler

Now with a queue built, I can develop the Lambda to handle the queue message and then publish that message out to my established connections.

```typescript
const f3 = new GoFunction(scope, "SocketPublisher", {
  entry: "src/socket-publisher",
  functionName: `socket-stream-publisher`,
  timeout: Duration.seconds(15),
  environment: {
    IS_LOCAL: "false",
    LOG_LEVEL: "DEBUG",
    API_ENDPOINT: "<insert endpoint>", // fill in your details
    REGION: "<insert region>", // fill in your details
  },
});

f3.addEventSource(
  new SqsEventSource(queue, {
    batchSize: 10,
  })
);
```

#### Diving into the Golang Handler

Let's dive into the handler. This is where the power of WebSockets with AWS API Gateway comes in for me. I'm going to use some normal [Lambda and AWS SDK code to publish](https://binaryheap.com/eventbridge-with-lambda-and-rust/ "Leveraging the SDK to Publish an Event to EventBridge with Lambda and Rust") messages to established listeners. I don't need to know anything beyond the SDK and the `ConnectionID` of the listener, which I've stored in DynamoDB.

I'm going to dive a little deeper into this Lambda because there is an AWS API Gateway piece in here that is a little unique. The `init()` func of my Golang handler is defined like this.

```go
func init() {
    logrus.SetFormatter(&logrus.JSONFormatter{})
    logrus.SetLevel(logrus.DebugLevel)

    awsCfg, _ := awscfg.LoadDefaultConfig(context.Background())
    awstrace.AppendMiddleware(&awsCfg)
    dbClient = NewDynamoDBClient(awsCfg)
    // this is the AWS API Gateway Client
    apigateway = NewAPIGatewaySession()
}
```

The AWS API Gateway session is created specific to the AWS API Gateway Endpoint required.

```go
func NewAPIGatewaySession() *apigatewaymanagementapi.ApiGatewayManagementApi {
    sess, _ := session.NewSession(&aws.Config{
        Region:   aws.String(os.Getenv("REGION")),
        Endpoint: aws.String(os.Getenv("API_ENDPOINT")),
    })

    return apigatewaymanagementapi.New(sess)
}
```

Now the handler itself.

```go
func handler(ctx context.Context, event events.SQSEvent) error {
    connections, err := FindConnections(ctx, dbClient)

    if err != nil {
        return err
    }

    logrus.WithFields(logrus.Fields{"event": event}).Debug("The body")
    for _, e := range event.Records {
        b, _ := json.Marshal(e.Body)

        for _, c := range connections {
            connectionInput := &apigatewaymanagementapi.PostToConnectionInput{
                ConnectionId: aws.String(c.ConnectionId),
                Data:         b,
            }

            output, err := apigateway.PostToConnection(connectionInput)

            if err != nil {
                logrus.Errorf("error posting=%s", err)
                return nil
            }

            logrus.Infof("(output)=%v", output)
        }
    }

    return nil
}
```

What I'm doing in this is looping all of the records that are in the SQS Event and posting them into every connection that I've found in the DDB Table. Now, this is not production grade as you might have thousands of connections established and not everyone needs to get the same message. But this should give you some idea of how you could further extend this pattern. Perhaps store the UserID along with the connection or by customer or grouping. The possibilities are only limited by your use case.

## Testing the Example

Don't be shocked, but Postman is an excellent tool for testing WebSockets with AWS API Gateway. It's a great tool for testing WebSockets in general.

Walking through the testing, I'll need a socket connection and a test message.

### Creating the Socket Connection

In Postman, create a new Request that is a WebSocket request.

![WebSocket Request](/images/postman-new-socket.jpg)

In the URL, grab the name supplied by AWS which will be a subdomain of amazonaws.com and attach the stage defined in the build. Back in the CDK code, I defined my stage as `main`.

Once that's set, hit `Connect`

![WebSocket Connect](/images/postman-connected.jpg)

Upon success, you'll see a message like I've circled in yellow.

### Sending a Test Message

There are lots of ways to create messages in SQS, but for simplicity let's do that through the Console. Find the `socket-queue` that was created in the infra build and put something in the message body. Now hit Send Message.

![Send Message](/images/socket-test-message.jpg)

### Viewing the Message

And finally, jump back over to Postman where you will see the message body you submitted to appear in your results window like I've circled below in yellow.

![WebSocket with AWS API Gateway](/images/postman-message-received.jpg)

Congratulations, a working WebSocket implementation with AWS API Gateway with some Serverless mixed in!

## Wrapping Up

We went through a lot of code in the above article but so much of it should have felt familiar if you've been doing Serverless for a while in AWS. However, if you are new to Serverless, then hopefully this gave you a nice concrete example of the power of using events and handlers to deal with changes in your application.

The [source code](https://github.com/benbpyle/apigateway-websocket-sample) for this article can be found at this link. Follow along in the README to deploy and destroy the code as you see fit. Remember, this one is not production grade right out of the gate but would make a nice starter if you were building a WebSocket implementation with AWS AWS API Gateway.

Thanks for reading and Happy Building!
