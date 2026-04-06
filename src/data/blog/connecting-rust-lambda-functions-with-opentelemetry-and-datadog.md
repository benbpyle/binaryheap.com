---
title: Connecting Rust Lambda Functions with OpenTelemetry and Datadog
author: "Benjamen Pyle"
description: "Tracing Lambda Functions with observability code is the basement level of instrumentation that should exist when writing Serverless Applications. So many times, even in Lambda Functions, there are tim"
pubDatetime: 2025-02-25T00:00:00Z
tags:
  - aws
  - datadog
  - observability
  - programming
  - rust
  - serverless
draft: false
---

Tracing Lambda Functions with observability code is the basement level of instrumentation that should exist when writing Serverless Applications. So many times, even in Lambda Functions, there are time bombs that will cause major delays or system problems triggered by "exceptional" payloads or even poorly coded SQL statements. But in my experience, I've seen developers with down the middle of the fairway type payloads that should "just work", yield latencies that are outside of acceptable when it comes to user's expectations.

Now, let's go a bit further and imagine that there's a Lambda Function that needs data from another Lambda Function and these operations might produce an event that ends up on a Queue. That event could then be processed by another Lambda Function resulting in 3 separate code executions on 3 different runtimes and physical infrastructure. If I've only instrumented at the bare minimum of "function level", then I get 3 pictures, but those pictures don't tell the story that actually happened.

In this article, I'm going to dive in on how to instrument Rust Lambda Functions with OpenTelemetry so that [Datadog](https://www.datadoghq.com/) can then visualize the relationships between [Spans and the single parent Trace](https://opentelemetry.io/docs/concepts/signals/traces/). Here we go, connecting Rust Lambda Functions with OpenTelemetry and Datadog.

