---
title: AWS Step Functions Callback Pattern
author: "Benjamen Pyle"
description: "Some operations in a system function asynchronously. Many times, those same operations must also happen to be responsible for coordinating external workflows to provide an overall status on the execut"
pubDatetime: 2023-08-24T00:00:00Z
tags:
  - aws
  - cdk
  - data
  - golang
  - programming
  - serverless
draft: false
---

Some operations in a system function asynchronously. Many times, those same operations must also happen to be responsible for coordinating external workflows to provide an overall status on the execution of the main workflow. A natural fit for this problem with AWS is to use Step Functions and make use of the Callback pattern. In this article, I'm going to walk through an example of the Callback pattern while using AWS' HealthLake and its export capabilities as the backbone for the async job. Welcome to the AWS Step Functions Callback Pattern.

## Callback Workflow Solution Architecture

Let's first start with the overarching architecture diagram. The general premise of the solution is that AWS' HealthLake allows the export of all resources "since the last time". By using Step Functions, Lambdas, SQS, DynamoDB, S3, Distributed Maps and EventBridge I'm going to build the ultimate Serverless Callback workflow. I feel like outside of Kinesis and SNS, I've touched them all in this one.

![AWS Step Functions Callback Pattern Architecture](/images/export_flow.png)

There's quite a bit going on in here so I'm going to break it down into segments which will be:

1.  Triggering the State Machine
2.  Record Keeping and Run Status
3.  Running the Export and initiating the Callback
4.  Polling the Export and Restarting the State Machine
5.  Working the results
6.  Wrapping Up
7.  Dealing with Failure

