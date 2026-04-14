---
title: DynamoDB Incremental Export with Step Functions
author: "Benjamen Pyle"
description: "When working on building solutions, the answer to some problems is often, it depends. For instance, if I need to deal with data as it changes and use DynamoDB, streams are the perfect feature to take"
pubDatetime: 2023-10-25T00:00:00Z
tags:
  - aws
  - cdk
  - data
  - serverless
  - typescript
draft: false
---

When working on building solutions, the answer to some problems is often, it depends. For instance, if I need to deal with data as it changes and use DynamoDB, streams are the perfect feature to take advantage of. However, some data doesn't need to be dealt with in real-time, once a day or every 30 minutes might be good enough. This was problematic up until recently, as AWS released [incremental exports with DynamoDB](https://aws.amazon.com/about-aws/whats-new/2023/09/incremental-export-s3-amazon-dynamodb/). In this article, I want to explore building an incremental export with DynamoDB and Step Functions.

## Export Architecture

DynamoDB exports are an asynchronous feature that involves requesting an export and then coming back to process the data once it's been completed. As I was solving a problem recently and needed to leverage this functionality, I instantly thought of using Step Functions to manage the workflow to guarantee completion.

I went through a couple of iterations of this state machine but ultimately decided on doing it with native SDK integrations which I'll highlight. The balance of the article will be about how to build a scalable incremental export with DynamoDB and Step Functions.

## The Solution

### State Machine

Defining a State Machine that supports building a DynamoDB incremental export is going to require one of the STANDARD varieties. This is as opposed to an EXPRESS State Machine because I don't have any guarantees about duration. And the EXPRESS will cap out at 15 minutes. I wrote about [the Callback Pattern](https://binaryheap.com/aws-healthlake-export/) a few articles ago in the context of AWS HealthLake. And while this pattern is fantastic, I wanted to approach it natively inside of Step Functions.

The State Machine has the following responsibilities

1.  Manage the export record as a job to ensure only one runs at a time
2.  Triggers the incremental export
3.  Manages the workflow of the export status
4.  Runs a describe export to continue pausing or to mark as successful or a failure
5.  Mark the run as a success or failure based on the status of the export

When that comes together, it looks like the below diagram.

![State Machine](/images/dd_export_state_machine.png)

The power of this pattern is that I'm using the native SDK integrations to do all of the heavy lifting. This operates over the public API specifications and I'm doing it without incurring execution or compute expenses in something like Lambda or Fargate. Yes, I'm paying for the operations on DynamoDB and the state transitions in a STANDARD workflow, but not having compute. Very freeing!

### Managing the Executions

Triggering the State Machine is super simple when doing it from an EventBridge Schedule. For this use case, I'm not exactly sure how long the export will run for and my business problem doesn't require more than a 30-minute lag on updates. So this example will assume the same thing.

```typescript
export class ScheduleConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ScheduleProps) {
    super(scope, id);

    const rule = new Rule(scope, "ExportRule", {
      description: "Runs the DynamoDB Export Process",
      schedule: Schedule.expression("cron(0/" + 30 + " * * * ? *)"),
    });

    const dlq = new Queue(this, "RuleDeadLetterQueue", {
      queueName: "ddb-trigger-dlq",
    });

    const role = new Role(this, "Role", {
      assumedBy: new ServicePrincipal("events.amazonaws.com"),
    });

    rule.addTarget(
      new SfnStateMachine(props.stateMachine, {
        deadLetterQueue: dlq,
        role: role,
      })
    );
  }
}
```

At the start of every execution when building an incremental DynamoDB export with Step Functions, the first thing that the state machine does is find the last run in the job table. Once that run has been found, the state machine will proceed to the finished state if there is a job still running. In any other case, it'll move onto

- Getting the last run time
- Setting the main job record to running

```json
{
  "Find Last Run": {
    "Next": "Last Run State",
    "Type": "Task",
    "ResultPath": "$.context",
    "ResultSelector": {
      "runStatus.$": "$.Item.runStatus.S",
      "lastRunTime.$": "$.Item.lastRunTime.S",
      "currentRunTime.$": "$.Execution.StartTime"
    },
    "Resource": "arn:aws:states:::dynamodb:getItem",
    "Parameters": {
      "Key": {
        "id": {
          "S": "RUN"
        }
      },
      "TableName": "JobExport",
      "ConsistentRead": true
    }
  }
}
```

