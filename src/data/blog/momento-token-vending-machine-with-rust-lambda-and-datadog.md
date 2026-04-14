---
title: "Momento Token Vending Machine with Rust, Lambda, and Datadog"
author: "Benjamen Pyle"
description: "Working with browser hosted code (UI) requires a developer to be cautious about exposing secrets and tokens. A less than trustworthy person could take these secrets and do things that the user doesn't"
pubDatetime: 2025-02-14T00:00:00Z
tags:
  - aws
  - cdk
  - datadog
  - programming
  - rust
  - serverless
draft: false
---

Working with browser hosted code (UI) requires a developer to be cautious about exposing secrets and tokens. A less than trustworthy person could take these secrets and do things that the user doesn't intend. And while we are all responsible for our internet usage, token and secrets security from an application standpoint falls squarely on a developer's shoulders. This is why when using [Momento](https://www.gomomento.com/), I like to take advantage of the Authorization API. What the Authorization API allows me to do is create a disposable token from a secure location, so that my UI clients can just refresh them as needed to work with Topics or Caches. Thus, not having the credential leak up into the "easy to see" JavaScript code. Let's dive into a Lambda Function coded in Rust that implements this Token Vending Machine concept with Momento.

- [Article Architecture](#article-architecture)
- [Implementing a Momento Token Vending Machine with Rust](#implementing-a-momento-token-vending-machine-with-rust)
  - [AWS CDK Code](#aws-cdk-code)
    - [Adding the Datadog Extension](#adding-the-datadog-extension)
    - [Long-Lived API Key](#long-lived-api-key)
    - [Cargo Lambda Rust Function](#cargo-lambda-rust-function)
  - [Rust Lambda Function](#rust-lambda-function)
    - [Main and Initializing](#main-and-initializing)
    - [Function Handler](#function-handler)
    - [Generating the Disposable Token](#generating-the-disposable-token)
- [Measuring Performance with Datadog and OpenTelemetry](#measuring-performance-with-datadog-and-open-telemetry)
  - [High Level Function Latency](#high-level-function-latency)
  - [Breaking it Down Further](#breaking-it-down-further)

### Article Architecture

I usually like to work backwards to forwards, meaning I establish what I want in the end and then build from there. When looking at a sample implementation, that means starting from the diagram and walking through what I'm building.

![Momento token vending machine](/images/Token_Vending_Machine.png)

A user's session will need to establish an authenticated and authorized connection to Momento by way of the JavaScript client SDK. Every call to Momento is over an HTTP API request so it's going to get authenticated and authorized. Which is a good thing! However, doing this, requires a token which is what I'll be fetching from the Rust Lambda Function that will be demonstrated throughout the article. The flow goes like this:

1. User requires a token to connect to Momento
2. Browser makes a request to an endpoint backed by a Lambda Function
3. Rust Lambda Function uses a long-lived and secure API Token that has permissions to create short-lived disposable tokens
4. Rust Function uses the Momento SDK to request a token with the supplied Topic and Cache names with scopes to publish and subscribe
5. A token is returned from the Lambda Function where the client code can use to subscribe to a Momento topic.
6. The token has an expiration timestamp represented as a Unix Epoch so that the client can refresh before the token has a chance to expire

So let's walk through those steps above and explore the implementation.

### Implementing a Momento Token Vending Machine with Rust

I know I'm focusing on Lambda, Momento, and Rust, but there are many other components that go into what I'd consider a quality Lambda Function build. To address those, let's have a look at the CDK code and what all gets shipped to AWS.

#### AWS CDK Code

TypeScript has become my goto when it comes to creating AWS infrastructure. I like the CDK, and I especially like having the ability to use the Cargo Lambda CDK Construct. If you haven't used it before, check out the [repository](https://github.com/cargo-lambda/cargo-lambda-cdk) and jump into the documentation. It's straightforward and the classes inherit from AWS bases. In addition to Cargo Lambda, I like to include the [Datadog Lambda Extension](https://www.instagram.com/reel/DFsdRBvAcyQ/?utm_source=ig_web_copy_link). This piece of goodness allows me to collect my [OpenTelemetry](https://binaryheap.com/rust-and-opentelemetry-with-lambda-datadog/) traces into the Datadog UI for easy assessment of performance and any latency or error issues. I'll highlight further as the article evolves.

Here we go! The below is the CDK code that brings the above together.

##### Adding the Datadog Extension

Pay special attention to the following when adding the Datadog extension.

- Region: I'm using the region my Lambda function is hosted in
- ARM/x64: I'm picking the chip architecture that my Lambda Function is compiled for.
- Version: 68 in this case, but `:latest` can also be used.

```typescript
const layer = LayerVersion.fromLayerVersionArn(
  scope,
  "DatadogExtension",
  "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension-ARM:68"
);
```

##### Long-Lived API Key

I'm going to use a long-lived API key with Momento so that this Lambda Function can make requests without worrying about expiration. This is completely acceptable solution. Think of it like a scoped API key essentially. To set that up, I'm using AWS SecretsManager.

```typescript
const secret = new Secret(scope, "MomentoKeySecret", {
  secretName: "MomentoApiKeySecret",
  secretObjectValue: {
    momentoSecret: SecretValue.unsafePlainText(process.env.MOMENTO_API_KEY!),
  },
});
```

##### Cargo Lambda Rust Function

Wrapping up the infrastructure components is the definition of the Rust Lambda Function and granting its ability to read from the secret defined above in SecretsManager. Additionally, I'm exposing the function over a FunctionURL. This of course could be internal behind an Application Load Balancer or exposed behind a variety of API Gateway setups. The FunctionURL just makes this example simple to pull together.

Key things to point out in the `RustFunction` are:

- Architecture: set to ARM because I prefer to run on the AWS Graviton chips
- Environment:
  - Setting RUST_LOG allows me to control crate log levels (this is a convention)

```typescript
const vendingMachine = new RustFunction(scope, "TokenVendingMachineFunction", {
  architecture: Architecture.ARM_64,
  functionName: "momento-token-vending-machine",
  manifestPath: path.join(__dirname, `../../../lambdas/`),
  memorySize: 256,
  environment: {
    RUST_LOG: "info",
    FUNCTION_NAME: "token-vending-machine",
    DD_API_KEY: process.env.DD_API_KEY!,
    DD_SITE: process.env.DD_SITE!,
    AGENT_ADDRESS: "127.0.0.1",
  },
  layers: [layer],
});

new FunctionUrl(scope, "AuthUrl", {
  function: vendingMachine,
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ["*"],
    allowedHeaders: ["*"],
  },
});

secret.grantRead(vendingMachine);
```

#### Rust Lambda Function

At this point, using CDK, I can easily run a `cdk deploy` and my code will be live in AWS in just a couple of minutes. However, I'd like to dive in further on the Rust and Lambda code, specifically addressing the Momento Auth pieces

##### Main and Initializing

All Rust code (unless it's a lib) starts out with a `main` function. Even Lambda Functions must have a `main`. In my `main` below, I'm setting up Momento, Datadog, OpenTelemetry, and other reusable components. Since my handler is what is called over and over, I want to have things warm and in memory, ready to use as events come in.

To initialize the OpenTelemetry, I'm establishing a telemetry layer which I'm registering.

```rust
let telemetry_layer = tracing_opentelemetry::layer().with_tracer(init_datadog_pipeline());
let fmt_layer = tracing_subscriber::fmt::layer()
    .json()
    .with_target(false)
    .without_time();

Registry::default()
    .with(telemetry_layer)
    .with(fmt_layer)
    .with(tracing_subscriber::EnvFilter::from_default_env())
    .init();
```

The next pieces of `main` are about fetching the Momento API key from the AWS secret I defined in the infrastructure. And with that secret, I'll construct an instance of the Momento Auth client so that I can communicate with the Auth API and create the disposable tokens.

```rust
let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
let secrets_client = aws_sdk_secretsmanager::Client::new(&config);

// this is how long the token has before expiring.  If no value is supplied, then the
// default of 60 seconds is used
let expires_duration_minutes = u64::try_from(
    env::var("KEY_EXPIRES_DURATION")
        .as_deref()
        .unwrap_or("")
        .parse()
        .unwrap_or(60),
)?;
let resp = secrets_client
    .get_secret_value()
    .secret_id("MomentoApiKeySecret")
    .send()
    .await?;
let string_field = resp
    .secret_string()
    .expect("Secret string must have a value");
let secret_string: MomentoSecretString = serde_json::from_str(string_field)
    .expect("Secret string must serde into the correct type");
let cache_client = AuthClient::builder()
    .credential_provider(CredentialProvider::from_string(
        secret_string.momento_secret,
    )?)
    .build()?;
let shared_cache_client = &cache_client;

```

##### Function Handler

With all Lambda Functions, I need to define a function that will be called when the Lambda Function is supplied events. For web APIs, that event is a request from an external client. My `main` establishes this connection by the following code.

```rust
run(service_fn(move |event: Request| async move {
    handler(shared_cache_client, expires_duration_minutes, event).await
}))
.await
```

As exposed, I need to send a Momento client, the expiration in minutes I want to let the token be valid for, and the event which is the web request.

```rust
async fn handler(
    client: &AuthClient,
    token_expires_in_minutes: u64,
    request: Request,
) -> Result<impl IntoResponse, Error> {
  let body = request.body();
  let body_string = std::str::from_utf8(body)?;
  let parsed_body = serde_json::from_str::<TokenRequest>(body_string);

  match parsed_body {
      Ok(token_request) => {
          let token = generate_token(
              client,
              token_expires_in_minutes,
              token_request.cache_name,
              token_request.topic_name,
          )
          .await?;
          let token_body = serde_json::to_string(&token)?;
          let response = Response::builder()
              .status(200)
              .header("Content-Type", "application/json")
              .body(token_body)
              .map_err(Box::new)?;
          Ok(response)
      }
      Err(e) => {
          println!("(Error)={}", e);
          let response = Response::builder()
              .status(400)
              .header("Content-Type", "application/json")
              .body("Bad request".to_string())
              .map_err(Box::new)?;
          Ok(response)
      }
  }
}
```

The Lambda Function handler does the following.

- Take in the request
- Parse the body of the request
  - Body in the correct format then generate the token
  - If not, return a 400 BAD REQUEST

For the request body, I'm expecting it to look like this.

```json
{
  "cacheName": "SampleCache",
  "topicName": "SampleTopic"
}
```

The Rust structure that this serializes into has the following definition.

```rust
#[derive(Deserialize, Debug)]
pub struct TokenRequest {
    #[serde(rename = "cacheName")]
    pub cache_name: String,
    #[serde(rename = "topicName")]
    pub topic_name: String,
}
```

Now with a struct populated with my request data, I can look at how to generate the disposable token. It's much easier than I thought it might be.

##### Generating the Disposable Token

This disposable token logic is the heart of this Lambda Function's existence. Remember, Client code or the UI is going to request a token that I want to scope down to the cache and topic supplied in the payload. This will guarantee that the client has access to what's needed for the duration defined the environment variable discussed above.

```rust
async fn generate_token(
    client: &AuthClient,
    expires_in_minutes: u64,
    cache_name: String,
    topic_name: String,
) -> Result<VendedToken, Error> {
    let query_span = tracing::info_span!("Momento generate token");
    let expires_in = ExpiresIn::minutes(expires_in_minutes);
    let scopes = PermissionScopes::topic_publish_subscribe(
        CacheSelector::CacheName { name: cache_name },
        TopicSelector::TopicName { name: topic_name }
    ) .into();
    let token = client
        .generate_disposable_token(scopes, expires_in)
        .instrument(query_span)
        .await?;
    let expires_at = token.clone().expires_at();
    let vended_token = VendedToken {
        auth_token: token.auth_token(),
        expires_at: expires_at.epoch(),
    };

    Ok(vended_token)
}
```

Let's break the above down just a little. First up is the `query_span` and `expires_in`.

The `query_span` plugs into OpenTelemetry that allows me to time the Momento operations by way of the Rust Instrument trait. I highly recommend any Rust code you write take advantage of these opportunities. Tracing in the spirit of observability will make finding errors and poor user experiences so much easier when you start to get some volume.

```rust
let query_span = tracing::info_span!("Momento generate token");
let expires_in = ExpiresIn::minutes(expires_in_minutes);
```

The next piece of this function is to create the Disposable token. `Scopes` are a required parameter to the `generate_disposable_token` function. For my example, I'm giving the token access to Publish and Subscribe to the Cache/Topic combination. And notice that the `expires_at` parameter is finally being used to round out the function call.

```rust
let scopes = PermissionScopes::topic_publish_subscribe(
    CacheSelector::CacheName { name: cache_name },
    TopicSelector::TopicName { name: topic_name }
) .into();
let token = client
    .generate_disposable_token(scopes, expires_in)
    .instrument(query_span)
    .await?;
let expires_at = token.clone().expires_at();
let vended_token = VendedToken {
    auth_token: token.auth_token(),
    expires_at: expires_at.epoch(),
};
```

The last piece of the function is to create the `VendedToken`. The values returned from the Momento function call are used to populate the struct.

```rust
#[derive(Serialize, Debug)]
#[serde(rename = "camelCase")]
pub struct VendedToken {
    pub auth_token: String,
    pub expires_at: u64,
}
```

### Measuring Performance with Datadog and OpenTelemetry

So I can't end an article just demonstrating how to fetch disposable tokens written in Rust and deployed in a Lambda Function without talking about performance. I am always blown away at the speed of Momento's services. I hadn't done much work with the Auth API so I wanted to see if the timings that I've been accustomed to with Cache and Topics also held true with Auth.

With the observability code using OpenTelemetry that I've shown above, I'm able to not only track the Lambda Function's execution timings, but also the Momento specific API calls via the `Instrument` trait that I showed above. I bring this metrics and traces together via Datadog because there isn't a better tool on the market to help me observe my Lambda Functions as well as other cloud resources.

##### High Level Function Latency

First up is looking at the high level Lambda Function latency. I'm graphing the 50th, 75th, 90th, and 95th percentiles with this Datadog line graph.

![](/images/vending-p-latencies-1024x567.webp)

I've [written about Rust and Lambda performance](https://binaryheap.com/rust-and-lambda-performance/) quite a bit over the past 18 months, but I'm always amazed at how quickly and consistently my function code performs with Rust. I can also make the [same statements](https://binaryheap.com/caching-with-momento-and-rust/) when it comes to pairing Rust with Momento. Time and time again, their platform performs consistently, regardless of the load and requests I throw at it. The same can be said about the Auth API that I'm exercising here. Consistent p95 latency at the 3ms is just fantastic and not going to be noticeable by an end user.

##### Breaking it Down Further

High level tracing is great and something that I love about using Datadog, but since I took advantage of the `Instrument` trait further up, let's have a look at exactly how the Momento Auth operations play into the overall function latency.

![](/images/vending-trace-timings-1024x118.webp)

This table shows the two spans that are included in the overall latency of the Lambda Functions execution. If you remember from the code well above, I called the Momento Auth span `Momento generate token`. I'm happy all day long with an average latency of 1.25ms and a tail p99 latency of 2.19ms. I can't recommend their [Rust SDK](https://docs.momentohq.com/platform/sdks/rust) enough. It is my first and preferred way to work with Momento.

## Wrapping Up

Working with client code that is insecure by nature that also needs to authenticate with the Momento API for things like Topic subscriptions can be a challenge. However, by implementing a token vending machine with Rust, deployed with Lambda, and monitored with Datadog produces a solution that is fast, reliable, and observable.

I've been saying this for a while, but I truly believe that building Lambda Functions with Rust is the way to go. And I love seeing companies like Momento invest in Rust specific SDKs. This feature to build disposable tokens was just added in 2025 and will unlock developers to implement this vending machine pattern in Rust like I've shown the article.

I included a bunch of code snippets throughout, but if you want the full repository, [here is the Github repository](https://github.com/benbpyle/momento-rust-token-vending-machine/tree/main)

Thanks for reading and happy building!
