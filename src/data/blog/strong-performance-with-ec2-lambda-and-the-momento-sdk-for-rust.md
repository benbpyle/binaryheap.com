---
title: "Strong Performance with EC2, Lambda, and the Momento SDK for Rust"
author: "Benjamen Pyle"
description: I wrote recently about Mind Boggling Speed with Caching with Momento and Rust and wanted to continue in that theme as I explore the Momento SDK for Rust. Caching is a technique that builders reach for
pubDatetime: 2024-06-30T00:00:00Z
tags:
  - aws
  - momento
  - programming
  - rust
  - serverless
draft: false
---

I wrote recently about [Mind Boggling Speed with Caching with Momento and Rust](https://binaryheap.com/caching-with-momento-and-rust/) and wanted to continue in that theme as I explore the Momento SDK for Rust. Caching is a technique that builders reach for when looking to accomplish either improved performance or reduce the burden on resource-dependent parts of an application. It might also be a choice when looking to save costs if an operation is charged per read such as with DynamoDB. In any of those scenarios, caching must be fast. But caching must not also introduce a high amount of complexity. This is where I love [Momento](https://www.gomomento.com/) because I truly do get the best of both worlds. High-performance caching with the simplicity of serverless.

No caching solution would be complete however with the ability to subscribe to cache key changes. Topics aren't new in the engineering world, but I wanted to sit down and write some code against the Momento SDK for Rust and see how the ergonomics felt in addition to how well it performed. But comparing it in a vacuum against itself didn't seem like a lot of fun, so I am going to pair it against their companion product in Webhooks.

If you aren't familiar with what a webhook is, think of it like this. Perhaps there is a disconnected consumer who wants to perform some operation when a change on the topic happens. As a developer, I supply the endpoint, and Momento will do the heavy lifting to make sure that my endpoint receives a consistent payload and contains the body of the content in the message. The hard part of retries and connections is handled by Momento. And all I need to do is handle the request.

Webhooks are a great fit in cases when I can't stay subscribed full time like with a Lambda Function. But does that come at a performance hit? But just how much and is it worth it? Let's explore.

## The Setup

We've got to have some code for this type of article and instead of asking you to scroll to the bottom like usual, here's the [Repository](https://github.com/benbpyle/momento-rust-cache-off). Before you dig and start exploring, let me share what's inside there.

First, it's a lot of Rust. There are three binary projects inside that repository. Project one is the publisher code, which I'll walk you through below. Project two is a Lambda Function webhook handler. Project three is a console program that will subscribe to the Momento topic and process messages.

I'll be exploring how well a Lambda Function works as a webhook handler vs the connected EC2 running console program. Not to spoil the results, but we can all guess which run runs faster on average. I don't think I'd ever write another EC2-based service if Lambda won, but the results are super close and so close that unless you have consistent usage to justify the always-on cost, I don't think I'd consider anything other than the Lambda Function.

### Publishing

The Momento SDK for Rust allows clients to take advantage of working with the control plane and data plane pieces of their API. In this scenario, I'll be working with the Topics data plane.

#### Fetch Secrets

I'm not going to dig through setting up the cache, keys, and topics in the Momento console but I do need a way to fetch my long-lived access key to make requests. For that, I'm using AWS Secrets Manager.

```rust
let region_provider = RegionProviderChain::default_provider();
let config = from_env().region(region_provider).load().await;

// create the ssm and ddb client
// ssm is used to fetch Momento's Key
let client = aws_sdk_ssm::Client::new(&config);
let parameter = match client
    .get_parameter()
    .name("/keys/momento-pct-key")
    .send()
    .await
{
    Ok(p) => p,
    Err(_) => panic!("error with aws sdk client"),
};

// if no key, panic and don't start
let api_key = match parameter.parameter {
    Some(p) => p.value.unwrap(),
    None => panic!("Error with parameter"),
};
```

#### Building the Client

With an API Key, I can now build the Topics Client.

```rust
let topic_client = match TopicClient::builder()
    .configuration(momento::topics::configurations::Laptop::latest())
    .credential_provider(CredentialProvider::from_string(api_key).unwrap())
    .build()
{
    Ok(c) => c,
    Err(_) => panic!("error with momento client"),
};
```

What I enjoy about the Momento SDK for Rust is that it feels a lot like the AWS SDK for Rust. Which I am a fan of. I build a client and can then call operations on it.

#### Publishing Some Messages

Now that I have a client established, let's get to publishing messages. No surprise, it isn't hard. For my example, I'm going to run 100 sequential publishes via this `while` loop.

My message body will be a `MomentoModel` which I'll use in my webhook handler and topic subscriber code.

```rust
let mut i = 0;

while i < 100 {
    let m = MomentoModel::new(String::from("KeyOne"), String::from("KeyTwo"), i);
    let t = serde_json::to_string(&m).unwrap();

    match topic_client.publish("cache-off", "cache-off", t).await {
        Ok(_) => {
            println!("Published message");
        }
        Err(e) => {
            println!("(Error)={e:?}");
        }
    }

    i += 1;
}
```

As my kids would say, "Easy peasy lemon squeezy".

### The Webhook

Now it wouldn't be fair if my webhook wasn't coded in Rust now would it? My Lambda Function does have a few more operations inside of it than its counterpart I'll explore in a few paragraphs. But let's dig into that handler.

#### Main Function

Main in a Rust Lambda Function is where I set up my reusable objects that will be long-lived during the life of the function. The function below takes care of building my logging subscriber as well as grabbing a secret key that I'll use to decrypt the webhook message that comes with the webhook body.

```rust
#[tokio::main]
async fn main() -> Result<(), Error> {
    let filtered_layer = tracing_subscriber::fmt::layer()
        .pretty()
        .json()
        .with_target(true)
        .with_file(true);

    tracing_subscriber::registry()
        .with(filtered_layer)
        .with(EnvFilter::from_default_env())
        .init();

    let config = aws_config::load_from_env().await;
    let secrets_client = aws_sdk_secretsmanager::Client::new(&config);

    let resp = secrets_client
        .get_secret_value()
        .secret_id("moment-webhook-token")
        .send()
        .await?;
    let string_field = resp
        .secret_string()
        .expect("Secret string must have a value");
    run(service_fn(move |payload: Request| async move {
        function_handler(string_field, payload).await
    }))
    .await
}
```

#### Function Handler

The webhook endpoint will receive a few pieces of information that I want to parse through to verify the contents of the payload. To do that, I need to fetch those items out of the header and body.

```rust
let body = event.body();
let body_string = std::str::from_utf8(body).expect("Body wasn't supplied");
let payload: Result<MomentoPayload, serde_json::Error> = serde_json::from_str(body_string);
let header_value = event.headers().get("momento-signature");
```

#### Protecting Against Replays

I added a touch of code to protect against replay attacks. The Momento request payload includes a timestamp that marks the time when the message was published. That published field is then checked to make sure it was performed in the last 60 seconds. That function looks like the below:

```rust
fn is_request_new_enough(published: i64) -> bool {
    let start = SystemTime::now();
    let since_the_epoch = start
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards");

    let new_duration = Duration::from_millis(published as u64);
    let calculated = since_the_epoch - new_duration;

    debug!(
        since_the_epoch = since_the_epoch.as_millis(),
        published = published,
        time_since_published = calculated.as_secs(),
        "Time since published"
    );
    calculated.as_secs() < 60
}
```

#### Verifying the Signature

On top of protecting against replay attacks, I want to make sure that the signature of the message matches what I expect. When you think about it, these additional two operations will not be in the topic subscribed version with the Momento SDK for Rust. It almost makes it even more impressive that things are so close in timings.

```rust
fn verify_signature(payload: &MomentoPayload, secret_string: &str, signature: &str) -> bool {
    let s = serde_json::to_string(&payload).expect("Error serde");
    let mac3 = HmacSha3_256::new_from_slice(secret_string.as_bytes());
    match mac3 {
        Ok(mut m) => {
            m.update(s.as_ref());
            let result3 = m.finalize();
            let code_bytes_3 = result3.into_bytes();

            hex::encode(code_bytes_3) == signature
        }
        Err(_) => false,
    }
}
```

### Subscribed Client

Finally, on to the last application in the repository. This app can be compiled and run on any hardware of your choice. For my comparisons, I ran it on an Ubuntu instance running in EC2 built for Graviton. I do all of my Rust work against ARM64.

I'm going to skip the setup of the API Key but it looks like the code above in the Topic Publisher. However, below is what establishes a Topic Client and then a subscription.

```rust
let topic_client = match TopicClient::builder()
    .configuration(momento::topics::configurations::Laptop::latest())
    .credential_provider(CredentialProvider::from_string(api_key).unwrap())
    .build()
{
    Ok(c) => c,
    Err(_) => panic!("error with momento client"),
};

let mut subscription: Subscription = topic_client
    .subscribe("cache-off", "cache-off")
    .await
    .expect("subscribe rpc failed");
```

### A Stream

Remember to not cross the streams right?

![Streams](https://pbs.twimg.com/media/Bjsbf-6CIAALd4g?format=jpg&name=large)

Well, not that kind of stream. A stream in Rust is essentially an asynchronous iterator on something that will provide values in the future. The reason this code is so fast is that it gives me a persistent TCP-based connection to the Momento infrastructure. It is about as fast as I can get and considering that my code is running in the same region as my Momento Cache, it is the fastest way to work with Momento.

All of that power though comes with just a fraction of the code. Again, the Momento SDK for Rust is fantastic.

```rust
while let Some(item) = subscription.next().await {
    info!("Received subscription item: {item:?}");
    let value: Result<String, MomentoError> = item.try_into();
    match value {
        Ok(v) => {
            let o: MomentoModel = serde_json::from_str(v.as_str()).unwrap();
            info!(
                "(Value)={}|(MoModel)={o:?}|(TimeBetween)={}",
                v,
                o.time_between_publish_and_received()
            );
        }
        Err(e) => {
            error!("(Error Momento)={}", e);
        }
    }
}
```

## The Comparison

With the two solutions in place, now it's time to compare the performance. For clarification, these are small sample sizes but I ran through several batches and found very similar results which makes me feel like they are accurate on a larger scale.

### Lambda Function Performance

Here are the values for a few runs of the Lambda Function webhook handler. I've included both cold and warm starts, as well as the actual Lambda Function, and billed durations. My worst performer was sitting at 38ms of billing and 244ms of response from publish time to receive time.

![Publis to Receive Webhook](/images/lambda_webhook.png)

From the initial starts, you can see a significant improvement in both the time from publishing and the billed duration. This Lambda Function was set at 256MB of memory which is plenty of power for what I'm doing here.

I didn't include it in the graph, but I did capture the publish time and the webhook publish time as well. What's crazy about this is that the latency does NOT come from Momento. Momento was consistently publishing the webhook with 1 and 2ms from receipt. That's seriously impressive.

However, without diving further into it, I'm going to assume that the driving factors are that I'm traversing the public internet, dealing with TLS, and the additional security checks that I'm making in the handler.

### EC2 Subscriber

Remember, if you are shocked that this is faster, go back to the fact that it's an EC2 instance with a program that has established a TCP connection to the Momento publisher via the Momento SDK for Rust. However, I will say that the performance is rather astonishing. I have no idea how many servers are powering this or quite frankly what the infrastructure is. It's pure serverless at ITS BEST!

![Momento SDK for Rust](/images/ec2.png)

Holy cow! 2ms average with a consistent 1ms of latency. I'm rounding up too just so you are aware. The fact is, this is some serious performance with the Momento SDK for Rust.

But, one thing to note, the very first result was 8ms. I want to point out, all things experience "cold starts". Anything from engines to TCP connections has a period of "warming up". It's just a matter of how much and how frequently it happens when determining if it matters to you.

## Making Sense of It

Here's my take at this point. If you require blazing speed, the Momento SDK for Rust handles topic subscriptions like a champion. It's easy to code with. Easy to set up. And I get an amazing performance. In cases where I need to update a leaderboard, perhaps deal with real-time chats, or work with financial data that needs to be updated as it happens, this would 100% be the way I'd go. There is no substitute for speed. And if I'm going that far, I'd probably compile for my chipset and run it as a [Systemd](https://systemd.io) service. I wouldn't fool with Docker. Again, if performance is what I'm baking on.

Momento is so fast and so scalable that it makes perfect sense for these types of scenarios.

However, if I'm connecting systems in a web environment where I want to respond to change in a disconnected yet still VERY timely manner, I'm going to fire this up as a Lambda Function Webhook Handler. The code is easy to work with, more than fast, and Momento takes great care in making sure you can trust the payloads but also verify them for security. There is also a [well-written](https://docs.momentohq.com/topics/integrations/lambda-handler) example of how to extend their webhooks with AWS EventBridge.

They are two different scenarios that both offer amazing performance, great developer experiences, and the infinitely scalable and collapsible guarantees that come with Serverless.

## Wrapping Up

This has been a fun piece to write. It gave me a chance to write more Rust, work with Momento, and do some benchmarking. It also just underscores the current version of the serverless ecosystem and how builders have great choices when designing for their customers.

If are you looking for a caching solution or perhaps looking to get rid of a reliance on VPCs and ElastiCache, give Momento a shot. I've personally deployed them in production with their Golang SDK and my customers are very happy with the results. So get out there and write some code!

Thanks for reading and happy building!