### Exporting the Data

The export part of building an incremental DynamoDB export with Step Functions is done through a native integration. A few things to note about the export.

1.  If using Incremental, I need to use the Incremental Specification which I'll show below
2.  The time period of the window needs to be greater than 15 minutes
3.  The export will not incur any RCUs (Read Capacity Units)
4.  The export will be billed based on the size of the data that is exported and the S3 PUT operations

Here is a subset of the State:

```json
{
  "ExportTableToPointInTime": {
    "Type": "Task",
    "Next": "Export Status",
    "Parameters": {
      "S3Bucket": "<Bucket-Name>",
      "TableArn": "<Table-Arn>",
      "ExportFormat": "DYNAMODB_JSON",
      "ExportType": "INCREMENTAL_EXPORT",
      "IncrementalExportSpecification": {
        "ExportFromTime.$": "$.context.lastRunTime",
        "ExportToTime.$": "$.context.currentRunTime",
        "ExportViewType": "NEW_IMAGE"
      }
    }
  }
}
```

Few things to note on the specification.

I'm using the JSON export format. There is an ION format to be explored, but that's beyond the article's scope. The export type is incremental. When using this type, you _must_ use the `IncrementalExportSpecification`. Inside that object, I need to specify the From, To and ViewType

The output of this state that matters are two elements.

1.  `"ExportStatus": "FAILED|IN_PROGRESS|COMPLETED"`
2.  `"ExportArn": "<export arn>"`

Both of those matter for the next steps.

### The Waiting Game

I've established 3 custom paths and 1 default path on the `Choice` state. This covers all of the ExportStatus options as well and if for some reason I get something else back, I just dump out to completing the state machine.

All of this is coordinated by the output from a `DescribeExport` step and a 60-second `Wait` state. All in all, a very simple approach to managing the do-while loop

The Choice State:

```json
{
  "Export Status": {
    "Type": "Choice",
    "Choices": [
      {
        "Variable": "$.ExportDescription.ExportStatus",
        "StringEquals": "IN_PROGRESS",
        "Next": "Pause To Verify Export"
      },
      {
        "Variable": "$.ExportDescription.ExportStatus",
        "StringEquals": "FAILED",
        "Next": "Set Failed"
      },
      {
        "Variable": "$.ExportDescription.ExportStatus",
        "StringEquals": "COMPLETED",
        "Next": "Get Triggered Time"
      }
    ],
    "Default": "Get Triggered Time"
  }
}
```

Pause and Describe:

```json
{
  "Pause To Verify Export": {
    "Type": "Wait",
    "Seconds": 60,
    "Next": "DescribeExport"
  },
  "DescribeExport": {
    "Type": "Task",
    "Next": "Export Status",
    "Parameters": {
      "ExportArn.$": "$.ExportDescription.ExportArn"
    },
    "Resource": "arn:aws:states:::aws-sdk:dynamodb:describeExport",
    "Catch": [
      {
        "ErrorEquals": ["States.ALL"],
        "Next": "Set Failed"
      }
    ]
  }
}
```

### Failure and Completion

The last part of the workflow when building an incremental DynamoDB export with Step Functions is to mark the Job as successful or failure. That comes in two parts.

Part 1 is to update the record in the Job table. Part 2 is to mark the State Machine itself as successful or failed.

That is all there is to it.

![](/images/ddb_export_finish-1024x942.png)

## Wrapping Up Building Incremental DynamoDB Exports with Step Functions

I love using Step Functions. It is one of my favorite AWS services. But that love is enhanced when I can build native SDK integration-only solutions.

Using native SDK integrations only gives me a few advantages.

1.  I'm using code that AWS wrote and is way more tested than anything I'll build
2.  I can leverage a visual tool to build my work
3.  I don't have to waste money or time building compute workflows just to execute SDK API calls
4.  Deployments are a touch faster because I don't have to upload code in the Lambda packages.

I describe this as Codeless Serverless. Of course, I have some code, but I'm doing without the Compute Code. And again, I love it. As with most of my examples, here is the [GitHub Repository](https://github.com/benbpyle/dynamodb-incremental-export-sf) that you can clone, fork, star or just explore. It is more than enough to get you started and you might not have to do much more to it.

My hope is that this pattern gives you something to build upon if you need to use DynamoDB exports but also opens your mind up to going Codeless and using Step Functions to take on more advanced workflows like this.

And as always, Happy Building!
