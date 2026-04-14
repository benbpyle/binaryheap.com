---
title: An Allow List Lambda Function in Rust is 1 Guaranteed Way to Improve CORS
author: "Benjamen Pyle"
description: "Some time ago I wrote an article about Cross-Origin Resource Sharing with API Gateway that talks about custom allow lists. I wanted to revisit that implementation not because the code doesn't work, bu"
pubDatetime: 2024-03-23T00:00:00Z
tags:
  - aws
  - cdk
  - programming
  - rust
  - serverless
draft: false
---

Some time ago I wrote an article about [Cross-Origin Resource Sharing](https://binaryheap.com/cross-origin-allowlist-with-api-gateway/) with API Gateway that talks about custom allow lists. I wanted to revisit that implementation not because the code doesn't work, but because I wanted to see what it would look like in Rust. Remember, I believe that more developers would be choosing Rust with Serverless if more content and examples existed. Let's dive into building a Lambda Function in Rust for CORS.

## Architecture

Working with CORS is something that many developers sort of take for granted. I mean, Cross-Origin Resource Sharing isn't something you need to pay attention to, is it? The fact is though, it's something you use every day while using the internet or in the applications you are building, but it's usually already in place when working on a project. However, let's pretend it isn't.

In my career, I've seen so many instances where developers respond to an OPTIONS request with `Access-Control-Allow-Origin: *`. This article's purpose isn't to explain when and why you should or shouldn't do that. But there are times when you are building an API with authorization that you will have to make provisions for the Authorization header. And two of the ways to do that are by using `Access-Control-Allow-Headers` or `Access-Control-Allow-Credentials`. And when using allow credentials, you lose the ability to return `*` to the allow origin header.

What this means for us as developers is that we need to return the matching origin for the supplied request.

**Giant caution here:** Do not reflect the incoming origin to simply bypass a check of allowed origins. You will be sharing with bad actors that you have a flaw in your implementation and will give them a reason to take advantage of this.

But what we can do is use API Gateway to trigger a Lambda function in Rust that responds to our CORS request and verifies the origin is in an allow list.

![Lambda Function in Rust](/images/1_image.png)

## The Lambda Function in Rust

Let's jump right into our Lambda Function in Rust CORS implementation. For a quick aside, the sample repository at the bottom of the article has CDK code in TypeScript so you can deploy this to your AWS account and get going.

### Main Fn

All Lambda Functions in Rust have a `main` function entry point. It's the first function that is called and helps initialize defaults or items that'll be used throughout the lifecycle of the request.

The key thing to note is that I'm requiring a variable called `ALLOWED_ORIGINS` which is a comma-separated list of acceptable domains and allowed by this CORS function. Imagine though that you have a larger list of allowed domains? This could be pivoted to a DynamoDB table or perhaps even a SET in a [Momento](https://www.gomomento.com/) cache.

```rust
#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .json()
        .init();

    let origins = env::var("ALLOWED_ORIGINS").expect("ALLOWED_ORIGINS must be set");
    let allowed_origins = &origins;

    run(service_fn(move |payload: Request| async move {
        function_handler(allowed_origins, payload).await
    })).await
}
```

### Handler Fn

Most API Gateway OPTIONS request implementations I've seen are MOCK requests that return a standardized response. Custom domain checks might be complicated or slow and developers sometimes might not feel the overhead is worth the check. This is where implementing this Lambda Function in Rust makes so much sense. I've [written about this topic](https://binaryheap.com/rust-and-lambda-performance/) quite a bit, Rust's performance with Lambda is blazing fast. Using Rust in this space would be a great starting point if you are looking to add the language into your toolkit. It's just a great use case.

The handler takes a pointer to the allow list string and the incoming request that will have a header HeaderMap. I then pair it with a `get_origin` function that checks the allow list for the value in the Origin header.

```rust
fn get_origin(headers: &HeaderMap, allowed_origins: &str) -> Option<String> {
    return match headers.get("origin") {
        Some(origin) => {
            let s = allowed_origins.split(',');
            for o in s {
                if o == origin {
                    return Some(o.to_string());
                }
            }

            None
        }
        None => {
            None
        }
    };
}

async fn function_handler(
    allowed_origins: &str,
    event: Request,
) -> Result<impl IntoResponse, Error> {
    match get_origin(event.headers(), allowed_origins) {
        Some(origin) => {
            let response = Response::builder()
                .status(StatusCode::OK)
                .header("Access-Control-Allow-Origin", origin)
                .header("Access-Control-Allow-Headers", "Content-Type")
                .header("Access-Control-Allow-Methods", "GET, PUT, DELETE, POST, OPTIONS, PATCH")
                .body("".to_string())
                .map_err(Box::new)?;
            Ok(response)
        }
        None => {
            let response = Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body("".to_string())
                .map_err(Box::new)?;
            Ok(response)
        }
    }
}
```

Notice that I'm making use of Rust's Option enumeration and the match construct so that I can validate that I've received an allowed value from the origin header. In the case of matching, I can return anything that I want in the response headers. These values are 100% up to your use case.

In the scenario where I'm not finding a match to the allow list, I just return a 400 BAD_REQUEST.

That's all there is to it. A non-mirrored allow list performed by a Lambda Function in Rust can then be connected to an API Gateway.

## API Gateway

At this point, I can deploy the infrastructure up to AWS which will create my API Gateway, and Lambda Function in Rust and connect the two. Connected, the API Gateway OPTIONS endpoint will look like this:

!\[CORS allow list\](![Sample API Gateway](/images/api_lambda_cors.png))

## Quick Note on Performance

Again, I'm back to performance because it is such a compelling argument for Rust. Quickly though, it's not the only argument that I've said numerous times, but any chance I can get to demonstrate this sustainability aspect of the language, I'm going to. Sustainability = Cost.

I have written before about the [Lambda Power Tuning](https://docs.aws.amazon.com/lambda/latest/operatorguide/profile-functions.html) project. You need to be using this if you are deploying Lambda Functions in production. For this article, I ran this Lambda Function in Rust through the tooling and the output is below.

![Lambda Function in Rust](/images/cors_power_tuning.png)

The Power Tuning Tool takes a payload and a configured list of memory options that it runs against your Lambda Function. The graph then shows the memory size, duration, and the cost associated with the execution. What I like about this tool is that I don't have to guess the size of my Lambda Function. It helps me make that optimal choice.

But back to the Lambda Function in Rust for this CORS allow list. At 128MB of memory, the average execution is < 1 ms. Nothing I can say about that, so I'll just leave you with it and let it sync in.

## Wrapping Up

CORS can be hard or it can be ignored and then the problems that come from not doing it right can be extremely hard. However, dealing with multiple domain origins doesn't have to be difficult. By using a Lambda Function in Rust to build a CORS allow list, you can add a layer of security while also not sacrificing performance. And to tie it all back together, this is a 100% serverless solution that could be mixed in with an existing serverless or serverful API. Start small and innovate. Serverless doesn't have to be the strategy, but it 100% should be a part of your strategy.

For reference, [here is the GitHub repository](https://github.com/benbpyle/cors-allow-list-rust) that you can clone, adjust, and deploy!

Thanks so much for reading and happy building!
