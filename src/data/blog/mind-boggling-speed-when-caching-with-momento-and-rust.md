---
title: Mind Boggling Speed when Caching with Momento and Rust
author: "Benjamen Pyle"
description: "Summer is here and in the northern hemisphere, temperatures are heating up. Living in North Texas, you get used to the heat and humidity but somehow it still always seems to sneak up on me. As I start"
pubDatetime: 2024-06-15T00:00:00Z
tags:
  - aws
  - programming
  - rust
  - serverless
draft: false
---

Summer is here and in the northern hemisphere, temperatures are heating up. Living in North Texas, you get used to the heat and humidity but somehow it still always seems to sneak up on me. As I start this new season (which happens to be my favorite) I wanted to reflect a touch and remember the summer of 2023. That summer, I looked at [6 different aspects](https://binaryheap.com/building-serverless-applications-with-aws-data/) of serverless development from the perspective of things I wish I had known when I was getting started. Fast forward to this summer when I started with [Does Serverless Still Matter?](https://binaryheap.com/does-serverless-still-matter/) What a year it's been for sure. And as I look forward to the next few hot months, I'm going to explore my current focus which is highly performant serverless patterns. And to kick things off, let's get started with caching with Momento and  
Rust.

## Architecture

I always like to start by describing what it is that I'm going to be building throughout the article. When designing for highly performant Lambda-based solutions, I like to keep things as simple as possible. Since all of these transitions require HTTP requests, latency only grows as more requests enter the mix. Additionally, by choosing Rust as the language for the Lambda Function, I can be assured that I'm getting the best compute performance that is possible.

[![Caching with Momento and Rust](/images/hpl_kinesis.png)](/images/hpl_kinesis.png)

## Project Setup

As I mentioned above, I'm going to be using Rust to build out my Lambda Function. And as I explore caching with Momento and Rust, I'll be using [Momento's SDK for Rust](https://github.com/momentohq/client-sdk-rust). In addition to Rust, I'm building the infrastructure with SAM instead of my usual CDK. I tend to go back and forth. When working in purely serverless setups, I tend to favor SAM for its simplicity. But when I've got more complexity, I lean towards CDK.

### SAM Template

The architecture diagram above highlights a few pieces of AWS infrastructure. The template below sets up those necessary pieces for getting started as we dive deeper into caching with Momento and Rust.

Pay close attention to the Rust Lambda Function piece which requires the naming of the handler to be `bootstrap`. Also to note is that the path in the CodUri points to where the `Cargo.toml` manifest file is for the Lambda Function handler.

```yaml
Resources:
  KinesisStream:
    Type: AWS::Kinesis::Stream
    Properties:
      RetentionPeriodHours: 24
      StreamModeDetails:
        StreamMode: ON_DEMAND

  DynamoDBTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: Locations
      AttributeDefinitions:
        - AttributeName: location
          AttributeType: S
      KeySchema:
        - AttributeName: location
          KeyType: HASH
      BillingMode: PAY_PER_REQUEST

  RustConsumerFunction:
    Type: AWS::Serverless::Function 
    Metadata:
      BuildMethod: rust-cargolambda 
    Properties:
      FunctionName: kinesis-consumer-model-one-rust
      Environment:
        Variables:
          RUST_LOG: kinesis_consumer=debug
      CodeUri: ./kinesis-consumer-model-one-rust/rust_app # Points to dir of Cargo.toml
      Handler: bootstrap # Do not change, as this is the default executable name produced by Cargo Lambda
      Runtime: provided.al2023
      Architectures:
        - arm64
      Policies:
        - AmazonDynamoDBFullAccess
        - Version: "2012-10-17" 
          Statement:
            - Effect: Allow
              Action:
                - ssm:*
              Resource: "*"
      Events:
        Stream:
          Type: Kinesis
          Properties:
            Stream: !GetAtt KinesisStream.Arn
            StartingPosition: LATEST
            BatchSize: 10
```

### Momento SDK

Diving into the Momento piece of the caching with Momento and Rust, I need to first establish an account, a cache, and an API key. Instead of demonstrating that here, [I'll refer you to wonderful documentation](https://docs.momentohq.com/cache/getting-started) that will guide you through that process.

With an API key and cache all configured, I'm going to store that key in an AWS SSM parameter. That can be demonstrated through this code. Feel free to change this if you are following along, but if you don't want to make any adjustments, you'll need this value in SSM

```rust
let parameter = client
    .get_parameter()
    .name("/keys/momento-pct-key")
    .send()
    .await?;
```

#### Caching with Momento and Rust

First off, the Momento SDK is still less than v1.0 so I'd expect some changes along the way. But in that same thought, it's well-polished for being so new. It has a very AWS SDK feel to it which I LOVE. It's one of the things that I appreciate about working with AWS and the Momento Rust SDK has that same vibe.

I first need to establish a connection or client into the Momento API.

```rust
// create a new Momento client
let cache_client = match CacheClient::builder()
    .default_ttl(Duration::from_secs(10))
    .configuration(configurations::Laptop::latest())
    .credential_provider(CredentialProvider::from_string(api_key).unwrap())
    .build()
{
    Ok(c) => c,
    Err(_) => panic!("error with momento client"),
};
```

With the client established, I can then make requests against the control plane and data plane APIs. For the balance of the article, I'll be using the data plane API to make gets and sets.

#### Gets

Issuing a get on a cache dictionary is straightforward.

```rust
// use the client to execute a Get
match cache_client
    .get("sample-a".to_string(), location.clone())
    .await
{
    Ok(r) => match r {
        // match on OK or Error
        GetResponse::Hit { value } => {
            // A Cache Hit
            tracing::info!("Cache HIT");
            let cached: String = value.try_into().expect("Should have been a string");
            let model = serde_json::from_str(cached.as_ref()).unwrap();
            Ok(Some(model))
        }
        GetResponse::Miss => {
            // A Cache Miss
            tracing::info!("Cache MISS, going to DDB");
            // Code ommitted but included in the main repository ...
        }
    },
    Err(e) => {
        tracing::error!("(Error)={:?}", e);
        Ok(None)
    }
}
```

As shown above, the `get` operation will return a `Result` with the inner value being an `Enum` that holds information about whether the request was a `Hit` or a `Miss`. What I like about this is that the `Hit` also includes the value retrieved. This is a nice touch as then deserializing into my `CacheModel` is as simple as executing `serde_json::from_str`. Again, really nice feature.

#### Sets

Caching with Momento and Rust was easy and clean with gets, and sets work the same way. Think of it as almost the reverse of the get. Instead of deserializing, I now serialize. Instead of querying, I'm now writing.

```rust
let s = serde_json::to_string(cache_model).unwrap();
match cache_client
    .set("sample-a".to_string(), cache_model.location.clone(), s)
    .await
{
    Ok(_) => Ok(()),
    Err(e) => {
        tracing::error!("(Error)={:?}", e);
        Ok(())
    }
}
```

#### Final Momento SDK Thoughts

Consider me impressed at my first go with the SDK. The code worked the very first time without having to dive into documentation. The SDK API is based on the common [Builder Pattern](https://en.wikipedia.org/wiki/Builder_pattern) which makes the configuration of a request simple and readable. There is a common error enum that I then can easily work around with [thiserror](https://docs.rs/thiserror/latest/thiserror/) to take advantage of the Rust `?` operator. And lastly, it is highly performant. And that brings me back to this summer exploration. I've executed roughly 65K requests through Kinesis to be processed through my Lambda Function which also makes 65K Momento requests. I consistently saw Momento return me either a hit with the value or a miss at an average of 1.8ms.

[![Momento Performance](/images/rust_momento.jpg)](/images/rust_momento.jpg)

### Running the Sample

Let's dive into how to run this sample and see what happens when I do. Caching with Momento and Rust is such a powerful pattern but sometimes a picture can tell more than words. I've written about [Rust's performance with Lambda](https://binaryheap.com/rust-and-lambda-performance/) before so you either agree with that data or you don't. I've never steered away from the fact that if you want the maximum amount of speed you can get, then maybe you shouldn't be running in the cloud, using HTTP, and a host of other decisions. If that's the camp you fall in, then 7ms is going to seem slow to you. But for most of us who enjoy the speed and scale of the cloud without the overhead of management and the ability to iterate quickly at a low cost, then 7ms is much better than what you are going to get with another runtime and setup.

Rust's performance shines when paired with Kinesis and Momento.

[![Rust Performance](/images/rust_momento_perf.png)](/images/rust_momento_perf.png)

#### The Producer

In the repository's root directory, there is a `producer` directory that holds a Rust program which will load as many Kinesis records as you want. It will run several threads to loop for a specified duration and write those values into Kinesis. This is a test harness so to speak.

The `main` function has the below code to handle the threads. I can configure how many, but by default, I'm just going to kick off 1.

```rust
// THREAD_COUNT defaults to 1 but can be changed to support multiple threads that'll execute
// the thread_runner function as many times as defined in the RECORD_COUNT
let thread_count_var: Result<String, VarError> = std::env::var("THREAD_COUNT");
let thread_count: i32 = thread_count_var
    .as_deref()
    .unwrap_or("1")
    .parse()
    .expect("THREAD_COUNT must be an int");
while loop_counter < thread_count {
    // create as many threads as defined
    let cloned_client = client.clone();
    let handle = tokio::spawn(async {
        thread_runner(cloned_client).await;
    });
    handles.push(handle);
    loop_counter += 1;
}

while let Some(h) = handles.pop() {
    h.await.unwrap();
}
```

It then contains a `thread_runner` function that will loop some number of times (defaults to 10) and write a record into Kinesis. The record has a `location` field which is selected from an array at random.

```rust
async fn thread_runner(client: Client) {
    // record count default to 10
    let record_count_var: Result<String, VarError> = std::env::var("RECORD_COUNT");
    let record_count: i32 = record_count_var
        .as_deref()
        .unwrap_or("10")
        .parse()
        .expect("RECORD_COUNT must be an int");

    // this is where it publishes.
    // RUN the SAM code in the publisher and take the Stream Name and put that in an environment
    // variable to make this work
    let kinesis_stream =
        std::env::var("KINESIS_STREAM_NAME").expect("KINESIS_STREAM_NAME is required");
    let mut i = 0;
    while i < record_count {
        let model_one = ModelOne::new(String::from("Model One"));

        // create a new model in the loop and push into kinesis
        let model_one_json = serde_json::to_string(&model_one);
        let model_one_blob = Blob::new(model_one_json.unwrap());
        let key = model_one.get_id();

        let result = client
            .put_record()
            .data(model_one_blob)
            .partition_key(key)
            .stream_name(kinesis_stream.to_string())
            .send()
            .await;

        match result {
            Ok(_) => {
                println!("Success!");
            }
            Err(e) => {
                println!("Error putting");
                println!("{:?}", e);
            }
        }

        i += 1;
    }
    }
```

I can then run this program by doing the following.

```rust
cd publisher
cargo build
export KINESIS_STREAM_NAME=<the name of the stream>
cargo run
```

You'll see `Success` printed into the terminal output and records will start showing up in the Lambda Function.

#### The Consumer

I'm getting to the end of this sample so let's dive into the consumer. There is a single Lambda Function that brings together caching with Momento and Rust by hooking up to the Kinesis stream and processing the records.

The function handler takes a `KinesisEvent`, loops the records, and then works with the cache.

```rust
async fn function_handler(
    cache_client: &CacheClient,
    ddb_client: &aws_sdk_dynamodb::Client,
    event: LambdaEvent<KinesisEvent>,
) -> Result<(), Error> {
    info!("Starting the loop ...");

    // loop the kinesis records
    for e in event.payload.records {
        // convert the data into a ModelOne
        // ModelOne implements the From trait
        let mut model_one: ModelOne = e.into();
        info!("(ModelOne BEFORE)={:?}", model_one);

        // grab the item from storage
        let result = fetch_item(ddb_client, cache_client, model_one.read_location.clone()).await;
        match result {
            Ok(r) => {
                model_one.location = r;
                info!("(ModelOne AFTER)={:?}", model_one);
            }
            Err(e) => {
                error!("(Err)={:?}", e);
            }
        }
    }

    Ok(())
}
```

The main operation inside of the loop is the `fetch_item`. I've written a good bit about [Rust and DynamoDB](https://binaryheap.com/api-gateway-lambda-dynamodb-rust/) so I'm not going to highlight the code below, but the way it works is if the item isn't found in the fetch to Momento, it then goes to DynamoDB to grab the record and then execute the set operation that I showed above. The key to making this work in this sample is to have the records in DynamoDB so that I have something to set.

My `ModelOne` struct has a location field which is one of the three values. `['Car', 'House', 'Diner']`. Insert the following records into the Locations table created by the SAM infrastructure template.

```json
{
    "location": "Car",
    "description": "Car description",
    "notes": "Car notes"
}
{
    "location": "Diner",
    "description": "Diner description",
    "notes": "Diner notes"
}
{
    "location": "House",
    "description": "House description",
    "notes": "House notes"
}
```

And that'll do it. When you run the producer above, you'll see a host of output into CloudWatch that highlights the Hits, Misses, DynamoDB queries, and the printing out of a large number of ModelOne structs.

## Wrapping Up

I wrote a few blocks above that 7ms might not be the speed you are looking for, but I'd present you with another opinion. With serverless, I don't stress over the infrastructure, the durability, reliability, or the fact that I might need 10x more capacity today than I needed yesterday. Yes, that comes at a premium but as builders, we need to know how tools and know when they are right and when they are wrong. Serverless to me is still the right solution more than it is the wrong one. And paired with Momento and Rust, I can get a highly performant and extremely scalable solution with very little investment. That will stretch a long way for so many that are shipping value.

To demonstrate that, here's a comparison of when the record was written to Kinesis and when it was read and processed. I'm more than happy with 16ms from write to read. That'll take care of the performance criteria I have in so many requirements.

[![Record write read](/images/write_read.png)](/images/write_read.png)

This is just the first of many scenarios I plan to look at this summer. High performance and serverless aren't at odds. They go hand in hand. And by using the right tools, you can even further enhance your user's experience. Because speed does just that. Enhance user experience. I hope you've enjoyed Caching with Momento and Rust.

And as always, [here is the GitHub repository I've been working through](https://github.com/benbpyle/rust-momento-kinesis-consumer)

Thanks for reading and happy building!
