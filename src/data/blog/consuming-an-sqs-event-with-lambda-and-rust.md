---
title: Consuming an SQS Event with Lambda and Rust
author: "Benjamen Pyle"
description: "I've been trying to learn Rust for the better part of this year. My curiosity peaked a few years back when I learned the AWS-led Firecracker was developed with the language. And I've continued to want"
pubDatetime: 2023-11-03T00:00:00Z
tags:
  - aws
  - infrastructure
  - programming
  - rust
  - serverless
draft: false
---

I've been trying to learn [Rust](https://www.rust-lang.org/) for the better part of this year. My curiosity peaked a few years back when I learned the AWS-led [Firecracker](https://aws.amazon.com/blogs/aws/firecracker-lightweight-virtualization-for-serverless-computing/) was developed with the language. And I've continued to want to learn it ever since. Fast-forward and I'm jumping both feet in. That's usually how I work. I must admit that right now, I'm the most noob of noobs, but that's not going to keep me from sharing what I'm up to and what I'm learning. For me, this blog is as much about sharing as it is about learning and communicating to those reading that it's OK to be where you are in your journey. There are no straight lines. Only periods of growth and plateaus. In this article, I'll walk you through consuming an SQS Event with Lambda and Rust.

## Architecture

The diagram here is super simple. I'm going to write something a little later that shows how this code could fit into a bigger workflow, but for now, I'm keeping it basic. And yes, that's the [SAM Squirrel](https://aws.amazon.com/serverless/sam/) in there.

![Consuming an SQS Event with Lambda and Rust](/images/rust_reader.png)

## Small Detour

Why would I learn Rust after espousing the greatness of Golang for the past 3 + years? For the record, I love Go. I do. And I hope to continue getting better at being a Go programmer. I find Go to be a super fit for so many things and using Go Routines makes concurrency such a joy.

However, so much of what I build these days doesn't take advantage of the power of concurrency. I write a lot of Lambdas. I mean a lot. And for me, Lambdas are responding to events, doing some processing and moving on. Seven times out of ten, my code is waiting on IO as well. By mixing Rust into my toolkit, I gain these two key benefits that I just can't compare to Go or any other language.

1.  Performance. Everyone lists this as a reason and it's true. But it matters because when you are billed per `ms` per `memory allocated`, every `ms` that your code runs makes it more and more expensive. Especially with volume.
2.  Cold Starts. This is a hot topic for sure. And Go is no slouch here. But again, Rust compiles down very small (which helps) and is quick to initialize, thus reducing the burden on the end user.

There are many other reasons to check out Rust. No garbage collection, enums are taken to another level and dealing with memory and allocation via ownership and lifetimes are just a few off the top of my head. Again, I'm not very good at Rust yet, but I'm committed to getting there. It has taken me a solid 30 days to get to the point where I can diagnose errors without the help of the compiler and Google. And I know that I'm at least 90 days from being proficient, but I do think it's worth it. The language is super safe and yet significantly powerful and performant all at the same time.

## SAM

For the balance of this article, I'll be walking through some code that brings all of this together. I opted to use SAM here because I had seen a post about the beta features enabling Rust Lambdas with SAM and wanted to check them out. Not surprisingly things worked amazing well.

I want to point out a few things in the below snippet from the `template.yaml`

-   Handler: bootstrap - I'm using a single function in this template and while you can change the binary and the output, for my first, I just stuck with the default `bootstrap` binary
-   Architecture: I'm using the arm64 runtime. When doing cross-compiles with x86, I ran into a Core Dump that I traced back to the architecture. I didn't dig too deeply so might be worth exploring, but go Arm and you'll be fine.
-   BuildMethod: rust-cargolambda - This one was new for me but using Cargo Lambda is a dream.

```yaml
Resources:
    SampleFunction:
        Type: AWS::Serverless::Function
        Metadata:
            BuildMethod: rust-cargolambda
        Properties:
            FunctionName: sample-rust-function
            CodeUri: ./ # Points to dir of Cargo.toml
            Handler: bootstrap # Do not change, as this is the default executable name produced by Cargo Lambda
            Runtime: provided.al2
            Architectures:
                - arm64
            Events:
                StreamEvent:
                    Type: SQS
                    Properties:
                        Queue: !GetAtt SourceQueue.Arn
                        BatchSize: 10
```

