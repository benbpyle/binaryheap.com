---
title: "Powerful Visibility with Rust, Lambda, Datadog, and OpenTelemetry"
author: "Benjamen Pyle"
description: "As much as I love Rust and especially Rust on serverless, it would be hard for me to recommend Rust and Lambda to a company without a plan for Observability. I've written about this topic before and t"
pubDatetime: 2024-08-02T00:00:00Z
tags:
  - aws
  - datadog
  - observability
  - rust
  - serverless
  - uncategorized
draft: false
---

As much as I love Rust and especially Rust on serverless, it would be hard for me to recommend Rust and Lambda to a company without a plan for Observability. I've written about [this topic before](https://binaryheap.com/building-serverless-applications-with-aws-observability/) and the importance of building not just serverless applications, but distributed applications, in general, must have good telemetry built into its core. I've also [spoken](https://www.youtube.com/watch?v=QgfqmGFmzR8&list=PLdh-RwQzDsaNd5cmcY3ey4QoeyDk6aMKz&index=23&t=3s) about the importance of making this a core part of your development culture. What I haven't talked enough about is how to instrument a Rust application built for Lambda with OpenTelemetry. And with those OTel traces, how easy it is to send them to the [Datadog Lambda Extension](https://github.com/DataDog/datadog-lambda-extension). Let's dive into serverless observability with Rust, OpenTelemetry, and Datadog.

## Flexibility

Open standards and vendor roadmaps often clash and a builder is left with this, which path do I go? Do I lean into the vendor-specific SDK or APIs or do I try and stay agnostic with my approach in case I change my mind? Or worse, the vendor loses interest in my path and I'm left holding a deprecated bag of useless code.

That fate though doesn't have to be our fate when choosing to instrument your Rust code with OpenTelemetry standards. Datadog has made it clear that they are going to lean more into OTel and support shipping OpenTelemetry traces from their native agent. That developer experience can look very much like the image below.

![OpenTelemetry Datadog](/images/datadog_otel-scaled.jpg)

In addition to the above, Datadog also includes a Lambda Extension that runs a telemetry shipper hosted right next to your Lambda code. And, with version 61+ of that extension, there is a rewritten Rust version that improves upon the traditional extension cold start latency and the speed to shipping traces originating from my code.

Pair all that together with Rust, and I've got just what I need to recommend Rust and Lambda for production. All of the [Rust and Lambda goodness](https://binaryheap.com/serverless-rust-developer-experience/) and the OpenTelemetry tracing that is visually fantastic in the Datadog UI.

## Working Solution

What would an article about Rust, OpenTelemetry, and Datadog be without some code? For this solution, I'm using the CDK to build out a basic Lambda Function that exposes an API endpoint over a FunctionUrl. The layout of that CDK project is mixed with my Lambda Function code as well.

![CDK Rust Otel](/images/project_layout.jpg)

### Rust and Lambda

My Rust Lambda handler looks like so many others that I've shared in my articles. I'm using the [AWS Lambda Runtime project](https://github.com/awslabs/aws-lambda-rust-runtime) to handle deserializing structs and working with the Lambda API. However, some bits are new that are worth diving a little deeper into.

#### OpenTelemetry and Datadog

I'm using [Tokio's tracing library](https://github.com/tokio-rs/tracing) which provides the ability to plug layers into the writer. One of those layers happens to be an OTel layer. With OpenTelemetry, I can define endpoints where I'm going to send my traces. Normally, I'd send over HTTP or gRPC and the standard ports, but there is an additional crate I'm using that is not maintained by Datadog but it is community-supported. That crate is called `opentelemetry-datadog` and it helps establish the pipeline, service name, endpoint, and API version that the Datadog extension will recognize.

```rust
let tracer = opentelemetry_datadog::new_pipeline()
    .with_service_name("web-handler")
    .with_agent_endpoint("http://binaryheap.com:8126")
    .with_api_version(opentelemetry_datadog::ApiVersion::Version05)
    .with_trace_config(
        opentelemetry_sdk::trace::config()
            .with_sampler(opentelemetry_sdk::trace::Sampler::AlwaysOn)
            .with_id_generator(opentelemetry_sdk::trace::RandomIdGenerator::default()),
    )
    .install_simple()
    .unwrap();
let telemetry_layer = tracing_opentelemetry::layer().with_tracer(tracer);
```

With the tracer established, I now just need to add it to the tracing registry. For reference, I'm also including a JSON-formatted layer for printing.

```rust
let logger = tracing_subscriber::fmt::layer().json().flatten_event(true);
let fmt_layer = tracing_subscriber::fmt::layer()
    .with_target(false)
    .without_time();

Registry::default()
    .with(fmt_layer)
    .with(telemetry_layer)
    .with(logger)
    .with(tracing_subscriber::EnvFilter::from_default_env())
    .init();
```

With the configuration out of the way, I want to dive into what gets created as a span.

#### Rust and OTel

The Rust language has a feature called Macros which are blocks of code that can be expanded at compile-time to inject code that can perform additional operations. Such is the case with the Tokio `instrument` [macro](https://docs.rs/tracing/latest/tracing/attr.instrument.html). What the macro does is it creates and attaches a span to the parent of the context so that your function/method is included in the overall instrumentation. The simplicity of this experience can't be understated, but it also comes with tremendous power.

For this demo, I've created 3 functions that perform `std::thread::Sleep` operations to simulate "doing work". Note the `(name = '')` code inside of the `instrument`. That allows me to name the span which I'll show later on in the article.

```rust
#[instrument(name = "Nested in Long Operation")]
fn do_nested_operation() {
    std::thread::sleep(Duration::from_millis(100));
}

#[instrument(name = "Standalone Operation")]
fn do_standalone_operation() {
    std::thread::sleep(Duration::from_millis(200));
}

#[instrument(name = "Long Operation")]
fn do_operation() {
    std::thread::sleep(Duration::from_millis(500));
    do_nested_operation();
}
```

Handling the Lambda invocation payload allows me to trigger these function calls. Remember, this is a basic example not to highlight Lambda and Rust perse, but to demonstrate the integration of Lambda, Rust, OTel, and Datadog.

```rust
#[instrument(name = "Function Handler")]
async fn function_handler(event: Request) -> Result<Response<Body>, Error> {
    do_operation();
    do_standalone_operation();
    let resp = Response::builder()
        .status(200)
        .header("content-type", "text/html")
        .body("Hello World".into())
        .map_err(Box::new)?;
    Ok(resp)
}
```

#### CDK Integration

Before I jump into what this code produces in terms of traces and spans, the CDK code shows how I'm creating the FunctionUrl and the required Datadog extension. Datadog has a few bits that require to have the extension configured to send my OpenTelemetry output.

Points to note in the below.

- The Datadog extension is added as a Lambda Layer from the ARN
- DD_API_KEY: this is the API Key I created in Datadog. I put that in a Parameter Store path that I can keep safe and fetch at build time
- DD_EXTENSION_VERSION: making this `next` enables the project 'Bottlecap' which is the rewritten extension that I mentioned at the top of this article
- DD_SITE: if you are in the default Datadog region, this isn't needed. For me though, I have something else, so I'm putting that in an environment variable
- addFunctionUrl creates the endpoint that will be exposed to trigger this Lambda Function

```typescript
constructor(scope: Construct, id: string, props: FuncProps) {
    super(scope, id)
    const layer = LayerVersion.fromLayerVersionArn(
        scope,
        'DatadogExtension',
        'arn:aws:lambda:us-west-2:464622532012:layer:Datadog-Extension-ARM:62'
    )

    const parameter = StringParameter.fromStringParameterName(
        scope,
        'DDApiKey',
        '/core-infra/dd-api-key'
    )

    this._webHandler = new RustFunction(scope, `CorsLambdaFunction`, {
        manifestPath: './web-handler',
        functionName: `rust-otel-datadog`,
        timeout: Duration.seconds(10),
        memorySize: 256,
        architecture: Architecture.ARM_64,
        environment: {
            DD_ENV: 'demo',
            DD_EXTENSION_VERSION: 'next',
            DD_SITE: process.env.DD_SITE!,
            DD_API_KEY: parameter.stringValue,
            RUST_LOG: 'info',
        },
        layers: [layer],
    })

    Tags.of(this._webHandler).add('version', props.version)

    const fnUrl = this._webHandler.addFunctionUrl({
        authType: FunctionUrlAuthType.NONE,
    })

    new CfnOutput(this, 'TheUrl', {
        value: fnUrl.url,
    })
}
```

## Datadog and OpenTelemetry

Time to see what this looks like when the Lambda Function is triggered!

In the Datadog UI, there are three places I like to use to look at Function traces and spans. I'm only going to focus on the Serverless Infrastructure area, but you can find data in the Service Catalog and the Trace Explorer.

### Serverless Infrastructure

The Serverless Infrastructure section in the Datadog UI provides visibility into Lambda Functions, Fargate Tasks, and Step Function workflows. This is a good place to start because it brings together instrumentation captured in my function as well as the instrumentation captured at the Lambda level with the Datadog extension. This is why I recommend builders use the extension and not an OTel collector. The extension has some great richness to what it picks up that is useful.

A quick overview of my function shows things like average duration, percentage of invocations that are cold starts, errors, and even estimated cost. This can all be scoped by time as well.

![Datadog OTel overview](/images/trace_list.jpg)

#### Trace Exploration

From the grid in the image above, I'm showing that our OTel instrumentation with Datadog produced top-level traces. That's great and all, but where are the rest of the spans I instrumented?

By clicking on a trace, I can show you just that. Below is the span list that is created under the root trace.

![Datadog OTel Span](/images/1_span_list.jpg)

And if viewing this flat isn't good enough, I can pivot to the Waterfall view. Notice the names I used in the `instrument` macro show up in the UI.

![Datadog OTtel Waterfall](/images/waterfall.jpg)

#### Metrics and the new Bottlecap Extension

The last piece that I want to explore is the metrics view that is created by Datadog. The metric graphs can be interchanged so I selected these 4 to walk through what they mean.

- Duration: The elapsed time for a function’s execution, in milliseconds
- Billed Duration: Execution time billed in 1 ms increments, rounded up to the nearest millisecond
- Runtime Duration: The elapsed time for my function handling code
- Post Runtime Duration: Code that runs in the Lambda lifecycle (Datadog extension)

![Datadog Lambda Metrics](/images/metrics.jpg)

To highlight the performance of the Datadog extension, I'm looking at the Full Duration stack graphed by my function duration and the post-function duration. The 100 - 200ms delay can be attributed to the network latency from leaving us-west-2 to my Datadog endpoint in us-east.

![Datadog Durations](/images/duration_breakdown.jpg)

## Thoughts and Impressions

I've been on the fence for a while about whether I'm a fan of OpenTelemetry or whether I think it's just another open source project that'll be 90% done and leave me wanting it to be finished. That probably isn't fair, because the SDK building is the part that leaves me wanting more. Or did leave me wanting more? The specifications and the collaboration around the standards are impressive. I'm excited about where this is going and I think it's worth investing in your personal developer cycles to get more adept at the SDKs for your specific language. Consider this my official, _I'M IN ON OTEL_.

The usage of OTel with Rust also feels solid because it builds upon Tokio who runs the asynchronous framework I prefer and the Rust SDK acts as a layer to be plugged into the tracing pipeline.

And ultimately, Datadog has done a great job taking those OpenTelemetry traces and making them look like Datadog traces. I plan on writing some more about sharing trace context via W3C standards like the `traceparent` and `tracecontext` headers that are specified in the specification.

## Wrapping Up

Building distributed systems is hard. Transactions happen fast. They happen across boundaries. And errors seemingly hide in haystacks while customers complain to agents or worse on social media. These systems require observability. That observability requires telemetry. As a builder, you need to be thinking about observability from day one. It is a UX concern. Let that sync in.

Serverless applications are no different. They force you to be more distributed which means that observability is a permission-to-play requirement. Enter OpenTelemetry, Datadog, and Rust. And as always here is the [link to the repository](https://github.com/benbpyle/rust-opentelemetry-datadog-lambda/tree/main). Feel free to clone and use it as a starting point to build your next Lambda and Rust project when you are looking to have OTel support with Datadog.

Thanks for reading and happy building!
