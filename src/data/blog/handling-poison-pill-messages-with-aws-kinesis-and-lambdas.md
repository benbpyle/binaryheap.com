---
title: "Handling \"Poison Pill\" Messages with AWS Kinesis and Lambdas"
author: "Benjamen Pyle"
description: Handling bad messages in Kinesis streams when using them as event sources with Lambdas
pubDatetime: 2022-12-29T00:00:00Z
tags:
  - aws
  - cdk
  - infrastructure
  - programming
  - serverless
draft: false
---

Queues and streams are fundamentally different in how they handle readers consuming their information.

With an SQS Queue you can have many consumers but generally one consumer will win reading the message and in the event of success the message is purged from the queue or upon failure that message is returned back to the queue. It technically doesn't get deleted, yet the its visibility property is changed. Hence why the VisibilityTimeout on the queue matters. If your code processes messages in more time than that property then you are going to get messages that constantly get put back on the queue for retry.

Versus with a stream, it's storing data for the period of time you specify and consumers can indicate what place in the stream they want to read from. Each consumer can have its own placeholder and read from it at its own pace. The data is expunged only when it expires from the retention window.

This matters greatly as if you have failure in a queue, the message can be purged or moved and the next one can be picked up. However if in a stream, you keep going back to that same bad message over and over and over and the only way you get to move on is when that message expires. If you are using the default Kinesis window, that's 24 hours. This means you won't pick up anything new for a full day. Bummer right? This is often described as the "Poison Pill" problem. Luckily, working with Kinesis and Event Sources from Lambdas has a way to handle this and when working with devs for the first time on the differences between Queues and Streams, this problem usually bears its head in production. Hopefully this article gives you some insight into how to mitigate that so you don't encounter the issue at all but if worse case you do, you recognize it and know how to solve. Because "can't we just purge the stream?" is a bad option and not really possible.

[If you want to jump straight to a sample repository with code, here you go](https://github.com/benbpyle/cdk-kinesis-poison-pill)

To illustrate this, we need to setup a queue and a Lambda function. As in previous articles, my default for Lambdas is Go and my default these days for IaC is CDK with Typescript

## Handler

The handler code in the Lambda is super simple. Using the `aws-lambda-go/events` library, the incoming payload gets marshalled into a strongly typed event. In this case, I'm doing nothing but printing and looping. However if there was an error that occurred for instance inside that loop, returning the error would keep the iterator at the last read sequence and not allow it to process forward thus creating the poison message.

Really important to remember you are not reading messages from a queue, your lambda is reading based upon an iterator which holds the location of last read. It's a stream of data that is some time period in size and your processor is just reading that stream like a book. **Others could be reading it and having no problems with the poison message**. So again, the bad message might affect all consumers or just one consumer. You really need to understand how your system works.

```go
package main

import (
	"context"
	"github.com/aws/aws-lambda-go/events"
	"log"

	"github.com/aws/aws-lambda-go/lambda"
)

func main() {
	lambda.Start(handler)
}

func handler(ctx context.Context, e events.KinesisEvent) error {
	for _, r := range e.Records {
		log.Printf("Printing out the record %v\n", r)
	}

	return nil
}

```

## Lambda Configuration

When the infra gets deployed, you end up with a Lambda that looks like this with the source and destinations configured

![Lambda kinesis sqs setup](/images/lambda_config-1024x465.jpg)

Kinesis is the event source which is what the lambda is pulling from and then I've configured SQS to be a destination. What these means is that if there is any failure in processing the records from the kinesis read and the lambda returns the error, then those records will get put onto that queue based upon the number of retries or other configuration options we've set.

Here's what the CDK code looks like to make this happen

```typescript
import {Construct} from "constructs";
import {GoFunction} from "@aws-cdk/aws-lambda-go-alpha";
import {Duration} from "aws-cdk-lib";
import {Stream} from 'aws-cdk-lib/aws-kinesis';
import {Queue} from 'aws-cdk-lib/aws-sqs';
import * as path from "path";
import {KinesisEventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import {StartingPosition} from "aws-cdk-lib/aws-lambda";
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';


export class OneLambda extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        // create the go function from src
        let func = new GoFunction(this, `OneLambda`, {
            entry: path.join(__dirname, `../src`),
            functionName: `sample-func`,
            timeout: Duration.seconds(30)
        });

        // create a kinesis stream (ignoring encryption, but you should encrypt this)
        let stream = new Stream(this, 'TheStream', {
            streamName: 'sample-stream',
            shardCount: 1
        })

        // create a SQS Queue for Failure
        // (ignoring encryption, but you should encrypt this and I believe AWS does now by default)
        let queue = new Queue(this, 'FailureQueue', {
            queueName: `sample-failure-queue`,
        })

        // grant the func to have read access to the stream
        stream.grantRead(func);

        // create an event source for the Lambda to read from kinesis
        func.addEventSource(new KinesisEventSource(stream, {
            startingPosition: StartingPosition.TRIM_HORIZON, // Start reading the beginning of data persistence
            batchSize: 10, // how many to pull
            retryAttempts: 1, // how many times to retry
            bisectBatchOnError: false, // kinesis will split the batch up to work it's way to isolate the error
            onFailure: new SqsDestination(queue) // where do the failed reads go
        }));

    }
}

```

I've made a bunch of comments in the code above but the `addEventSource` func is what you want to pay attention to. This is where you can configure how the lambda reads, how many items it reads and what happens on failure. You have several options for the Destination in the `onFailure` property but I tend to favor SQS. If you want to read more on the options, here are the [docs](https://docs.aws.amazon.com/cdk/api/v1/docs/aws-lambda-event-sources-readme.html)

When this gets deployed you end up with a Lambda that has an event source that looks like the below

![Processing results](/images/kinesis_pull-1024x682.jpg)

And with a destination for that lambda that looks like this

![DLQ destination](/images/failure_queue-1024x188.jpg)

## Wrap up

This is a pretty simple example of using Destinations and Event Source Failures when working with Kinesis and Lambdas. I can guarantee you that you won't know you need something like this until you really know that you need it. One thing that I always ask during design reviews is "What happens when 'x' fails?" And then I'll follow it up with "What happens when 'x' fails with high volume?".

It can be pretty easy to track down and recover from issues when you have just handful of messages in Kinesis, but that's probably not the problem you have because then when use Kinesis. And using these techniques can help you deal with those unfortunate scenarios
