---
title: "AWS DSQL Tutorial: Serverless SQL Database with Lambda and Rust"
author: "Benjamen Pyle"
description: Serverless developers that use Lambda as their compute of choice have long had to make a trade-off in AWS when it comes to storing their application data. Do I use a purely serverless database in Dyna
pubDatetime: 2024-12-07T00:00:00Z
tags:
  - aws
  - cdk
  - datadog
  - observability
  - programming
  - rust
  - serverless
draft: false
---

Serverless developers that use Lambda as their compute of choice have long had to make a trade-off in AWS when it comes to storing their application data. Do I use a purely serverless database in DynamoDB that doesn't require any special networking or infrastructure provisioning? Or do I choose to run a dedicated and not serverless database in RDS and incur the additional cost and be forced to attach my Lambda Function to a VPC so that I can leverage [AWS RDS Proxy](https://aws.amazon.com/rds/proxy/). For disclosure, I love DynamoDB and generally reach for it over an RDS solution because I'll take its serverless properties and its limitations around things like reporting and broader searching over sticking to tried and true SQL. However, my opinion is that [serverless developers](https://binaryheap.com/reporting-with-serverless/) reach too often for DynamoDB and would be better suited using RDS or a SQL-based system to service their application data.

But maybe that choice doesn't have to be made going forward. With the release of [AWS Aurora Distributed SQL](https://aws.amazon.com/rds/aurora/dsql/) at re:Invent 2024, developers can take advantage of a SQL-based system AND enjoy the benefits of a serverless database while also no longer requiring the Lambda Function to be attached to a VPC to leverage RDS Proxy.

Let's take a look at how this comes together with an AWS DSQL Tutorial!

-   [AWS DSQL Tutorial](#aws-dsql)
-   [DSQL Rust and Lambda](#dsql-rust-and-lambda)
    -   [CDK Rust Function](#cdk-rust-function)
    -   [Creating the DSQL Instance](#creating-the-dsql-instance)
    -   [Rust Code](#rust-code)
    -   [SQLx Aside](#sq-lx-aside)
-   [Exercising DSQL and Lambda](#exercising-dsql-and-lambda)
    -   [OpenTelemetry Rust Setup](#open-telemetry-rust-setup)
    -   [Tracing Execution](#tracing-execution)
    -   [DSL Performance](#dsl-performance)
        -   [Cold Start Latency](#cold-start-latency)
        -   [Insert Latency](#insert-latency)
            -   [Flame](#flame)
            -   [Waterfall](#waterfall)
            -   [Overall Latency](#overal-latency)
            -   [Thoughts on Insert Latency](#thoughts-on-insert-latency)
        -   [Select Latency](#select-latency)
            -   [Flame](#flame-1)
            -   [Waterfall](#waterfall-2)
            -   [Overall](#overall)
            -   [Thoughts on Insert Latency](#thoughts-on-insert-latency-3)
-   [Impressions and Thoughts](#impressions-and-thoughts)
    -   [The Nice List](#the-nice-list)
    -   [The Naughty List](#the-naughty-list)
-   [Wrapping Up](#wrapping-up)

## AWS DSQL Tutorial

AWS Distributed SQL (DSQL) is a very recent launch that occurred at re:Invent 2024 rolling in a new option for [serverless developers](https://binaryheap.com/building-serverless-applications-with-aws-data/) to enjoy SQL with a purely serverless option. DSQL is described by AWS like this:

> Amazon Aurora DSQL is a serverless distributed SQL database with virtually unlimited scale, the highest availability, and zero [infrastructure management](https://binaryheap.com/golang-private-module-with-cdk-codebuild/). Aurora DSQL offers the fastest distributed SQL reads and writes and makes it effortless for you to scale to meet any workload demand without database sharding or instance upgrades. With its active-active [distributed architecture](https://binaryheap.com/aws-healthlake-export/), Aurora DSQL ensures strong data consistency designed for 99.99% single-Region and 99.999% multi-Region availability. Its serverless design eliminates the operational burden of patching, upgrades, and maintenance downtime. Aurora DSQL is [PostgreSQL-compatible](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility.html) and provides an easy-to-use developer experience. -- [AWS](https://aws.amazon.com/rds/aurora/dsql/)

And it further makes these claims about what DSQL promises to deliver for developers.

-   Virtually unlimited scale
-   [Build always available apps](https://binaryheap.com/building-serverless-applications-with-aws-api/)
-   No infrastructure to manage
-   Easy to use

The service is still in public preview, but I couldn't wait get my hands on it and measure developer experience, ease of use, and some performance.

> We went too far with NoSQL database usage in the serverless community and we did so because the tools didn't exist for us to leverage the broader covering features of traditional SQL in serverless builds.
> 
> [Benjamen Pyle](https://binaryheap.com/benjamen-pyle/)

## DSQL Rust and Lambda

I've written about [Rust and Lambda](https://binaryheap.com/serverless-rust-developer-experience/) extensively, so this article won't try and convince you that you should be doing all of your Lambda code in Rust. But if you are keeping score, I do like Rust for its

-   Developer experience
-   Aversion to bugs
-   Almost complete removal of exceptions
-   Package management
-   And oh, it's kinda fast

But enough of the Rust benefits, how am I pulling these three bits together and what did I do with them? Walking through a simple example, I have a Todo model that is stored and retrieved from a Todos table in DSQL. Then I've built two [Lambda Functions](https://binaryheap.com/opentelemet-rust-lambda-datadog/). One to handle POST (Insert) and one to handle GET (select). Outside of the DSQL instance (which is only ClickOps at this point), I'm provisioning via [CDK](https://binaryheap.com/intro-to-cdk/)

### CDK Rust Function

In order to track performance which I'll show later on, I'm using the [Datadog Lambda Extension](https://github.com/DataDog/datadog-lambda-extension) to collect my [OpenTelemetry](https://binaryheap.com/rust-and-opentelemetry-with-lambda-datadog/) Traces.

```typescript
const layer = LayerVersion.fromLayerVersionArn(
  this,
  'DatadogExtension',
  'arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension-ARM:67'
)

```

Next, I'm adding my Lambda Function and attaching new IAM permissions so that it can execute DSQL operations. Notice I'm granting `dsql:*` as this is a just a demo. I normally would be much more granular in what I'm assigning. And lastly, I'm using a FunctionURL to expose the Lambda over an HTTP Endpoint. Super simple and great for what I'm doing here.

```typescript
const insert = new RustFunction(this, 'InsertFunction', {
  architecture: Architecture.ARM_64,
  functionName: "dsql-insert",
  manifestPath: 'lambdas/insert',
  memorySize: 256,
  environment: {
    CLUSTER_ENDPOINT: process.env.CLUSTER_ENDPOINT!,
    DD_API_KEY: process.env.DD_API_KEY!,
    DD_SERVICE: 'dsql-insert',
    DD_SITE: process.env.DD_SITE!,
    RUST_LOG: 'info',
  },
  layers: [layer]
})

insert.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["dsql:*"],
  resources: ["*"]
}))

insert.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ["*"]
  }
})

```

### Creating the DSQL Instance

As I mentioned above, there isn't Cloudformation and thus CDK support for DSQL yet. Being in public preview, there's no doubt that this support will follow soon so I'm not worried at all right now about it. However, I do want to show that setting up an instance is amazingly simple.

From the Console, navigate to the Aurora DSQL section and click Create a New Cluster.

![Cluster Create](/images/new_endpoint-scaled.webp)

And with a Cluster created, I know have access to a host endpoint which I'll use to connect to in my Rust code.

![Cluster Configuration](/images/cluster-scaled.webp)

### Rust Code

There is so much choice when working with SQL databases. Do I leverage something simple that allows me to write my own SQL and execute it against the database? Do I choose to go with an Object Relational Mapper (ORM)? And further, do I choose to use an ORM that generates code on my behalf? It all depends on the level of abstraction I'm looking for.

I tend to default to as few as possible, which is why when working with SQL and Rust, I almost always reach for [SQLx](https://github.com/launchbadge/sqlx). Setting up SQLx with AWS DSQL requires using the v4 Signature signing of my credentials as fetched from my AWS configuration. I do this work in my `main` function so that I can reuse the Postgres Pool in my handler without having to establish this connection outside of the Cold Start initializing cycle. That setup is reflected in the below code.

```rust
let region = "us-east-1";
let cluster_endpoint = env::var("CLUSTER_ENDPOINT").expect("CLUSTER_ENDPOINT required");
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
```

With a connection established, working with SQLx, I'd never know that it was querying to DSQL. I'm simply taking a payload from the JSON body, converting it into a struct and persisting it in DSQL with parameter values that are bound to the query.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Todo {
    id: String,
    name: String,
    description: String,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<TodoCreate> for Todo {
    fn from(value: TodoCreate) -> Self {
        Todo {
            id: Uuid::new_v4().to_string(),
            description: value.description,
            name: value.name,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        }
    }
}

#[instrument(name = "Handler")]
async fn function_handler(
    pool: &Pool<Postgres>,
    event: Request,
) -> Result<Response<String>, Error> {
    let body = event.payload::<TodoCreate>()?;
    let mut return_body = json!("").to_string();
    let mut status_code = StatusCode::OK;

    match body {
        Some(v) => {
            let e: Todo = v.into();
            let query_span =
                tracing::info_span!("Save Todo");
            let result = sqlx::query("INSERT INTO Todos (id, name, description, created_at, update_at) VALUES ($1, $2, $3, $4, $5)")
                .bind(e.id.clone())
                .bind(e.name.clone())
                .bind(e.description.clone())
                .bind(e.created_at) 
                .bind(e.updated_at)
                .execute(pool)
                .instrument(query_span)
                .await;

            match result {
                Ok(_) => {
                    let o = e.clone();
                    info!("(Todo)={:?}", o);
                    return_body = serde_json::to_string(&o).unwrap();
                }
                Err(e) => {
                    tracing::error!("Error saving entity: {}", e);
                    status_code = StatusCode::BAD_REQUEST;
                    return_body = serde_json::to_string("Error saving entity").unwrap()
                }
            }
        }
        None => {
            status_code = StatusCode::BAD_REQUEST;
        }
    }

    let response = Response::builder()
        .status(status_code)
        .header("Content-Type", "application/json")
        .body(return_body)
        .map_err(Box::new)?;
    Ok(response)
}
```

### SQLx Aside

When using SQLx, it often helps to work with Macros that help to convert queries to structs in addition to checking the query against the schema I'm running. This can be done via a Cargo subcommand or it can be done live in the editor. Either way, it requires me to set a `DATABASE_URL` for SQLx to work with. I wasn't able to get the Postgres connection string with DSQL to work just right, so I ended up cloning my schema into a [local instance and running](https://binaryheap.com/take-local-k8s-for-a-spin/) it that way. What happens is, SQLx will create query files in a `.sqlx` director for its use. This is a small annoyance and might be on me, but I've heard of another developer having the same challenge, so I thought I'd call it out here.

That work can be seen here in the `Select` [Lambda Function](https://binaryheap.com/creating-an-async-integration-with-aws-step-functions-from-api-gateway-via-cdk/) code. Also note, I'm injecting a `span` into the `instrument` method so I can see how long the query portion of the handler is taking.

```rust
let query_span = tracing::info_span!("Query Todos");

let rows = sqlx::query_as!(
    Todo,
    r#"
    select id, name, description, created_at, updated_at from Todos limit 10;
    "#,
)
.fetch_all(pool)
.instrument(query_span)
.await;
```

## Exercising DSQL and Lambda

For measurement of how these pieces work together, I'm leaning on Postman to run some virtual users and then the Datadog Lambda Extension which ships my OpenTelemetry traces.

### OpenTelemetry Rust Setup

To highlight how this is setup, here's the code as part of my `main` function.

```rust
let tracer = opentelemetry_datadog::new_pipeline()
    .with_service_name("dsql-insert")
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

```

### Tracing Execution

At this point, I have a DSQL cluster, a couple of [Lambda Functions](https://binaryheap.com/testing-step-function-workflows-locally/), and Datadog ready to capture traces. Generating traffic them comes down to using a Postman Runner which in this case I simulated 30 users. An example of one of those POST requests looks like this.

```bash
curl --location 'https://<location>lambda-url.us-east-1.on.aws/' 
--header 'Content-Type: application/json' 
--data '{
    "name": "First",
    "description": "Some description"
}'
```

The result of this execution on the POST in Datadog shows fairly consistent latency patterns. The spikiness indicates those cold starts grabbing a new database connection.

![Latency](/images/insert_overall.webp)

To wrap up the execution review, I want to look at performance.

### DSL Performance

I first want to make this upfront statement. This service (DSQL) is in public preview. It's not GA and ready for live production traffic. I 100% believe that things will get better, faster, and cheaper as time goes on. So I'm not overly concerned with what I'm about to show you. But if I was comparing to working with DynamoDB, there is a clear winner in DDB if I was just going on performance.

#### Cold Start Latency

The initial thing I noticed is that the first connection from Lambda into DSQL can take up to 200 or 300 ms. That seem fairly comparable to building against other AWS services because I have to establish my credentials from the credential provider and initialize my SDKs. I need to do some more investigation about timing the actual connection initialization and break apart the AWS SDK bits to see exactly where the time is being spent. I don't think this is critical though at this point as 300ms is more than satisfactory for < 5% of executions that fall into cold starts.

#### Insert Latency

When it comes to just running inserts, thanks to Datadog, I've got a waterfall, flame, and overall latency graph. Let's take a look at what those show.

##### Flame

![Flame Rust Lambda](/images/insert_flame.webp)

##### Waterfall

![Waterfall Rust Lambda](/images/insert_waterfall.webp)

##### Overall Latency

![Overall Insert](/images/insert_overall.webp)

##### Thoughts on Insert Latency

A few thoughts on this small sample.

-   The performance seems smooth at the p95 mark with spikes showing in the p99 subset. That's fairly normal from my experience when working with other AWS services.
-   Being that I didn't introduce into jitter into the virtual users, early bursts in latency are just Lambda Functions spinning up to handle the 30 virtual users
-   The p95 on just saving the Todo was 19.8ms. That's over double what I normally see working with DynamoDB. Again, this is an early preview.

#### Select Latency

With inserts covered, what does it look like to run a GET operation? For the below data, I'm running the same query over and over. Pretend this is a grid listing Todos on a page.

```rust
let query_span = tracing::info_span!("Query Todos");
let mut return_body = json!("Error Fetching Rows").to_string();
let mut status_code = StatusCode::OK;
let rows = sqlx::query_as!(
    Todo,
    r#"
    select id, name, description, created_at, updated_at from Todos limit 10;
    "#,
)
.fetch_all(pool)
.instrument(query_span)
.await;

```

And to be fair, I'm going to show the same 3 graphs and give you some thoughts.

##### Flame

![Select Flame](/images/select_waterfall.webp)

##### Waterfall

![Selecte Waterfall](/images/select_flame.webp)

##### Overall

![Selecte Waterfall](/images/select_overall.webp)

##### Thoughts on Insert Latency

A few thoughts on this small sample. It boils down to me being suprised at the performance on these reads.

-   There are significant differences in the sample sizes. I honestly haven't seen performance like this in any other AWS service that I've worked with. Again, preview, but I'm **not** excited about this early on. I also need to do more digging.
-   Normally, I tend to see higher initial p99 latency to account for cold starts, but this operation performed the same way throughout the duration of the run. I need to do some more investigation in future articles on this.
-   The p95 on selecting the top 10 Todos was 193ms. That's a significant bump from what I'm used to seeing when working with DynamoDB

## Impressions and Thoughts

I've said this a few times in this article, but this is an early preview version and a very small sample size. So please take my thoughts and opinions with that disclosure in mind.

### The Nice List

First off, I'm very impressed with DSQL. If I could sum up the two things that excite me the most, they'd fall in these ways.

1.  The developer experience feels just like working with SQL. Now I understand this is a Postgres-compatible database, so it's not full Postgres. However, when working with libraries like SQLx which I've used with a traditional serverfull RDS, it worked just the same. At the library level. Binding query parameters, establishing a connection, working with serializing and deserializing structs. All felt the same. I mentioned about the query macro hack, but I won't hold this against DSQL at the moment. Overall, solid A for developer experience.
2.  Serverless experience was also top notch. We went too far with NoSQL database usage in the serverless community and we did so because the tools didn't exist for us to leverage the broader covering features of traditional SQL in serverless builds. It was a delight to not have to connect to a VPC, setup and RDS Proxy and all of those others I've had to do before when working with Lambda and RDS. So again, solid A here for serverless experience.

### The Naughty List

(This article was written post re:Invent which makes it the holiday season)

The below at this point to me can be chalked up to being an early preview as well as AWS pattern of shipping rock solid 60% complete features to gain customer feedback to drive more innovation. I'm not in the least surprised at the moment on any of the items on the below list (except read performance).

1.  There are a list of missing capabilities at the moment. This is Postgres-compliant, which covers a large area of what that engine does, but it's not 100%. Here are the known [limitations](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/known-issues.html).
2.  As with any cloud offering, there are quotas. I'm less concerned with the Cluster quotas as they can be configured. At this point, I'd be [paying attention](https://binaryheap.com/climbing-the-technology-ladder/) to the database limits as they aren't configurable. I'd need to compare to a standard Postgres instance to see how these shakeout, but they need to be designed around. [DynamoDB has the same type of limits](https://binaryheap.com/dynamodb-streams-eventbridge-pipes-multiple-items/). So again, not surprising. [The limits](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/CHAP_quotas.html)
3.  No support for foreign keys. Part of this is kind of comical to me. I've seen some up in arms comments about how could they release without this? Being that many of us rode the NoSQL wave for years, we abandoned foreign keys for code defined schemas (with some exceptions). So to be shocked that a relational system launched without. I personally am not bothered by it because I don't think people are reaching for DSQL if you are comparing it against SQL Server or Oracle. I also am probably not reaching for it if I'm [running containers](https://binaryheap.com/building-serverless-applications-with-aws-compute/). My head at the moment is this is a [perfect compliment](https://binaryheap.com/dynamodb-with-typesense/) to Lambda-based compute operations. But I might change my mind as more features come online.
4.  Performance. I can't leave without saying this. I need to dig more into why and if I can do things to improve. But if [performance doesn't improve](https://binaryheap.com/rust-and-lambda-performance/), especially on reads, this might not be a fit for how I want to build. I fully expect this to get better, but I need to call it out as the numbers and graphs above highlight it. **I am actively working with AWS though on this to see if I'm doing something interesting or if it's something that I stumbled upon. More to come!**

## Wrapping Up

For far too long, developers building applications with their compute running on serverless platforms like Lambda have had limited options for using SQL-based data storage. Especially if they wanted to run a pure serverless stack. Services like SQS, Kinesis, EventBridge, DynamoDB, and StepFunctions complimented Lambda nicely but it always felt a touch odd to not have serverless SQL. AWS has done something about that with the launch of Aurora DSQL.

I'm happy to see this gap addressed. I don't just [Believe in Serverless](https://binaryheap.com/does-serverless-still-matter/), I **know** that serverless works at low scale and at high scale. It really isn't debatable at this point. However it's not a silver bullet and I'm always evaluating before starting a new project if it's the right fit for the characteristics required in the final value. Having a pure serverless implementation of SQL gives me a new wrinkle in my architecture game that'll improve delivery. I'm sure of that. I'm just going to be waiting a little while to see how things improve on the performance front. I'm OK with the other limitations because with anyone cloud hosted, it has knobs that only turn so far. I give the ability to "Turn it up to an 11" when I go managed. And I'm 100% OK with that. Because the value I get in the 1 - 10 range is usually overwhelmingly worth it.

If you were following along with the code, [here is the Github Repository](https://github.com/benbpyle/dsql-rust-first-look)

I hope you've enjoyed this early view into using DSQL with Rust and Lambda. I'll be doing more dives in this area as the new year rolls in. So stay tuned!

Thanks for reading and happy building!
