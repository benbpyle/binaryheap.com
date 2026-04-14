---
title: DSQL Part 2 - More Rust and a Momento Cache
author: "Benjamen Pyle"
description: "**UPDATE: I had a missing index on my DSQL table. If you read the article before, please go back and check the metrics and graphs**"
pubDatetime: 2024-12-14T00:00:00Z
tags:
  - aws
  - datadog
  - dsql
  - momento
  - observability
  - programming
  - rust
  - serverless
draft: false
---

**UPDATE: I had a missing index on my DSQL table. If you read the article before, please go back and check the metrics and graphs**

It's been two weeks since the launch of AWS DSQL and I'm still excited about where they are heading with this product. If you want to read about my first [impressions](https://binaryheap.com/first-look-dsql/), check out that article first and this one will be waiting for you when you return.

As I let that first article settle, I started thinking about single read item performance and as you know, with Lambda, performance affects cost. Lambda cost can summed up as the product of Total Compute and Memory Allocated with total compute being more than just clock time. Lambda is charging per wall time which comes into play when I have I/O bound operations such as SQL queries. The focus of this article is to see how well a single query on a key performs and what that does to overall Lambda performance. And then by adding [Momento](https://www.gomomento.com/) as a read aside cache, does that have even further benefits in terms of cost and performance.

Let's dive in!

- [The Solution](#the-solution)
- [Digging In](#digging-in)
  - [Cache Builder](#cache-builder)
  - [Seeding the Table](#seeding-the-table)
  - [Get Lambda](#get-lambda)
    - [Main](#main)
    - [Function Handler](#function-handler)
      - [The HTTP Part](#the-http-part)
      - [Query the Cache](#query-the-cache)
      - [Cache HIT or Miss](#cache-hit-or-miss)
      - [Quick Thoughts](#quick-thoughts)
  - [Instrumentation and Performance](#instrumentation-and-performance)
    - [Function Performance](#function-performance)
    - [Component Performance](#component-performance)
      - [Cache Miss](#cache-miss)
      - [Cache Hit](#cache-hit)
      - [Consistency Story](#consistency-story)
- [Takeaways](#takeways)
  - [Rust Continues to Amaze Me](#rust-continues-to-amaze-me)
  - [Momento](#momento)
  - [DSQL](#dsql)
  - [Affects on Cost](#affects-on-cost)
  - [Observability](#observability)
- [Wrap Up](#wrap-up)

## The Solution

The repository that I'll share at the end of the article has 3 binaries in it.

1.  A Cache builder - Rust project for creating a Cache in Momento
2.  Data "Seeder"- Rust project for loading 100K records into a DSQL Table
3.  Lambda Get - Rust project that is an AWS Lambda Function that fetches from the Cache first and then DSQL if not found before writing the data back into the Cache

This is a fairly common scenario and use case when building high traffic APIs. In general, the latency incurred is in waiting on I/O operations. So by leveraging a cache the idea is that the user waits less and by waiting less, I'm charged less by AWS and the other serverless pieces in my application. Let's see if that holds true.

## Digging In

There are a couple of prerequisites that if you want to follow along you'll need to take care of.

First, you'll need an account at Momento. It's free to get started, so shuttle on over there and get that taken care of. With an account, you'll then need an API Key. The [Momento Docs](https://docs.momentohq.com/cache/getting-started) do a better job than I explaining how this works. Make sure to grant the key admin permissions for future tasks so that you can run the Cache Builder binary.

Second, create a cluster in DSQL. I explained how to do this in my First Impressions article. You'll need to click your way through the AWS Console because CloudFormation and CDK support isn't there yet. It is still only in Preview, so it'll be coming!

### Cache Builder

I like to think of caching as something that is often only done either early or late in a project. And to me, early is really the only correct choice, but by doing so early, I incur costly over provisioned resources that eat into budget. This is why most don't cache until later. Either cost or just sheer dependencies on other teams brings developers to wait until it's absolutely necessary to make the leap. And usually at that point, the developer isn't the one making the decision.

With a cache like Momento, I can bring it in whenever I want because it's serverless and I don't incur costs when I'm not using the software. It's a perfect fit for highly available production environments but it also is just what I need in development and QA stacks when traffic is significantly less. Which is why I reach for it as my cache of choice.

Building a cache to be used for my Lambda function is done through the Momento SDK. It covers administration operations as well as application operations. The Cache Builder below follows into the admin or control plane space.

The main thing to point out is that the API Key created in the previous step is used here in the Cache Builder. I'm using an environment variable called `MOMENTO_API_KEY` and creating a cache called `CacheableTable`

Run that with:

```bash
cargo run
```

```rust
#[tokio::main]
async fn main() -> Result<(), MomentoError> {
    let cache_client = CacheClient::builder()
        .default_ttl(Duration::from_secs(60))
        .configuration(configurations::Laptop::latest())
        .credential_provider(CredentialProvider::from_env_var(
            "MOMENTO_API_KEY".to_string(),
        )?)
        .build()?;
    let cache_name = "CacheableTable";
    match cache_client.create_cache(cache_name).await? {
        CreateCacheResponse::Created => println!("Cache {} created", cache_name),
        CreateCacheResponse::AlreadyExists => println!("Cache {} already exists", cache_name),
    }
    Ok(())
}

```

I'm all set at this point and ready to move onto step 2. Seeding my table.

### Seeding the Table

I toyed with the idea of just doing a few records but ended up moving off of that thought because I wanted to see how well a get by index performed when navigating 100K records. This data seeder project can be adapted to your needs, but right now, it stands up some threads and then each thread loops to 1000 and creates a record. Feel free to tweak this to your needs.

```rust
async fn load_data(pool: &PgPool) {
    let mut children = vec![];

    for _ in 0..100 {
        let clone_pool = pool.clone();
        let handle = tokio::spawn(async move {
            for j in 0..1000 {
                let i = CacheableItem::default();

                let result = sqlx::query("INSERT INTO CacheableTable (id, first_name, last_name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)")
            .bind(i.id.to_owned())
            .bind(i.first_name.clone())
            .bind(i.last_name.clone())
            .bind(i.created_at)
            .bind(i.updated_at)
            .execute(&clone_pool)
            .await;

                match result {
                    Ok(_) => {
                        println!("(Item)={:?}", i);
                    }
                    Err(e) => {
                        println!("Error saving entity: {}", e);
                        break;
                    }
                }
            }
        });
        children.push(handle);
    }

    for t in children {
        t.await.unwrap();
    }
}

```

With sufficient data, it's time to dig into the Lambda Function!

### Get Lambda

This is where the meat of the fun starts happening. The first two projects are just about setting the table. My Lambda function is where the code gets real and I can start measuring performance. I'm going to walk through the code and how it works and then I'll tackle performance and my takeaways.

#### Main

This Rust Lambda function will look like so many that I've written and you've read. I'm creating my tracing setup, creating a `PgPool` for DSQL and then setting up the `CacheClient` which will interact with Momento.

I am going to use my favorite APM and tracing tool in [Datadog](https://www.datadoghq.com/) to bring together my Tokio and OpenTelemetry tracing. The graphs will make so much of this very real.

One thing to note in all of this below is that I'm setting up 3 libraries. And my favorite in the below is in the Cache Client because of the simplicity of it. I could make the argument that both the tracing and DSQL require more dependencies, but there's something elegant in the Momento one. Developer experience matters. If you are building crates, keep that in mind.

```rust
async fn main() -> Result<(), Error> {
    // Create the tracer and establish OTEL pieces
    let tracer = opentelemetry_datadog::new_pipeline()
        .with_service_name("get-lambda")
        .with_agent_endpoint("http://127.0.0.1:8126")
        .with_api_version(opentelemetry_datadog::ApiVersion::Version05)
        .with_trace_config(
            opentelemetry_sdk::trace::config()
                .with_sampler(opentelemetry_sdk::trace::Sampler::AlwaysOn)
                .with_id_generator(opentelemetry_sdk::trace::RandomIdGenerator::default()),
        )
        .install_simple()
        .unwrap();
    let telemetry_layer = tracing_opentelemetry::layer().with_tracer(tracer);
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

    // DSQL and AWS Config
    let region = "us-east-1";
    let cluster_endpoint = env::var("CLUSTER_ENDPOINT").expect("CLUSTER_ENDPOINT required");
    let momento_key = env::var("MOMENTO_API_KEY").expect("MOMENTO_API_KEY required");
    let cache_name = env::var("CACHE_NAME").expect("CACHE_NAME required");

    // Generate auth token
    let sdk_config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let signer = AuthTokenGenerator::new(
        Config::builder()
            .hostname(&cluster_endpoint)
            .region(Region::new(region))
            .build()
            .unwrap(),
    );
    let password_token = signer
        .db_connect_admin_auth_token(&sdk_config)
        .await
        .unwrap();

    // Setup connections
    let connection_options = PgConnectOptions::new()
        .host(cluster_endpoint.as_str())
        .port(5432)
        .database("postgres")
        .username("admin")
        .password(password_token.as_str())
        .ssl_mode(sqlx::postgres::PgSslMode::VerifyFull);

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect_with(connection_options.clone())
        .await?;
    let shared_pool = &pool;

    // Momento Cache Setup
    let cache_client = CacheClient::builder()
        .default_ttl(Duration::from_secs(5))
        .configuration(configurations::Lambda::latest())
        .credential_provider(CredentialProvider::from_string(momento_key).unwrap())
        .build()?;

    let shared_cache_client = &cache_client;
    let shared_cache_name = &cache_name;

    run(service_fn(move |event: Request| async move {
        function_handler(shared_pool, shared_cache_client, shared_cache_name, event).await
    }))
    .await
}
```

#### Function Handler

The handler code is the entry point for my logic. It's where the Rust Runtime stops and I begin. I'm going to share it in snippets to demonstrate the read aside pieces of the caching.

##### The HTTP Part

The first part of the handler fetches the Item ID that is supplied in the `?id=` part of the query string. That ID then allows me to first lookup the item in the CacheableItem cache that I created in Step 1.

```rust
let id = request
    .query_string_parameters_ref()
    .and_then(|params| params.first("id"))
    .unwrap();

let mut body = json!("").to_string();
let mut status_code = StatusCode::OK;
let u = Uuid::from_str(id).unwrap();
```

##### Query the Cache

With an Item ID, I can then peek at my cache via the CacheClient. In my handler, I'm calling the function with the client, the cache name and the id that I picked up from the query string.

```
let cache_item = query_cache(cache_client, cache_name.to_owned(), id.to_string()).await;
```

What's to note here is that the Momento CacheClient abstracts the working with the cache itself. I could easily be fetching from a `HashMap` and looking for a key in a bag. The bulk of the below is just safe Rust code when working with a `Result` instead of unwrapping. I could have simplified even more with the `?` Operator but the error just works as a MISS and not something that I want to return back to handler function that muddies it up.

Also pay attention to two parts of the function that'll show up in the Datadog bits toward the bottom.

1.  The `#[instrument]` macro. This will create a span called `Query Cache` which will be the function span.
2.  The Momento SDK allows me to instrument the query to the cache via the `instrument` method where I pass in the `query_span`. This gives me the ability to isolate just the Momento code when looking at performance and success.

```rust
#[instrument(name = "Query Cache")]
async fn query_cache(
    client: &CacheClient,
    cache_name: String,
    id: String,
) -> Option<CacheableItem> {
    let query_span = tracing::info_span!("Momento GET");
    let response = client.get(cache_name, id).instrument(query_span).await;

    match response {
        Ok(r) => {
            let item: Result<String, MomentoError> = r.try_into();

            match item {
                Ok(i) => {
                    let o: CacheableItem = serde_json::from_str(i.as_str()).unwrap();
                    tracing::info!("(CacheItem)={:?}", o);
                    Some(o)
                }
                Err(e) => {
                    tracing::info!("(Cache MISS)={}", e);
                    None
                }
            }
        }
        Err(e) => {
            tracing::error!("(GetResponseError)={}", e);
            None
        }
    }
}
```

##### Cache HIT or Miss

In the even of a HIT or MISS from the cache, one of two paths will be taken.

- A HIT will return the object back and that's the end of the request
- A MISS will look for the item in the database and then write the item into the cache

```rust
match cache_item {
    Some(i) => {
        tracing::info!("Cache HIT!");
        body = serde_json::to_string(&i).unwrap();
    }
    None => {
        tracing::info!("Cache MISS!");
        let item = query_row(pool, u).await;
        match item {
            Some(i) => {
                write_to_cache(cache_client, cache_name.to_owned(), i.clone()).await;
                body = serde_json::to_string(&i).unwrap();
            }
            None => {
                status_code = StatusCode::NOT_FOUND;
            }
        }
    }
}
```

Querying the table is a beautiful block of code to me. It shows how well AWS has hidden the DQL implementation because if you didn't know I was using DSQL, you'd think I was querying any normal Postgres database.

Note that this code as well has the `instrument` macro and the SQLx library allows me to instrument to the `SELECT` query as well to isolate its peformance.

```rust
#[instrument(name = "DSQL Query")]
async fn query_row(pool: &PgPool, u: Uuid) -> Option<CacheableItem> {
    let query_span = tracing::info_span!("DSQL Read");
    let item = query_as!(
        CacheableItem,
        "select id, first_name, last_name, created_at, updated_at from CacheableTable where id = $1",
        u
    )
    .fetch_optional(pool)
        .instrument(query_span)
    .await;

    item.unwrap_or_default()
}

```

And when the query returns a result, I'm going to write that item back into the cache for next time. Again, same thing on the instrumentation.

```rust
#[instrument(name = "Write Cache")]
async fn write_to_cache(client: &CacheClient, cache_name: String, item: CacheableItem) {
    let query_span = tracing::info_span!("Momento SET");

    let value = serde_json::to_string(&item).unwrap();
    let result = client
        .set(cache_name, item.id.to_string(), value.clone())
        .instrument(query_span)
        .await;

    match result {
        Ok(_) => {
            tracing::info!("Cache item set");
            tracing::info!("(Item)={:?}", value);
        }
        Err(e) => {
            tracing::error!("(CacheWriteError)={}", e);
        }
    }
}
```

##### Quick Thoughts

Before digging into how this comes together and looking at performance, I wanted to touch upon how simple it was to implement this powerful pattern.

A read aside caching strategy is a straightforward approach to boosting performance. It acts like this.

- Get a request from a client
- Look for the item in cache
- If found
  - Return the item
- If not found
  - Read from durable storage
  - Write the item to cache
  - Return the item

With Momento, I can set the duration on the item depending upon how often my data changes. Read aside works really well for times when the data doesn't change very often. And if the data does change, you can initiate a cache bust to force a reload via the read aside. It's not ideal in highly volatile data and a write through approach might be a better fit. I'll tackle that in a future post!

But to tie it back to my implementation, this Rust code is very fast, very safe, and honestly not that much to pull together. It turns this Lambda function into a powerhouse.

### Instrumentation and Performance

The time to think about instrumentation starts at the first line of code. I don't build any Lambda Functions without instrumentation. Or any event-driven system for that matter. It's just too hard to debug and improve without it. I love leaning on Datadog to bring me powerful visuals and insights into the performance of my functions and systems. And with the latest [Lambda Extension](https://www.datadoghq.com/blog/datadog-next-gen-lambda-extension/) coded purely in Rust, the performance makes it a no-brainer for me.

It took me a little while in my Rust and Lambda journey to get this right, but the tracing setup I showed you above is rock solid and will yield great results. It can also be easily adapted should you not want to use Datadog. But why I'd ask?

#### Function Performance

Starting at the top, I ran 30 virtual users through my function for a duration of 15 minutes. I used Postman to run the API request and I also put this snippet in front of it so that I know the cache will get hit consistently. Lastly, I'm using a FunctionURL not APIGW, but I want to focus on the Lambda metrics, not the TTFB, TLS negotiation, DNS resolution and other things not in my control.

```javascript
var ids = [
  "1340d27f-c5fa-45d1-93ec-91b8465bce4e",
  "12bc9d0a-3e53-45f1-9186-4d3908c5230b",
  "26f1cb7f-94ee-46e6-b1ec-1eeca5ed35b6",
  "cb92d622-eff1-47bc-bd5d-5446664114bc",
  "0ace71c4-0983-453c-8932-265cec7231e2",
  "8e1ded56-ccfb-460c-a301-a830a8d2ef9e",
  "1340d27f-c5fa-45d1-93ec-91b8465bce4e",
  "374fb037-12d9-430a-8fd5-dd6c538774b3",
  "4881a44a-21be-4f93-9533-0995a4ce980a",
  "2b174dc9-c836-441e-84c4-9e2133f2d50d",
  "031b9117-1df6-4f3b-aac2-957ea9d57e3b",
  "bc92ea92-17f6-4805-898f-63bcded8d853",
  "fcbc51f0-ef79-4215-a7a7-2366a093fcf2",
  "1bdb2581-b449-42a1-ae49-37e2e6ff4374",
  "c2e9bd25-bc12-4eec-bd10-936e0c8ead0f",
  "5bf7cbaf-32db-4051-9057-fee0cf4aefca",
  "0d350981-26b5-4998-95ff-1a76b20909df",
  "07a04b77-2010-4b42-a85f-a7a5cd4a9cb9",
  "26740679-1a26-493e-becf-125c3611ad61",
  "971a9f84-da91-4156-8276-5a94e6f14dca",
  "b4c63a1d-8e2f-4589-ae32-670ab999e60d",
];

var i = Math.floor(Math.random() * 20);
pm.collectionVariables.set("ID", ids[i]);
```

I first want to look at the average function latency. This is mind boggling to me. Remember, my function does this

- Handles a request
- Deserializes the payload
- Does the cache/DSQL pieces
- Serializes the result and returns

![](/images/function_latency-1024x435.jpg)

That to me is an absurdly low latency. I think any user that encounters this GET operation is going to be happy with the results of their query. Each of these lines represent a different piece of the sample size.

The bottom line is the p50 latency, yellow is p90 and top blue is the 95. This type of performance is phenomenal to me consider all of the work that it's performing and that most all of it is I/O bound. Still more than acceptable for a GET operation when coming from a browser or another API client. Remember, I'm removing the things I can't control from the discussion here. Optimizing for those is another discussion.

#### Component Performance

Going a touch deeper, I want to explore what a single trace might look like and breakdown down a cache hit vs a cache miss and see where things stack up. Does adding the cache in Momento make a difference? And do I think the difference is meaningful.

##### Cache Miss

A cache miss as defined above is when I query Momento and don't find the item I'm looking for. That invocation of the handler will then query DSQL. And by laying the foundation with the `instrumentation` code, I get full visibility into these operations.

I like looking at these trace graphs in both flame and waterfall. What the below highlights are all of my available spans since the Miss runs all paths. Things to note here.

- A Momento read is amazingly fast. 1.89ms is nuts
- A DSQL query, is also super fast. It's just under 4 times slower on this particular request
- A write to Momento looks just the same as a read at 1.90ms. That might be the most impressive and understated piece of this
- Looking at the wrapping function which is the `DSQL Query`, I'm going to save that entire block plus the `Write Cache` block the next time I read this key

![Miss waterfall](/images/miss_waterfall.jpg)

![Miss flame](/images/miss_flame.jpg)

##### Cache Hit

Let's take a look at the happy path and a hit. Same two graphs. Essentially tells the story you think it would. Fewer steps equals better performance. Single digit millisecond performance is relative but it's still a boost. And remember, part of the calculation of Lambda's cost is compute time. So waiting on I/O might matter at volume.

![Waterfall Hit](/images/waterfall_hit.jpg)

![](/images/flame_hit-1-1024x465.jpg)

##### Consistency Story

The function performance shows good consistency but I do see some spikes in the p90. And not shown is the p99 here, but there are more spikes that pop up as well. What can that be attributed to? Well, it's the consistent performance of the cache hit vs the spikiness of the cache miss. What I've observed so far is that while DSQL performance is amazing, I do get spots in my calls that latency isn't as smooth. But then also where I see smoothness, I see a more consistent 20ms performance vs the single digit that I see in the trace above. Which furthers leans me to think that performance will get better as this goes GA, but also that you can't underestimate the benefits of putting a cache in place where you want to squeeze that last drop of cost, utilization, and performance out of your application. Caching early is almost always best.

With the proper instrumentation, I can further isolate individual resources in my requests. Datadog does this for me which makes highlighting trouble spots super easy

A table view of the resource breakdown yields this. Each and ever span in all of my traces is represented below. Everything from the cold start `load_region` to all of the operations I've show above. A couple of things standout

- DSQL performance is solid on average sitting at 8.29ms. A p95 latency on a primary key column yields 9.26ms on average. Considering early on in public preview and all of the work that it does, I'm not disappointed by that. If it never gets any better, I think I'm still OK with it honestly. And the p99 tail at 252ms is not going to impact most. I do need to look more at multiple queries, and building more complex things. But again, this is a start.
- Momento's cache is stupid fast and consistent. I ran 29.8K GETs vs 2.4K DSQL SELECTS and the total time in Momento was still under double that of the DSQL. P95 latency of 1.87ms and an average of 1.62ms is amazing to me. That's an average 12x improvement when getting a hit vs a miss on my cache when it comes to performance.

![](/images/resource_table-1024x460.jpg)

And a couple of more visuals that show the consistency of each of these databases.

This is the Momento GET consistency that is in that table graphed over time.

![](/images/p95_momento-1024x435.jpg)

And here is the DSQL Select operation graphed over time as well

![](/images/p95_dsql-1024x435.jpg)

## Takeaways

I'm not sure where to start here, so I'm just going to plow through my thinking.

### Rust Continues to Amaze Me

Rust and Lambda still continue to blow me away. The code comes out so clean and it's defect free. I know in spots it might look verbose, but by correctly handling `Result` and `Option`, my code is readable and doesn't fail under bad scenarios. I feel like a year into this journey, I'm starting to feel better about my ability to pull things like this together.

### Momento

I've said quite a bit about Momento throughout this article. But here's my top 3 things I love about it working with it.

1.  Developer experience. The SDK feels lightweight, yet powerful. They make solid use of the builder pattern. Things are in the right place. I do wish they would add some feature flags so that I could remove the control plane APIs from the data plane APIs but I'm nitpicking there.
2.  They have focused so heavily on the performance and it shows. The best case and worst case scenarios are so close in duration. And then just the overall numbers I see blow me away.
3.  Serverless for the win! Pay as I go? Yes please. This allows me to cache early and not late when things start to hurt. I can leverage my tooling here to delight my customers from day 1. Not on day "it hurts"

### DSQL

I'm so excited for DSQL to go GA and get the opportunity to use it in production. I've said before, we took NoSQL too far in Serverless because we had to. I see a future where I can build more with SQL in the future because I miss it. My takeaways are this.

1.  Performance is a little spikey but they settle in the upper single digit and 10ms. I'm 100% good with that. It doesn't have to be DynamoDB fast. And I surely don't expect it to be Momento fast. I'd like to see things smooth a little over time too. But for my second pass through, I'm very impressed and encouraged.
2.  No leaky DSQL code in my code. I'm SO glad that AWS leaned into this just being SQL and let me use the tooling and libraries I'm used to when working with SQL. I don't personally like working with Data APIs. I just want to query with SQLx and move on. They delivered on this and again, Developer Experience is so important!
3.  The same as #3 in the Momento category. From what I can tell, this is going to be a Serverless offering. So many new use cases are going to be unlocked and design patterns around the constraints that serverless brings makes me happy. I've been hoping for this for quite some time.

### Affects on Cost

I keep going back to this. Serverless compute has a cost component wrapped around your execution. I believe that by adding a cache to prevent reads against a SQL database is super useful. Now if I was having to query against an always own Redis cluster in ElastiCache, I might feel different. But with Momento, I only pay for what I use so I get the best of cost and the best for my users. More developers should be looking into read aside and write through caching options by taking advantage of this approach.

And I can't underscore enough, if you stack this up against one of the more common languages that Lambda functions are built with, Rust will yield you the best bang for your buck. It's going to outperform TypeScript, Python, Dotnet, Java, and even Go. And it generally won't be close.

### Observability

None of this analysis would have been possible without tracing. Sure, I could have used `println` and stamped out some log statements. But when building anything in the Cloud, I'm building observability into my code. OpenTelemetry makes this easy and Datadog brings it together for me.

## Wrap Up

Thanks for sticking through this one. I know it was long, dense, and information packed but you made it!

The future is so bright when it comes to Serverless that I can't contain my enthusiasm. I hope that you've seen that DSQL is going to be able to play a big part of your designs going forward. It's the right level of abstraction and will be in some cases an easy swap from what you are doing.

And even though it's amazing, pairing it with Momento can turbocharge your users experiences. It's a game changer when building in the cloud.

As always, here's the [Github repository](https://github.com/benbpyle/dsql-part-2) for this article. Clone it, use it, and if you find issues, create a PR.

Thanks for reading and happy building!