## Cargo Lambda

My journey through consuming an SQS Event with Lambda and Rust was enhanced when I embraced [Cargo Lambda](https://www.cargo-lambda.info/). Per the documentation:

> Run, Build, and Deploy Rust functions on AWS Lambda natively from your computer, no containers or VMs required. - Cargo Lambda

I gained build tools, project builders and local tooling to help make my experience better. This all nicely integrates into SAM as well and if I'm not mistaken it parcels out the build steps to Cargo Lambda.

One of the nicer capabilities is the notion of `watching` a project. Node has had this for a long time. SAM does the same thing as do many others. But for a compiled language to watch your source, recompile and host it in a local runtime for you to test with. Super clean.

The steps locally to make this happen are easy.

```bash
# Terminal 1
cargo lambda watch

# Terminal 2
cargo lambda invoke --data-file <your-event.json>
```

Again, SAM do qes a lot of this for you, but having Cargo and Lambda tooling in one place is nice.

## Consuming the Event

For this example, I wanted to do something a little more than just a basic JSON event. I decided that what if I had data streaming in from DyanmoDB? I've explored this before [here](https://binaryheap.com/dynamodb-eventbridge-pipes-enrichment/), [here](https://binaryheap.com/streaming-aws-dynamodb-to-a-lambda-via-eventbridge-pipes/), [here](https://binaryheap.com/unmarshalling-a-dynamodb-map-into-a-go-struct/) and [here](https://binaryheap.com/dynamodb-streams-eventbridge-pipes-multiple-items/). So the use case is pertinent and real.

My sample event (while make-believe) is compliant with a normal DDB stream record.

```json
{
    "awsRegion": "us-west-2",
    "dynamodb": {
        "ApproximateCreationDateTime": 1698684566,
        "Keys": { "id": { "S": "12345" } },
        "NewImage": {
            "id": { "S": "12345" },
            "name": { "S": "Sample event name" },
            "description": { "S": "Sample description is here" },
            "customNote": { "S": "Custom note to test the deserialization" }
        },
        "OldImage": {
            "id": { "S": "12345" },
            "name": { "S": "Old event name" },
            "description": { "S": "Old description is here" },
            "customNote": { "S": "Old custom note to test the deserialization" }
        },
        "SequenceNumber": "1085327500000000022289801774",
        "SizeBytes": 1245,
        "StreamViewType": "NEW_AND_OLD_IMAGES"
    },
    "eventID": "86bde389b5c7566b6d22295e02514c74",
    "eventName": "MODIFY",
    "eventSource": "aws:dynamodb",
    "eventVersion": "1.1",
    "eventSourceARN": "arn:aws:dynamodb:us-west-2:123:table/Table/stream/2023-10-30T16:25:48.204"
}
```

### The Struct

In Rust, you can bring in external libraries, called [Crates](https://crates.io/). Think of Crates.io like you would NPM, Yarn, NuGet, Maven or another external dependency manager. For comparison, I greatly prefer it to the Git-style approach of Golang.

```rust
use serde::{Deserialize};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MainModel {
    id: String,
    name: String,
    description: String,
    custom_note: String
}
```

Something that might feel common coming from C# or Java is the ability to annotate code. These annotations are powerful and give you control over how behavior and operations might be applied to your function or struct. In this case, I'm bringing in the `serde` "Serializer/Deserializer" crate which is a framework for doing just what it says.

In Rust, conventions are that variables are named in snake\_case and not camelCase so while this might take some getting used to, SerDe provides a way to enable this transformation. Notice that the struct above matches the shape of the `New_Image` in the DynamoDB Stream Event.

### Main

So AWS Labs has a [Crate](https://crates.io/crates/aws_lambda_events) for working with Lambda Events in Rust. The code below leverages this crate for the signature and marshaling of the incoming event. In addition to this crate, the Lambda Runtime that is a part of the Rust SDK is also used to execute the handler code.

A small note on the Rust AWS SDK. It is currently in Developer Preview. However, the project's latest README indicates that it's production-ready, but not production-supported. More of a use-at-your-own-risk type of thing. At this point, I personally would be comfortable shipping with it, but I know that some might prefer something that is marked production-ready. If you want to explore another AWS SDK, [rusoto](https://github.com/rusoto/rusoto) might be for you. However, I imagine the SDK will go GA soon. That's a hunch and NOTHING official. I am not speaking for AWS here.

Another thing to point out is that `async` is a thing in Rust. I'm not going to begin to dive into this paradigm in this article, but know it's handled by the awesome [Tokio](https://tokio.rs/) framework.

The neatest little detail that I love, is that in my func parameters, I have `LambdaEvent<SqsEventObj<EventRecord>>`. What the LambdaEvent struct will do, is marshall my incoming data into the inner-most templated struct.

In my case, the inner record is part of the lambda\_events crate. These two structs below hold the shape and behavior of my incoming data. Be careful though when working with Lambda Events and the official DDB Crate. If you've worked in other languages before you know that each team owns its libraries and there are some small nuances. The Rust implementation is no different.

```rust
use aws_lambda_events::dynamodb::EventRecord;
use aws_lambda_events::event::dynamodb::StreamRecord;
```

```rust
// function_handler
// Lambda handler code for responding to events read from SQS
async fn function_handler(event: LambdaEvent<SqsEventObj<EventRecord>>) -> Result<(), Error> {
    for r in event.payload.records {
        enrich(r.body.change);
    }

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .json()
        //.pretty()
        .with_max_level(tracing::Level::INFO)
        // disable printing the name of the module in every log line.
        .with_target(false)
        // disabling time is handy because CloudWatch will add the ingestion time.
        .without_time()

        .init();

    run(service_fn(function_handler)).await
}
```

### SerDe into my Event

The last part of this process when consuming an SQS Event with Lambda and Rust, is to convert the marshaled item into my custom object. For demonstration purposes, this function is simple.

SerdeDynamoDB is another powerful serde that can take the HashMap that is the `New_Image` and convert it into my strongly-typed struct. From there, it's a simple `tracing::info` macro call.

```rust
fn enrich(stream: StreamRecord) {
    let mm: MainModel = serde_dynamo::from_item(stream.new_image.into_inner()).expect("(Error) Unwrapping MainModel");
    tracing::info!("{:?}", mm);
}
```

Note my dependencies in the `Cargo.toml` to bring all of this together. One of the things I've to get used to is the concept of feature-flagging in the package manager file `Cargo.toml`.

```
[package]
name = "rust-sqs-lambda-reader"
version = "0.1.0"
edition = "2021"

[dependencies]
aws_lambda_events = { version = "0.11.1", default-features = false, features = ["firehose", "dynamodb", "sqs"] }
base64 = "0.21.5"

lambda_runtime = "0.8.1"
tokio = { version = "1", features = ["macros"] }
tracing = { version = "0.1", features = ["log"] }
tracing-subscriber = { version = "0.3", default-features = false, features = ["fmt", "json"] }
serde_json = "1.0.107"
data-encoding = "2.4.0"
serde = "1.0.190"
serde_dynamo = "4.2.7"

```

## Wrapping Up

Just looking back on this experience of consuming an SQS Event with Lambda and Rust, I'm still so new to Rust but even more enamored with it than I was when I started. You can absolutely expect to see more Rust samples and writings over the coming months. I've personally committed myself to work almost exclusively in it through the end of the year so that I can see what happens to my skills and understanding of this unique and powerful ecosystem.

As with most of my articles, there is a fully functioning repository attached. You can [find the code hosted on GitHub](https://github.com/benbpyle/sam-rust-sqs-lambda-reader). It is easily deployable with SAM and outlines the things you'll need to get going.

Thanks for reading and happy building!
