---
title: Handling Change with AWS Healthlake
author: "Benjamen Pyle"
description: AWS HealthLake change data capture using CloudTrail, EventBridge, and Step Functions enables event-driven workflows for FHIR resource mutations.
pubDatetime: 2023-01-30T00:00:00Z
tags:
  - serverless
draft: false
---

One of the features that I am currently missing with AWS [Healthlake](https://aws.amazon.com/healthlake/) is a proper "event-ing" framework. With [DynamoDB](https://aws.amazon.com/dynamodb/) you've got streams. With [RDS](https://aws.amazon.com/rds/) you can use [DMS](https://aws.amazon.com/dms/). But with Healthlake there is no native change data capture mechanism.

Being that I'm only working on event driven architectures these days, I needed a way to be able to handle change. What I'm going to show you below is not "sanctioned" but it is 100% AWS native and continues with the Serverless theme. With that said, here's the [Github Repository](https://github.com/benbpyle/healthlake-cdc) if you just want to jump ahead. **_The CDK code will deploy_** **_a Healthlake instance @ $.27 / hr so please run_** `cdk destroy npx ts-node bin/app.ts`\` when you are done

### The Need

Being in an EDA (Event Driven Architecture) I wanted to be able to trigger workflows downstream asynchronously in addition to being serverless. Without native support for this in Healthlake (yet) I ventured off to figure out if I could possibly check on trails/logs somewhere and make something happen. Below is the architecture this article discusses

![Healthlake CDC architecture](/images/CDC-1024x638.png)

The architecture is fairly straightforward. Here's the breakdown though of how it works

1.  Every API call that is made to Healthlake is logged in AWS Cloudtrail
2.  Set up an Event Bridge rule that listens to these events and any event that is a PUT or POST I then forward onto a State Machine that can handle that event
3.  Then filter the events. As you'll see below, you don't get the ID of the thing that was mutated, just the time it was mutated. So I first need to find everything that has been changed
4.  Then do some dedup'ing. My clients are always idempotent but I don't want to force unnecessary noise into the ecosystem that I **can** prevent.
5.  Write that change into a Custom Event Bus on Event Bridge and then let clients setup their own rules for working with the events

### Working through the Cloudtrail and Audit

So to capture events from Cloudtrail I needed an EventBridge rule to make that happen. It looks like this

```typescript
const rule = new events.Rule(this, "rule", {
  eventPattern: {
    source: ["aws.healthlake"],
    detailType: ["AWS API Call via CloudTrail"],
    detail: {
      eventSource: ["healthlake.amazonaws.com"],
      eventName: ["CreateResource", "UpdateResource"],
      requestParameters: {
        datastoreId: [hl.attrDatastoreId],
      },
      responseElements: {
        statusCode: [200, 201],
      },
    },
  },
  ruleName: "capture-healthlake-events",
});
```

What this is doing is listening on Cloudtrail for all "CreateResource" and "UpdateResource" events that are sent to Healthlake. By further restricting the rule down to only those that have `statusCode` of 201 and 200 which will be those PUT and POST events.

Next add a target for the rule to be a Lambda handler

```typescript
const queue = new sqs.Queue(this, "Queue", {
  queueName: `rule-event-dlq`,
});

rule.addTarget(
  new LambdaFunction(props.func, {
    deadLetterQueue: queue, // Optional: add a dead letter queue
    maxEventAge: cdk.Duration.hours(2), // Optional: set the maxEventAge retry policy
    retryAttempts: 2, // Optional: set the max number of retry attempts
  })
);
```

Once the event has been handled then kick off a State Machine that does the following

- Find just the changed enties
- Hydrate or back fill with data
- Post into EventBridge

### State Machine Workflow

If you really dig into the event that is logged in Cloudtrail, the rub boils down to this. The element that has the resourceID is going to be hidden from view. You'll see this text

`"resourceId": "HIDDEN_DUE_TO_SECURITY_REASONS"`

That's all well and good but it makes things very difficult when trying to determine what has changed. The below is how the workflow shapes out

![CDC Step functions state machine](/images/Screenshot-2023-01-30-at-11.55.17-AM-1024x573.png)

Let's take a deeper dive into the Patient workflow.

First off, there is a pause at the beginning of the workflow as i noticed a small lag in reads as I know they aren't consistent.

Next the patient hydrator is executing a search against the Patient resource to look for all changes since the event timestamp

```
url := fmt.Sprintf("https://%s/%s/r4/Patient?_lastUpdated=ge%s", h.HealthLakeEndpoint, h.HealthLakeDataStore, lastUpdated.Format(time.RFC3339))
```

Disclaimer, I could use native SDK integrations for the next two steps in terms of using DynamoDB but I opted for Lambdas. What I'm doing in those is preparing the record for publish and then checking to see if I've handled it already. I've got a simple DynamoDB table that keeps a daily log of things touched.

Lastly, if the record is a first timer, then I send on over to the EventBridge Bus I created earlier so that others could subscribe to it

### Wrap Up

If you look at the repos to follow along, there is a lot going on with this solution.

- Healthlake is the originator of the changes
- Cloudtrail holds the events and operations that are happening to Healthlake
- You need to build an EventBridge rule (has to be in the default bus) to listen to those changes
- Build a handler or pipe to deal with the change
- State machine work flow can be complex
  - Pauses
  - Hydrators / finding what changed
  - Multiple resource types must be implemented
  - Deduping
  - Posting into a custom Event Bridge Bus

But honestly, Healthlake needs to be a critical part of the ecosystem due to it's natural FHIR and Patient centered data storage so these changes need to be propagated into the broader ecosystem. So until AWS builds this capability, this solution works great for what I need it to do.

Hopefully you can take and apply it and/or adapt it to fit your needs!