Hang tight, there's going to be a bunch of code and lots of detail. If you want to jump to code, it's down at the bottom [here](#code)

## The Workflow

Real quickly before diving into the steps of the workflow. All the code in this article will be using [CDK](https://binaryheap.com/intro-to-cdk/) (TypeScript), Golang and is backed by AWS' [HealthLake](https://aws.amazon.com/healthlake/). HealthLake might be my favorite Serverless database outside of DynamoDB. I'm also running this pattern in production with a great deal of volume. So rest assumred what I'm showing can easily be hardened to run in production in your environment.

### Triggering the Callback Workflow State Machine

HealthLake has a tight quota on the number of "Exports" that can be running at any given time. That number is **1** which makes the timing of the trigger and the management of "locking" the State Machine important. For the trigger, I'm using an EventBridge Schedule that runs every 5 minutes. That schedule is going to look like a Cron expression that dictates the frequency.

```typescript
const rule = new Rule(scope, "ExportRule", {
  description: "Runs the CDC Export Process",
  schedule: Schedule.expression("cron(0/" + 5 + " * * * ? *)"),
});
```

With a rule built, I'll then add a Target, a Dead Letter Queue and a Role for the rule to leverage.

```typescript
const dlq = new Queue(this, "RuleDeadLetterQueue", {
  queueName: "healthlake-cdc-trigger-dlq",
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
```

With everything deployed, the rule in the Console will look like the below image.

![Event Bridge Schedule](/images/cdc_schedule.jpg)

### Record Keeping and Run Status

Remember at the beginning of the article I mentioned there is a hard quota on the number of exports running at one time? For this State Machine, I've got a DynamoDB table that holds a few pieces of information in a record.

The first record I'm keeping is the last run to know 2 things. One, is there a job currently running? And two, when was the last time the job was executed so that I can include that time in the filter parameters of the export? The record looks like this.

```json
{
  "runStatus": "COMPLETED",
  "lastRunTime": "2023-08-24T15:45:34.265Z",
  "id": "RUN"
}
```

Secondarily, I'm holding the current run's time-triggered so that when the state machine finishes successfully, I can update the above record with this time so that I don't have any gaps in my math.

```json
{
  "id": "CURRENT_RUN",
  "triggerTime": "2023-08-24T15:45:34.265Z"
}
```

The nice thing about this part of the workflow is that I'm using Native SDK calls with Step Functions so I don't need any additional compute and only pay for the read/write units with DynamoDB.

#### Workflow Branch

Notice that the "Last Run State" is a choice that works off of the data found in the "Find Last Run" step. If the job is currently running, the state machine will just skip this run and mark success. However, if the job is not currently running, it then sets the run time and sets that "RUN" record to "RUNNING" so that the export can begin.

### Running the Export and initiating the Callback

So far nothing should seem different. Just a Step Function with a State Machine that is running some native SDK steps. But this is where things are going to take a turn. First, if you plan to use the Callback Pattern with AWS Step Functions, you need to make sure that your State Machine is a STANDARD and not an EXPRESS workflow. In EXPRESS workflows you don't have the option to use the Callback Pattern. With a STANDARD workflow, you've got up to a year before the State Machine times out, so quite a bit more room there. Also, think about it this way. The duration drives cost with EXPRESS flows. While transitions drive cost on STANDARD flows. This makes much more sense when you have something that might be waiting for some time.

#### Inside the State Machine

For this workflow, I'm going to post a message on an SQS Queue for a Lambda to pick up and read and do something with. Additionally, I'm going to pass along the task token which is the callback ticket that my other workflow will need to use when sending Success, Failure or Heartbeats back to the State Machine. Heartbeat? What is that? It's a nice feature of the callback pattern that if your other workflow doesn't check in for whatever period you set, the State Machine will give up and mark that step as a failure and fall through the rest of your workflow. Handy, right? The Heartbeat is configurable.

That definition in ASL JSON (Amazon State Language) has this shape.

```json
{
  "Next": "Map",
  "Type": "Task",
  "HeartbeatSeconds": 120,
  "Resource": "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
  "Parameters": {
    "QueueUrl": "${StartExportQueueUrl}",
    "MessageBody": {
      "taskToken.$": "$.Task.Token",
      "lastRunTime.$": "$.context.lastRunTime",
      "runStatus.$": "$.context.runStatus"
    }
  },
  "Catch": [
    {
      "ErrorEquals": ["States.ALL"],
      "Next": "Set Failed"
    }
  ]
}
```

#### Launching the Export

Now to launch the actual export with AWS HealthLake, I've got a Lambda Function that is reading from the Queue that the State Machine posted into. This for me is where the AWS Step Functions Callback Pattern shines because I have another workflow doing its work that has access to a mechanism to update the main workflow on its progress. The other workflow could be doing anything you need, but in this article, that thing is HealthLake and its export process which by design is an asynchronous operation.

The internals of the Function aren't that important other than it reads from the queue, pulls the last run time and constructs the payload that is required for executing the export. The POST request uses the below payload. Before looking at the payload, note the `_since` parameter on the URL. That comes into the queue from the State Machine and the DynamoDB table which tells the export how far back to look for resources.

```json
// https://healthlake.us-west-2.amazonaws.com/datastore/{{HL_STORE_ID}}/r4/$export?_since=2023-07-18T00:00:00.461Z
{
  "JobName": "2023-07-19 15:06:49 +0000 UTC",
  "OutputDataConfig": {
    "S3Configuration": {
      "S3Uri": "s3://<the s3 uri>",
      "KmsKeyId": "arn:aws:kms:us-west-2:<account id>:key/<key id>"
    }
  },
  "DataAccessRoleArn": "arn:aws:iam::<account id>:role/<key id>"
}
```

Upon completion of the API call, the lambda puts a message on the queue with the job details.

```go
messageOutput, err := sqsClient.SendReCheckMessage(ctx, &models.ExportStatusWithTaskToken{
    ExportStatus: models.ExportStatus{
        DatastoreId: exportOutput.DatastoreId,
        JobStatus:   exportOutput.JobStatus,
        JobId:       exportOutput.JobId,
    }, TaskToken: body.TaskToken,
})
```

The details in that message will give the job status function enough details to do its work which is simply, to check the status and if done, grab the output and tell the State Machine to get back to work. Or if the job fails, the same thing, hey State Machine, get back to work!

### Polling the Export and Restarting the State Machine

Alright, the export is running. How long that takes depends upon how much data it needs to export. Small datasets will be done in less than 30 seconds. Larger datasets might take upwards of 2 or 3 minutes. It is fairly efficient.

Something you might not use very often with SQS is the delayed delivery feature. The message is hidden from visibility until the time elapses.

```go
message := sqs.SendMessageInput{
    QueueUrl:     &s.reCheckQueueUrl,
    DelaySeconds: 30,
    MessageBody:  &sb,
}
```

When that message becomes available, the Lambda Function will read the payload and make a describe request. It will use the JobId to make a request out to HealthLake to interrogate the state of that job. HealthLake will return the state of the export. Our function will put another message on the queue with a 30-second delay if the job is in STARTED or RUNNING. However, if FAILED or COMPLETED it will first build a manifest file (which we will discuss shortly) and then notify the State Machine to finish its work.

So what is this manifest file? I didn't want to lead with this, but this sample code also demonstrates how to use a Distributed Map step. That map state will use a file that contains the keys of the exported files as input. This input will be iterated and used to propagate HealthLake changes. The manifest is built from the output of the describe API call. I promised at the beginning there'd be a lot going on and a bunch of details. We are deep in the weeds at the moment on how this workflow comes together.

Lastly, this side workflow ends up with sending the status back to the State Machine. Here are the 3 types of responses back in Golang code

**The Heartbeat**

```go
input := &sfn.SendTaskHeartbeatInput{
    TaskToken: &exd.TaskToken,
}

_, err := sfnClient.SendTaskHeartbeat(ctx, input)

```

**The Success**

```go
strOutput := fmt.Sprintf("{"bucket": "%s", "manifest": "%s"}", bucketName, *file)
input := &sfn.SendTaskSuccessInput{
    TaskToken: &exd.TaskToken,
    Output:    &strOutput,
}
```

**The Failure**

```
input := &sfn.SendTaskFailureInput{
    TaskToken: &exd.TaskToken,
}

_, _ = sfnClient.SendTaskFailure(ctx, input)
```

One more snippet of code, we can't forget to give the function access to these operations.

```go
f.describeExportFunction.addToRolePolicy(
    new PolicyStatement({
        actions: [
            "states:SendTaskFailure",
            "states:SendTaskHeartbeat",
            "states:SendTaskSuccess",
        ],
        effect: Effect.ALLOW,
        resources: [cdc.sf.stateMachineArn],
    })
);
```

### Working the results

Now we've reached the restart of the workflow. Let's first assume failure. In that case, I am making a native SDK call to DynamoDB. The call updates the RUN record indicating that the job has failed. I don't update the last run time so that I can pick this period up again if needed.

In the case of success though, the Lambda sends back the S3 URI to the manifest file which is a JSON array. When building AWS Step Functions with the Callback Pattern, you might be dealing with a large number of results. The inline map can handle a max of 40 at a time. In the case of an export, there might be 100s or 1000s of files generated. The export is using NDJSON which is Newline Delimited JSON. So I might have multiple records in each export file.

Using this distributed map sends one file to each iteration which then is picked up by a Lambda which breaks up the NDJSON into separate records for a standard in-line map that does the propgation of the change.

### Overall sub-map

![Sub-Map](/images/map_single_workflow.jpg)

### Execution Output of sub-map

![Sub-Map Execution Stats](/images/export_status.jpg)

![Sub-Map Execution](/images/map_run.jpg)

#### Publishing the results

I skipped over the prepare change function that is at the beginning of the sub-map flow because it's outside of the scope of this article. But when you choose AWS HealthLake you are signing up for a [FHIR](http://hl7.org/fhir/) compliant datastore. FHIR stands for Fast Healthcare Interoperable Resource and it's the go-to and preferred format for exchanging Patient and other Healthcare data between domain boundaries externally. The prepare function breaks the NDJSON up and makes little FHIR payloads to be sent downstream into the ecosystem.

The EventBridge PutEvents SDK call puts these individual FHIR objects onto an EventBridge custom bus. That custom bus then opens up the world of destinations that can be both internal and external.

![Custom Bus](/images/event_bus.jpg)

### Wrapping Up

Let's pull up a bit from the weeds and assume that everything went as expected. The things left to do in the workflow are:

1.  Update the job status to "COMPLETED"
2.  Update the last run time to the time logged at the beginning of the workflow.

These two things will set the next run up for success.

### Dealing with Failure

And on the flip side, if any step encounters failure, we simply do one thing.

1.  Update the last run job status to failure.

This will tell the incoming run of the workflow that the previous one did not finish cleanly, therefore just pick up and run from the last time. The next run will use that non-mutated time in the `_since` query parameter that I highlighted many paragraphs above so HealthLake can grab what's changed.

## Code

This has been a deep dive into several concepts. The genesis for the article was built upon AWS Step Functions Callback Pattern, but to do that we needed HealthLake's export capabilities and the recently released Distributed Map capability in Step Functions. I've tried to not over-code the article but there is an [accompanying repository](https://github.com/benbpyle/healthlake-export-manager) that is fully working and deployable. Be careful, however, HealthLake can be a bit **pricey** to run so watch how long you leave the stack up.

## Wrapping up

I hope you are still with me as that was a fairly deep look at several different concepts and serverless components all in one. When building with AWS Step Functions and the Callback Pattern, you have a great deal of flexibility in how you handle your workflows but are powered by a very simple approach to Success, Failure and Heartbeats with the TaskToken.

This has been my first encounter with the Callback Pattern and AWS Step Functions and my perception beforehand was that it would be complex and difficult to accomplish. That was an unfounded and emotional response to something that seems difficult on the surface but I was pleasantly surprised at how quickly and easily I was able to pull this together. Additionally, I hadn't used the Distributed Map state either, and again, something as complex as a distributed map is mostly abstracted away from me so that I could focus on just building the logic I needed and not the infrastructure or undifferentiated heavy lifting it required. That's the beauty of Serverless and the beauty of AWS.

Until next time and Happy Building!
