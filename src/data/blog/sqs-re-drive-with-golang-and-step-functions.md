---
title: SQS Re-Drive with Golang and Step Functions
author: "Benjamen Pyle"
description: Earlier this week a new set of APIs were released for working with Dead-Letter-Queues and re-drives back to its primary queue. Messaging-based systems have been around for a long time and they are a c
pubDatetime: 2023-06-10T00:00:00Z
tags:
  - aws
  - cdk
  - golang
  - observability
  - serverless
draft: false
---

Earlier this week a [new set of APIs were released](https://aws.amazon.com/blogs/aws/a-new-set-of-apis-for-amazon-sqs-dead-letter-queue-redrive/) for working with Dead-Letter-Queues and re-drives back to its primary queue. Messaging-based systems have been around for a long time and they are a critical piece of modern Event-Driven Architecture. As I read more about the APIs, I started thinking about how I could build up a sample that could be used for starting a hardened auto-re-drive State Machine that could put messages back on queues protected behind an API Gateway or Event Bridge Scheduler. Below is my take on how I might start thinking through building an SQS re-drive with Golang and Step Functions

## Design

As with everything I'm doing these days, I'm using [CDK with TypeScript](https://binaryheap.com/intro-to-cdk/) to build up all of the infrastructure.

I'm also making use of 2 of the 3 new APIs and IAM Actions to make this happens. Those are

-   [StartMessageMoveTask](https://awscli.amazonaws.com/v2/documentation/api/latest/reference/sqs/start-message-move-task.html)
-   [ListMessageMoveTasks](https://awscli.amazonaws.com/v2/documentation/api/latest/reference/sqs/list-message-move-tasks.html)

## Step Function Workflow

With the infrastructure run and the components created, I ended up with the following State Machine.

![SQS re-drive Golang Step Functions](/images/redrive-sm.png)

I'm 100% sure that the new APIs will end up as supported SDK Tasks, but as of right now, I'm using 2 Lambdas to deal with calling the SQS APIs.

Let's do a walkthrough of each of the steps

### Start Re-drive

**_The bottom of the article has a link to the GitHub repos with full README._**

The re-drive Lambda is responsible for kicking off the re-drive activity when building an SQS re-drive with Golang and Step Functions. I'm using the State's input as a way to specify the SQS that will be operated upon. That must be a full ARN.

```go
func handler(ctx context.Context, event *Payload) (*Payload, error) {
    log.Info("Handling redrive")

    input := &sqs.StartMessageMoveTaskInput{
        SourceArn: &event.QueueArn,
    }

    output, err := client.StartMessageMoveTask(ctx, input)

    if err != nil {
        log.WithFields(log.Fields{
            "err": err,
        }).Error("Error starting redrive")
        return nil, err
    }

    n := &Payload{
        QueueArn: event.QueueArn,
        Status:   "INITIATED",
    }

    log.WithFields(log.Fields{
        "output": output,
    }).Info("Redrive started")
    return n, nil
}

```

`Payload` is a struct that I'm using to pass data through the State Machine. But the `StartMessageMoveTaskInput` is the struct that is the passed input into the SQS client. Again, you'll need a full ARN.

`output, err := client.StartMessageMoveTask(ctx, input)` does the actual execution of the move. You will get back the ARN that you executed the start on and you'll also get a TaskHandle back. **_Side-note is that I wanted to use the TaskHandle more, but the list task that you'll see below doesn't seem to take it as input so for now, I'm ignoring it._**

### WaitTask

The next step up is a re-usable Wait task that first pauses for several seconds before allowing the next Task to check the status. This step could be either #2 in the chain or #n as you can continue to have the State Machine loop until completion. I'm using an EXPRESS Step Function so that it can't wait more than 5 minutes, but honestly, it's not going to take that long for all but close to an infinite amount of messages. I tested on 10s of thousands and it was done in 4 or 5 loops.

The CDK code looks like this

```typescript
buildWaitTask = (scope: Construct, duration: Duration): sf.Wait => {
    return new sf.Wait(scope, "Wait for Redrive", {
        time: sf.WaitTime.duration(duration),
    });
};

```

### Checking in on the re-drive

Upon "waiting", I'm then checking the status of the move. Another Golang function steps in to do the job

```go
func handler(ctx context.Context, event *Payload) (*Payload, error) {
    log.Info("Handling redrive")

    input := &sqs.ListMessageMoveTasksInput{
        SourceArn: &event.QueueArn,
    }

    output, err := client.ListMessageMoveTasks(ctx, input)

    if err != nil {
        log.WithFields(log.Fields{
            "err": err,
        }).Error("Error starting redrive")
        return nil, err
    }

    log.WithFields(log.Fields{
        "output": output,
    }).Info("Redrive started")

    if len(output.Results) == 1 {
        return &Payload{
            Status:   *output.Results[0].Status,
            QueueArn: event.QueueArn,
        }, nil

    }

    return &Payload{
        Status:   "NOT_FOUND",
        QueueArn: event.QueueArn,
    }, nil
}

```

Again, notice in this code that you need the full ARN. What I ended up doing is using the same struct over and over in the payloads to keep things simple.

```go
type Payload struct {
    QueueArn string `json:"queueArn"`
    Status   string `json:"status"`
}

```

I'm also making sure that if there are no MOVE tasks on the DLQ, I can just indicate that in how I resolve the State Machine. There are a handful of useful states including RUNNING, COMPLETED, CANCELLING, CANCELLED, and FAILED.

### The Choice

In the case that things take a little longer than your first Wait when running an SQS re-drive with Golang and Step Functions, then a choice needs to be made.

This is what that looks like:

```typescript
buildStatusChoice = (
    scope: Construct,
    wait: IChainable,
    success: IChainable,
    unknownSuccess: IChainable,
    failed: IChainable
): IChainable => {
    return new Choice(scope, "Redrive Status", {
        comment: "Decide if the redrive status is good, on-going or unknown",
    })
        .when(Condition.stringEquals("$.status", "COMPLETED"), success)
        .when(Condition.stringEquals("$.status", "UNKNOWN"), unknownSuccess)
        .when(Condition.stringEquals("$.status", "RUNNING"), wait)
        .otherwise(failed);
};

```

-   If the status is still running, loop back to Wait.
-   If the move is completed, close it out
-   If unknown (that's my state), then let the State Machine know that
-   Anything else falls into a Fail task.

## Setting up the Sample

I wish there was more to it in a way but there isn't. It all feels super simple. And once the SDK Integration is put into Step Functions, this will go from building an SQS re-drive with Golang and Step Functions to building an SQS re-drive just Step Functions.

### Running the Infrastructure Code

```bash
cdk deploy # will deploy all the code

```

Resources created

-   Lambdas
    -   Redriver
    -   Redrive status check
    -   Processor
-   SQS
    -   Sample Queue
    -   Dead Letter Queue
-   Step Functions
    -   Workflow State Machine
-   CloudWatch
    -   Lambda log groups
    -   State Machine log group

### Processor Lambda

There is a Processor Lambda in this code as well. It reads from the primary SQS to let you simulate failure and success. In the processor CDK code, there is an environment variable that indicates how the processor should work. It's the `FAIL` variable. `true` means the Lambda will be put in Failure Mode

```typescript
this._func = new GoFunction(scope, `ProcessorFunc`, {
    entry: "src/processor",
    functionName: "processor",
    timeout: Duration.seconds(30),
    environment: {
        IS_LOCAL: "false",
        LOG_LEVEL: "debug",
        FAIL: "true",
    },
});

```

```go
func handler(ctx context.Context, event events.SQSEvent) error {
    log.WithFields(log.Fields{
        "message": event,
    }).Info("Handling Processing")

    fail, _ := strconv.ParseBool(os.Getenv("FAIL"))

    if fail {
        return errors.New("in failure mode")
    }

    return nil
}

```

### Putting a Message on the Queue

```bash
aws sqs send-message --queue-url https://sqs..amazonaws.com//sample --message-body "Hello World"

```

### Starting the State Machine

```bash
aws stepfunctions start-execution --state-machine-arn arn:aws:states:::stateMachine:SqsRedriveWorkflow --input "{\"queueArn\": \"arn:aws:sqs:::sample-dlq\"}"

```

### Tearing Down

```bash
cdk destroy

```

## Wrapping up

I'm not sure why these APIs took so long to roll out, but I'm so glad that they are here. When building an SQS re-drive with Golang and Step Functions you now can automate and self-recover from issues in your EDA platforms via a native workflow and not cobbling together pre-existing APIs. I like that it works just like the console does.

As always, [here is the repository](https://github.com/benbpyle/sqs-redrive-sample) with a fully working sample of what I wrote about above. I'm super excited to get something into production soon that my teams can take advantage of. I'm equally excited to see where they and the community takes the use of these APIs.

Happy building!
