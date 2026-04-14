---
title: Creating an Async Integration with AWS Step Functions from API Gateway via CDK
author: "Benjamen Pyle"
description: I often have the scenario where there is a client which makes a request to an endpoint and they just want to make sure that payload was delivered but not necessarily concerned about the outcome. A pre
pubDatetime: 2022-12-17T00:00:00Z
tags:
  - aws
  - cdk
  - programming
  - serverless
draft: false
---

I often have the scenario where there is a client which makes a request to an endpoint and they just want to make sure that payload was delivered but not necessarily concerned about the outcome. A pretty simple Async operation that happens over a quick Sync channel.

In the past, I've done my best either with a Lambda function to make sure it was so simple that it was incapable of failure. As I progressed further into that solution, I started using AWS Integrations to drop the payload off in an SQS Queue and then having a Lambda read that queue and then decide what to do.

I kept thinking that there has to be a better way to make this exchange simpler while also continuing to be durable and scalable. From some conversations and talks I sat in on during AWS' re:Invent I started thinking more about using Step Functions to make this happen. With Step Functions I get the ability to have the hand-off from client to API Gateway and then API Gateway triggering the StartExecution operation of the Step Function. Once Gateway gets a 200 from the States API, it returns back to the client. Should the Start not happen, then it can return a 500 back to the client indicating some kind of failure. From there, I can take as much time as needed doing the async operation with whatever the backend job needs to do.

But how could I take this a step further (no pun intended) and do it all with CDK which from previous articles you can see that I really do love working with. What's below was my approach to achieving the architecture I wanted with the above listed technologies.