-   [Architecture](#architecture)
    -   [Rust Lambda Function 1](#rust-lamda-function-1)
    -   [Rust Lambda Function 2](#rust-lambda-function-2)
    -   [Rust Lambda Function 3](#rust-lambda-function-3)
-   [Datadog to Bring it Together](#datadog-to-bring-it-together)
    -   [Trace and Span Graphs](#trace-and-span-graphs)
    -   [Tracing Thoughts and Comments](#tracing-thoughts-and-comments)
-   [Wrapping Up](#wrapping-up)

## Architecture

I've shared many [times](https://binaryheap.com/rust-and-opentelemetry-with-lambda-datadog/) here on my site about OpenTelemetry, Rust, and Datadog but everything up to this point has been as I described it above. Single function tracing. There's a large world out there that for some API requests, multiple Lambda Function Invocations might happen. And every time those functions get invoked without the context of the original invocation, the story gets fractured. This article will show you another way.

![Rust OpenTelemetry Datadog](/images/datadog_lambda_otel.jpg)

Taking a quick tour of that image, the request from the outside is going to take the following paths.

1.  API Request lands in API Gateway triggering a Lambda Function Invocation
2.  The initial Lambda Function will make an HTTP request back through the same API Gateway into another Lambda Function
3.  When the request returns, the original Lambda Function puts a message onto a Simple Queue Service queue
4.  And finally, a Lambda Function reads that queue and processes the message

So 3 Lambda Function invocations, that all need to be stitched together to tell the same story.

And as always, at the end of the article, there's a GitHub repository that can be cloned to get started.

### Rust Lambda Function 1

The infrastructure as code is written in TypeScript using the AWS CDK but instead of carving that out in its own section, I'll just reference it as I walk through code. And with the CDK, I'm using [Cargo Lambda](https://www.cargo-lambda.info/) for the Rust builds and the CDK Construct that includes `RustFunction`.

To get my first Lambda Function up and running, I need that API Gateway and the [Datadog Lambda Extension](https://docs.datadoghq.com/serverless/libraries_integrations/extension/) for tracing.

```typescript
let api = new RestApi(this, "RestApi", {
  description: 'Sample API',
  restApiName: 'Sample API',
  disableExecuteApiEndpoint: false,
  deployOptions: {
    stageName: 'demo',
  },
});

const layer = LayerVersion.fromLayerVersionArn(
  this,
  'DatadogExtension',
  'arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension-ARM:68'
)

const postFunction = new RustFunction(this, 'PostFunction', {
  architecture: Architecture.ARM_64,
  functionName: "sample-post-function",
  manifestPath: path.join(__dirname, `../../lambdas/post-function`),
  memorySize: 256,
  environment: {
    RUST_LOG: 'info',
    FUNCTION_NAME: "post-function",
    DD_API_KEY: process.env.DD_API_KEY!,
    DD_SITE: process.env.DD_SITE!,
    AGENT_ADDRESS: '127.0.0.1'
  },
  layers: [layer]
});

  api.root.addMethod("POST", new LambdaIntegration(postFunction))
```

With the Function and the API Gateway in place, let's have a look at the Rust code. My `main` function does what a `main` always does. Initialize clients, parse environment variables, and build references to things I want to reuse in future invocations. It also establishes the linkage between the Lambda Runtime and my Function Handler. However, I do want to show the `init_datadog_pipeline` function. This initializes an OpenTelemetry pipeline from a community manage project that setups the OpenTelemetry endpoints and does some resource mapping behind the scenes between OpenTelemetry and Datadog.

```rust
fn init_datadog_pipeline() -> opentelemetry_sdk::trace::Tracer {
    let agent_address = env::var("AGENT_ADDRESS").expect("AGENT_ADDRESS is required");
    match new_pipeline()
        .with_service_name(env::var("FUNCTION_NAME").expect("FUNCTION_NAME is required"))
        .with_agent_endpoint(format!("http://{}:8126", agent_address))
        .with_api_version(ApiVersion::Version05)
        .install_simple()
    {
        Ok(a) => a,
        Err(e) => {
            panic!("error starting! {}", e);
        }
    }
}

```

How do I take advantage of this `pipeline` though? I can use the `instrument` macro and I can manually create spans. I've shown both of those before, but how do I connect my span between an HTTP request?

The first thing I want to do, is make sure that my HTTP Client automatically instruments my API requests. In my `main` function, I use the `ClientBuilder` to establish this connection. I like the [Reqwest](https://docs.rs/reqwest/latest/reqwest/) crate for this type of work

```rust
let client = aws_sdk_sqs::Client::from_conf(config);
let reqwest_client = reqwest::Client::builder().build().unwrap();
let http_client = ClientBuilder::new(reqwest_client)
        // Added in the tracing middleware
    .with(TracingMiddleware::default())
    .build();

```

Now inside of the `handler`, I'm going to add the trace context to the headers of the request via [context propagation](https://opentelemetry.io/docs/languages/js/propagation/)

```rust
let ctx = Span::current().context();
let propagator = TraceContextPropagator::new();
let mut fields = HashMap::new();

let mut trace_parent: Option<String> = None;

propagator.inject_context(&ctx, &mut fields);
let headers = fields
    .into_iter()
    .map(|(k, v)| {
        if k == "traceparent" {
            trace_parent = Some(v.clone());
        }
        return (
            HeaderName::try_from(k).unwrap(),
            HeaderValue::try_from(v).unwrap(),
        );
    })
    .collect();

let response = http_client
    .get("<url>/demo")
    .headers(headers)
    .send()
    .await;
```

Even though the code to propagate to SQS is right below this, I'll touch on that when I get to Lambda Function 3. For now, I've got my context being sent over to the next Lambda Function via HTTP Headers.

### Rust Lambda Function 2

Digging into the Read Function will show a very simple JSON response with no processing. I'm going to first create the function and then assign it to the `GET` verb on the default `/` endpoint.

```typescript
const readFunction = new RustFunction(this, 'ReadFunction', {
  architecture: Architecture.ARM_64,
  functionName: "sample-read-function",
  manifestPath: path.join(__dirname, `../../lambdas/read-function`),
  memorySize: 256,
  environment: {
    RUST_LOG: 'info',
    FUNCTION_NAME: "read-function",
    DD_API_KEY: process.env.DD_API_KEY!,
    DD_SITE: process.env.DD_SITE!,
    AGENT_ADDRESS: '127.0.0.1'
  },
  layers: [layer]
});

api.root.addMethod("GET", new LambdaIntegration(readFunction))
```

Unlike the Lambda Function 1, I am going to dig into `main` because I did something a little different here. Deep in the initialization of the Lambda Runtime, there is a span that is emitted from the Lambda Runtime. It has the simple name of "Lambda Runtime Invocation". Now normally, this might not seem like a big deal. However, if I want connected spans, I don't have access into this particular span's parent trace. Therefore, I end up with all of my spans connected, but this one lone span with its own trace parent.

I ended up getting around this but creating my own instance of the Lambda Runtime which allows me to leave this span out of the my call chain. I got the idea from reading through the [Lambda Runtime](https://github.com/awslabs/aws-lambda-rust-runtime) GitHub Issues and codebase.

Here's a look at the `main` for that Function.

```rust
#[tokio::main]
async fn main() -> Result<(), Error> {
    let telemetry_layer = tracing_opentelemetry::layer().with_tracer(init_datadog_pipeline());
    let fmt_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_target(false)
        .with_current_span(false)
        .without_time();

    Registry::default()
        .with(telemetry_layer)
        .with(fmt_layer)
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    // Initialize the Lambda runtime
    let runtime = Runtime::new(service_fn(handler));
    runtime.run().await?;
    Ok(())
}

```

What that produces is no spans for the initial Lambda Invocation and allows me to start tracing in the `handler` function. I of course could have added a span in here, but I wouldn't have context because my `main` function doesn't know about the web API request.

However, when I get into my `handler` code, I do have the context because I have access to the HTTP Headers for the request. I can then use those to set the parent of the span, which is the `traceparent` that is my propagation connector.

```rust
let mut fields: HashMap<String, String> = HashMap::new();
fields.insert(
    "traceparent".to_string(),
    String::from(
        request
            .payload
            .headers
            .get("traceparent")
            .unwrap()
            .to_str()
            .unwrap(),
    ),
);

let propagator = TraceContextPropagator::new();
let context = propagator.extract(&fields);
let span = tracing::Span::current();
span.set_parent(context);
```

And now in any subsequent things I do, I have lineage. For instance, I have a function called `generate_context` that will get included in this chain. I'll show what this looks like when I get into the Datadog section.

```rust
#[instrument(name = "AddContext")]
fn generate_context() -> AddedContext {
    AddedContext {
        timestamp: Utc::now().timestamp_millis(),
        description: "From Read".to_string(),
    }
}

```

### Rust Lambda Function 3

To complete the sequence, I need to build the Lambda Function that responds to the event that is posted on the SQS. With CDK, I first build the function like I did above and then I'll attach the correct permissions to read from the queue.

```typescript
const changeFunction = new RustFunction(this, 'ChangeFunction', {
  architecture: Architecture.ARM_64,
  functionName: "sample-handle-change-function",
  manifestPath: path.join(__dirname, `../../lambdas/handle-change-function`),
  memorySize: 256,
  environment: {
    RUST_LOG: 'info',
    FUNCTION_NAME: "handle-change-function",
    DD_API_KEY: process.env.DD_API_KEY!,
    DD_SITE: process.env.DD_SITE!,
    AGENT_ADDRESS: '127.0.0.1'
  },
  layers: [layer]
});

const queue = new Queue(this, 'PostQueue', {
  queueName: 'sample-post-queue'
});

queue.grantConsumeMessages(changeFunction);
changeFunction.addEventSource(new SqsEventSource(queue, {
  batchSize: 10,
}))

```

Before diving into the Function, I want to circle back to the originating Lambda Function to show how I'm connecting the `traceparent` back into this function. I'm going to carry the context in the `correlation_id` field.

```rust
#[derive(Serialize, Debug)]
struct MessageBody {
    timestamp: i64,
    description: String,
    id: String,
    correlation_id: String,
}
```

I'm then populating the value from the trace context that I'm sending in the web request so I know that each of these will have the same trace parent id.

```rust
let mut trace_parent: Option<String> = None;

propagator.inject_context(&ctx, &mut fields);
let headers = fields
    .into_iter()
    .map(|(k, v)| {
        if k == "traceparent" {
            trace_parent = Some(v.clone());
        }
        return (
            HeaderName::try_from(k).unwrap(),
            HeaderValue::try_from(v).unwrap(),
        );
    })
    .collect();

```

And finally, I'm going to send this all into the function that puts the payload on the SQS queue.

```rust
#[instrument(name = "Post Message")]
async fn post_message(
    client: &aws_sdk_sqs::Client,
    mut payload: MessageBody,
    trace_parent: Option<String>,
) -> Result<(), aws_sdk_sqs::error::SdkError<SendMessageError>> {
    match trace_parent {
        Some(x) => {
            payload.correlation_id = x;
        }
        None => payload.correlation_id = "".to_string(),
    }
    let span = tracing::info_span!("SQS");
    let message = serde_json::to_string(&payload).unwrap();
    client
        .send_message()
        .queue_url("<QUEUE_URL>")
        .message_body(&message)
        .send()
        .instrument(span)
        .await?;

    Ok(())
}
```

And the last piece of the puzzle is to read the message from SQS and set the parent of the span to the trace id for the incoming message.

```rust
#[instrument(name = "Handler")]
async fn handler(event: LambdaEvent<SqsEvent>) -> Result<(), &'static str> {
    event.payload.records.into_iter().for_each(|record| {
        let r: MessageBody = serde_json::from_str(record.body.unwrap().as_ref()).unwrap();
        let mut fields: HashMap<String, String> = HashMap::new();
        // find the trace parent id
        fields.insert("traceparent".to_string(), r.correlation_id.clone());

        let propagator = TraceContextPropagator::new();
        let context = propagator.extract(&fields);
        let span = tracing::Span::current();
        // set the parent of the span
        span.set_parent(context);
        span.record("otel.kind", "SERVER");
        tracing::info!("(Body)={}", r.clone());
        tracing::info_span!("Processing Record");
    });
    Ok(())
}
```

And that is how to connect context from one function to another function when passed through SQS.

## Datadog to Bring it Together

I know that standards are a good thing, but I do hope one day to have a native Datadog SDK for Rust. I'm a huge fan of using their SDKs with other languages like Java, C#, and Go, and I'm hopeful at some point we get one for us Rustaceans. However, until then, I'm grateful that the Datadog Lambda Extension will handle OpenTelemetry traces and spans like what I showed you above. To reiterate that, I'm adding the Extension to each of my functions, and setting a few environment variables.

```typescript
const layer = LayerVersion.fromLayerVersionArn(
  this,
  'DatadogExtension',
  'arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension-ARM:68'
)

// in the function definition
environment: {
  DD_API_KEY: process.env.DD_API_KEY!,
  DD_SITE: process.env.DD_SITE!,
  AGENT_ADDRESS: '127.0.0.1'
},
```

The extension needs to match the runtime architecture that I've chosen. I almost always go ARM (Graviton), so I do the same with the extension. And then I had the Datadog API Key, Site, and an agent address. The agent address is just so that I can tell the OpenTelemetry exporter where to find the OpenTelemetry collector. In my case, the Datadog extension IS the collector.

### Trace and Span Graphs

Starting off the visuals, Datadog gives me a nice map to show what my workflow in the Post Function looks like. The visual represents the flow I've been demonstrating in the paragraphs above. Not surprising to see 98% percent of the execution time is attributed to the `post-function`

![Datadog Map](/images/function_map.jpg)

Looking deeper into an individual trace which originates with an API request, a better view of all of the work above comes into focus. I can see that all of the instrumentation work shows up in this waterfall graphic.

![Datadog Waterfall](/images/function_waterfall.jpg)

And lastly, a span list view will show a different picture of the waterfall above.

![Datadog Span List](/images/span_list.jpg)

### Tracing Thoughts and Comments

I continue to be blown away by how well Datadog works with my OpenTelemetry traces and spans. The instrumentation is just so required in a modern application. Even if I was building a more monolithic system, the tracing of the logic through that larger application would be a requirement to ship to production. Visualizing, searching, dashboarding and whatnot off of this rich user data will not only help build confidence and trust from your users, but empower teams to tackle new features and deploy more often with safety. It's just a requirement for anything I'm working on. And Datadog is at the center of it all for me.

One thing I didn't mention as a contra thought, is that I'm using child spans to relate to other spans and this works fine in this example. However, there are times where I want to imply a more casual or loose relationship between spans. Enter a [Span Link](https://opentelemetry.io/docs/concepts/signals/traces/#span-links). Span links would be perfect for queue reading because the producer shouldn't know much if any about its consumers. So I could argue that the consumers are linked spans and not necessarily child spans. I haven't done this with Datadog before, so I need further, but I wanted to include these thoughts here to help you think as well about how systems can be shown to have connection through OpenTelemetry.

## Wrapping Up

I started this article thinking it would be a quick breeze through Rust, Lambda, OpenTelemetry, and how to connect Lambda Functions with Datadog. I hope you are still with me and managed to get through it all. It took me a bit of time to get through some of the Rust Lambda Runtime pieces but once I got it figured out, everything came together nicely.

I seriously can't stress enough, Observability is so often compared in my mind to Caching. People either cache early or cache late. They either plan to observe early, or are forced to observe late due to fires and problems. Get out ahead of the curve and build observability into your projects from day 1. Trust me on this one.

And as promised, here's the [GitHub repository](https://github.com/benbpyle/rust-otel-connected-lambdas/tree/main) that contains the full working source code that I highlighted in the article. Feel free to clone, fork, or submit a PR. Enjoy!

Thanks for reading and happy building!