If you'd like to skip straight to a working sample, here's the [Github repos](https://github.com/benbpyle/cdk-steps-gateway-sample)

## High Level Architecture

![API Gateway step function integration](/images/arch-715x1024.png)

Pretty straightforward but what this shows is the client calling Gateway and gateway triggering the start of the State Machine.

What's nice about this again is that you can have as much complexity or as lengthy of a task as you want in the State Machine and the client gets their response in < 500ms on average which is the latency on the gateway integration and triggering the state machine. Totally acceptable to me.

Lastly, this will work with both Express and Standard workflows. But for the sake of this post, I'll be using an Express workflow

## CDK Code

Let's work backwards from what the State Machine looks like

![Simple workflow](/images/workflow-1024x527.png)

This is just a demo/sample so it's very bland and boring. The execution dumps right into a Lambda that prints out the payload and then goes into a Success state.

### The Lambda

```go
package main

import (
    "context"
    "log"

    "github.com/aws/aws-lambda-go/lambda"
)

func main() {
    lambda.Start(handler)
}

func handler(ctx context.Context, event interface{}) error {
    log.Printf("Printing out the event %v\n", event)
    return nil
}

```

Like I said, very basic. And the CDK code that defines this Lambda

```typescript
import {Construct} from "constructs";
import {GoFunction} from "@aws-cdk/aws-lambda-go-alpha";
import {Duration} from "aws-cdk-lib";
import * as path from "path";

export class OneLambda extends Construct {
    private readonly _func: GoFunction;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this._func = new GoFunction(this, OneLambda, {
            entry: path.join(__dirname, ../src),
            functionName: sample-func,
            timeout: Duration.seconds(30)
        });
    }

    get function(): GoFunction {
        return this._func
    }
}

```

One thing to note is that I'm showing a "Getter" to provide access into the IFunction that'll be used later on in the Step Function

### Step Function Definition

That above Express Workflow is so simple, but it still requires some Typescript to pull it together. For this example, I'm defining all of the State Machine in Typescript but you could also use a Definition file and import it into the Construct. **Be aware, using import from file forces you into an L1 construct which is mostly pretty raw. Defining in code allows you to use the L2 construct which has more sugar built into it.**

With that said, here's how it looks

```typescript
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as sf from "aws-cdk-lib/aws-stepfunctions";
import * as stepfunctions from "aws-cdk-lib/aws-stepfunctions";
import { LogLevel } from "aws-cdk-lib/aws-stepfunctions";
import * as logs from "aws-cdk-lib/aws-logs";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";

export class StateMachineStack extends Construct {
  private readonly _stateMachine: sf.StateMachine;

  get stateMachine(): sf.StateMachine {
    return this._stateMachine;
  }

  constructor(scope: Construct, id: string, oneFunc: IFunction) {
    super(scope, id);

    const successState = new stepfunctions.Pass(this, "SuccessState");
    let oneFuncInvoke = new tasks.LambdaInvoke(this, "OneFuncInvoke", {
      lambdaFunction: oneFunc,
      comment: "For the demo",
      outputPath: "$.Payload",
    });

    oneFuncInvoke.next(successState);
    const logGroup = new logs.LogGroup(this, "sample-state-machine", {
      logGroupName: "/aws/vendedlogs/states/sample",
    });

    this._stateMachine = new stepfunctions.StateMachine(
      this,
      "MyStateMachine",
      {
        definition: oneFuncInvoke,
        stateMachineType: stepfunctions.StateMachineType.EXPRESS,
        logs: {
          level: LogLevel.ALL,
          destination: logGroup,
          includeExecutionData: true,
        },
      }
    );
  }
}
```

See the simple LambdaInvoke task and then it just passes along the output into the Success state. The definition property of the State Machine construct just takes an IChainable which is what all of the tasks and flows output. Small aside but you can also use native SDK integrations. It's a little bit trickier and a little harder to find documentation on, but here's a small snippet of code that works for Kinesis. You should be able to adapt from there

```typescript
new CallAwsService(this, 'KinesisPublish', {
    action: "putRecords",
    iamResources: [<your stream arn>],
    parameters: {
    Records: [
        {
            "Data.$": "$",
            "PartitionKey": "Key"
        }],
        "StreamName": "<your-stream-name>"
    },
    service: "kinesis"
})

```

### API Gateway

The last step of this is to wire up the API Gateway. For that, we are going to use AWS Service Integrations. There are so many services you can directly call from API Gateway which you can look further into. The main thing to take care of is the resource policy that grants API Gateway to make the operation happen. Remember, don't grant "\*" and don't grant all operations. Just do what you need in order to make that operation happen.

```typescript
import { Construct } from "constructs";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import {
  Effect,
  Policy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { AwsIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";

export class ApiGatewayConstruct extends Construct {
  private readonly _api: RestApi;

  constructor(scope: Construct, id: string, stateMachine: StateMachine) {
    super(scope, id);

    this._api = new RestApi(this, "RestApi", {
      description: "Sample API",
      restApiName: "Sample API",
      disableExecuteApiEndpoint: false,
      deployOptions: {
        stageName: main,
      },
    });

    // Api Gateway Direct Integration
    const credentialsRole = new Role(this, "StartExecution", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
    });

    credentialsRole.attachInlinePolicy(
      new Policy(this, "StartExecutionPolicy", {
        statements: [
          new PolicyStatement({
            actions: ["states:StartExecution"],
            effect: Effect.ALLOW,
            resources: [stateMachine.stateMachineArn],
          }),
        ],
      })
    );

    this._api.root.addMethod(
      "POST",
      new AwsIntegration({
        service: "states",
        action: "StartExecution",
        integrationHttpMethod: "POST",
        options: {
          credentialsRole,
          integrationResponses: [
            {
              statusCode: "200",
              responseTemplates: {
                "application/json": { status: "webhook submitted" },
              },
            },
            {
              statusCode: "500",
              responseTemplates: {
                "application/json": { status: "webhook failed" },
              },
            },
          ],
          requestTemplates: {
            "application/json": `
                        #set($input = $input.json('$'))
                         {
                           "input": "$util.escapeJavaScript($input).replaceAll("\\\\'", "'")",
              "stateMachineArn": "${stateMachine.stateMachineArn}"
            }`,
          },
        },
      }),
      {
        methodResponses: [{ statusCode: "200" }],
      }
    );
  }
}
```

Things to pay attention to.

- AwsIntegration is the class you want to use
- Look at the
  - Service: 'states'. this is the State Machine service
  - Action: 'StartExecution'. the operation. Notice the difference in StartSyncExecution. That'll run this operation in sync.
- Integration responses. You can customize what you return based upon what's return from the States call. You could just as easily return the execution ID among other things
- The request template

```typescript
requestTemplates: {
    "application/json":
    `#set($input = $input.json('$'))
     {
          "input": "$util.escapeJavaScript($input).replaceAll("\\\\'", "'")",
          "stateMachineArn": "${stateMachine.stateMachineArn}"
     }
}
```

The above blocks transforms the input to API Gateway into the input required for the States call. Which has to look like

```json
{
  "input": "<the input>",
  "stateMachineArn": "<the arn>"
}
```

All of that code wires up the architecture and the workflow that's been outlined above.

## Wrap up

The really nice thing about this pattern is that it is just a starting point. You can extend it by making a sync style call which really starts to use Step Functions to power APIs that Web Clients could use. Wow, mind blown! You can also use this pattern to build extensive workflow backends that are free and clear of the client responsibility. You can then trigger whatever you need and communicate back up to the client via a socket or a message or something else.

Serverless patterns really are almost infinite in what you want to do and how you want to compose your solutions and architecture. It scales so well. It is cost efficient and it allows you switch out parts and pieces as you find a need for other components.

Enjoy and happy building!
