---
title: Web API with Rust and Fargate
author: "Benjamen Pyle"
description: "I've been spending more and more time with Rust which is perfectly in line with my end-of-year planning. So far, my collection of articles is growing and so are my Rust skills. I can't profess to be m"
pubDatetime: 2023-12-21T00:00:00Z
tags:
  - aws
  - rust
  - serverless
draft: false
---

I've been spending more and more time with Rust which is perfectly in line with my end-of-year planning. So far, my [collection](https://binaryheap.com/tag/rust/) of articles is growing and so are my Rust skills. I can't profess to be more than a novice at this point, but when has that stopped me from crafting something meaningful around a piece of technology? I hope you find this entry helpful and insightful as I dive into building a Web API with Rust and Fargate.

## Background

For those who've read my technical articles before, you are aware that I write a great deal about Serverless Architecture and Design. You are also probably aware that many of those articles that include Compute components often talk about Lambda and Functions. As I've spent some time reflecting recently, I realized that I haven't done enough work publically with AWS ECS and specifically Fargate. As I wrote in this [article](https://binaryheap.com/building-serverless-applications-with-aws-compute/) Serverless Compute is about more than just Lambda.

My intention in the below tutorial is to walk through the following concepts:

- Building Web API Route handlers utilizing Axum
- Modeling a Todo from ViewModels to the Domain
- Interacting with DynamoDB through a defined layer
- Running locally with Docker and DynamoDB Local
- Manually deploying in AWS ECS Fargate (no IaC at the moment)
- Executing requests with Postman

Fair warning, this will be one of the longer articles with more depth than I've done in a while so perhaps grab a beverage and a snack. Let's dive in!

## Architecture

For this example, I'm going to build a Web API with Rust and Fargate that provides the following endpoints.

```bash
# / - POST to create a Todo
# /:id GET to get a Todo by ID
# /:id PUT to update a Todo by ID
# /:id DELETE to delete a Todo by ID
```

The architecture when deployed in AWS will look like the image below. It will have a

- VPC with Public and Private Subnets
- An Application Load Balancer with a Target Group and a Rule to route to the Fargate Container
- A Farage Cluster
  - One Service
  - One Task deployed under the service
- DynamoDB table for storing the Todo items

![Web API with Rust and Fargate](/images/rust_web_api.png)

## Building a Web API with Rust and Fargate

### Axum

My experience so far with Rust has been that the ecosystem of available crates is actually quite nice. I've read comments that the language and the ecosystem are not mature enough for mainstream development. Those same comments focus on that if you need the speed and safety of a systems language, you resign yourself to not having the support around the edges that you have with other languages. So far, my experience hasn't landed me in that same opinion camp. I discovered [Axum](https://docs.rs/axum/latest/axum/) which defines itself like this.

> axum is a web application framework that focuses on ergonomics and modularity. - axum

By leveraging a Web Framework, I pick up some benefits around path routing and request/response management. In addition, I can migrate this code as is over into a Lambda should I want to do that at a later date. Something I'll explore in a future article.

### Rust Initialization

Building a Web API with Rust and Fargate requires some initialization that needs to happen before I can start building and handling requests. Going back to the architecture diagram, there needs to be a DynamoDB client established. Since the client requires loading credentials from the credential chain, it is better to do this process once vs performing that operation on every request to DynamoDB.

For more information on the [AWS Rust SDK](https://aws.amazon.com/sdk-for-rust/) head on over to the documentation. You'll find sample code and documentation around the various services supported.

Configuring DynamoDB requires establishing a client that is powered by the credentials for the given region or profile being used. Additionally, there are a few environment variables that I'm setting up below.

- USE_LOCAL: The purpose of this is to tell the init function that the code is running locally and to configure the additional settings for the DDB Client. Specifically adjustment the Endpoint URL.
- TABLE_NAME: Required value to be set. This is the table name of the DDB table
- DDB_HOST: Only required IF USE_LOCAL is set. Allows for overriding the endpoint when running locally.

```rust
let use_local = &std::env::var("USE_LOCAL");
let region_provider = RegionProviderChain::default_provider().or_else("us-west-2");
let config = aws_config::from_env().region(region_provider).load().await;
let db_config = aws_sdk_dynamodb::config::Builder::from(&config).build();
let mut dynamodb_client: Client = Client::from_conf(db_config);
let table_name = std::env::var("TABLE_NAME").expect("TABLE_NAME must be set");

// Supports local mode for connecting to DynamoDB
if use_local.is_ok() {
    let host = std::env::var("DDB_HOST").expect("DDB_HOST must be set");

    let dynamodb_local_config = aws_sdk_dynamodb::config::Builder::from(&config)
        .endpoint_url(host)
        .region(Region::from_static("us-east-1"))
        .build();
    dynamodb_client = Client::from_conf(dynamodb_local_config);
}
```

### Web API AppState

Dependency management at runtime is something that every web framework and honestly testable code deals with. There are many ways to accomplish this, but in my example, I'm using Axum's `State` struct. My custom state will allow me to inject my `TodoService` which I'll talk about later into my routes.

```rust
let shared_state = AppState {
    todo_service: TodoService::new(dynamodb_client, table_name.to_string()),
};
```

### Route Definition

When building a Web API with Rust and Fargate, routes are central. Defining routes establishes the API and the contracts that your service provides.

Routes are defined with Axum and require handler functions that I'll show in a bit. For now, these get configured as part of the initialization of the API.

Take a quick look at the additional route for `/health`. That one will come in handy when the Application Load Balancer requests checks to verify if the container is healthy when running in ECS.

```rust
fn app(app_state: AppState) -> Router {
    Router::new()
        .route("/", post(create_todo))
        .route(
            "/:id",
            get(find_todo_by_id)
                .put(update_todo_by_id)
                .delete(delete_todo_by_id),
        )
        .route("/health", get(health))
        .with_state(app_state)
        .fallback(handler_404)
}
```

### Models and Structs

Applications have state. That state and how it interacts with the other parts of the system is usually expressed in the generic term Models or more specifically Domain Models. In a Web API, including those built in Rust, there are usually View Models or Data Transfer Objects mixed in as well so as not to expose any underlying structures to the client.

A Web API with Rust and Fargate is no different. I've got 5 basic models that matter in this Todo Application.

- Todo - The primary domain model
- TodoView - The view representation of the Todo domain model
- TodoDeleteView - View returned when a Delete is successful
- TodoCreate - The input model for creating a new Todo
- TodoUpdate - The input model for updating an existing Todo

Notice that they all have references to Macros such as Serialize, Debug and Deserialize. Gives me some generated benefits of having JSON and DynamoDB serde and deserde taking care of. Additionally, the Debug macro helps with printing the values when logging and tracing.

```rust
#[derive(Serialize, Deserialize, Debug)]
pub struct Todo {
    pub id: String,
    pub todo_id: String,
    pub description: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TodoView {
    pub todo_id: String,
    pub description: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TodoDeleteView {
    pub todo_id: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TodoCreate {
    pub description: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TodoUpdate {
    pub description: String,
}
```

### Interacting with DynamoDB

A Rust Web API without a database would be pretty limited in its use. I want to store these Todo items in another Serverless component and DynamoDB is what I reach for more often than not. By leveraging the AWS Rust SDK, these operations are straightforward and made possible through a developer-friendly builder pattern API.

To support the operations defined in the Web API, I've built a Services Layer that handles working with the operations needed in DynamoDB. I won't walk through each of them because the code for this article can be found in this [GitHub Repository](https://github.com/benbpyle/rust-axum-todo). However, I do want to highlight one of them if you are just looking at this piece to pick up a snippet of usable DynamoDB SDK Code.

The main parts to look at are how simple it is to encapsulate the DDB requests in a service layer and the simplicity of building the request up with the SDK. Additionally, which you can see in the full code base, I'm transforming DynamoDB SDK Errors and misses into a custom Enum called DbError. I use that enum to provide custom messages back to the API Client.

And finally, the `from_item` function makes use of the DynamoDB serde library for deserializing the DynamoDB JSON into my custom Todo Struct.

```rust
#[derive(Clone)]
pub struct TodoService {
    client: Client,
    table_name: String,
}

impl TodoService {
    // creates a new instance of the TodoService
    pub fn new(client: Client, table_name: String) -> TodoService {
        TodoService { client, table_name }
    }

    pub async fn find_todo_by_id(&self, id: &String) -> Result<Todo, DbError> {
        let n = std::format!("ID#{}", id);
        let result = self
            .client
            .get_item()
            .key("id".to_string(), AttributeValue::S(n.to_string()))
            .table_name(&self.table_name)
            .send()
            .await?;

        match result.item {
            None => Err(DbError::NotFound),
            Some(item) => {
                let i: Todo = from_item(item)?;
                Ok(i)
            }
        }
    }
}
```

## Packaging the Web API in Docker

### The Dockerfile

Step 2 of building a Web API with Rust and Fargate requires a Docker image. One of the trade-offs that you make as a Rust programmer is with the compiler. The compiler is an engineering feat in and of itself as it provides so many tasks necessary to guarantee runtime and memory safety. However, those guarantees usually come at the cost of build speed. In my local building and packaging, it can take upwards of 300 seconds to build this sample repository into a Docker image.

To improve that experience, I did some digging into using multiple layers and steps to isolate things like dependencies that don't change much and allowing the bulk of my rebuilds to just be on source code changes. I'm by no means a Docker expert and even much less of a Docker and Rust expert, but what I've done below gives me the following:

- 250 - 300 second initial first builds
- < 100 second subsequent builds
- An image stored in AWS Elastic Container Registry that comes in around 43MB.

I have much more to learn and there are surely more optimizations to be found but this is where I am right now.

```dockerfile
ARG RUST_VERSION=1.74.1

#FROM rust:${RUST_VERSION}-slim-bookworm AS builder
FROM rust:slim-buster AS builder

RUN USER=root cargo new --bin web-app
WORKDIR ./web-app
COPY ./Cargo.toml ./Cargo.toml
RUN cargo build --release
RUN rm src/*.rs

ADD . ./

RUN rm ./target/release/deps/sandbox*
RUN cargo build --release

FROM debian:buster-slim
ARG APP=/usr/src/app

RUN apt-get update
    && apt-get install -y ca-certificates tzdata
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8000

ENV TZ=Etc/UTC
    APP_USER=appuser

RUN groupadd $APP_USER
    && useradd -g $APP_USER $APP_USER
    && mkdir -p ${APP}

COPY --from=builder /web-app/target/release/sandbox ${APP}/web-app

RUN chown -R $APP_USER:$APP_USER ${APP}

USER $APP_USER
WORKDIR ${APP}

CMD ["./web-app"]=
```

### Running Locally with Docker Compose

Running in the Cloud is great. And developing against the cloud from a local IDE is also really great. But sometimes you want to be able to have a local cycle that enables quicker feedback. My personal experience is that with Lambda, deploying to AWS and running there is super fast. However, when it comes to containers, deploying to Fargate requires replacing a task, waiting for the ALB to identify that task as healthy and then draining the existing tasks. This might take 5 - 10 minutes depending upon so many factors. I'm not comfortable with that process especially if I've got a defect in my packaging or the code itself.

For these reasons, I've added a `docker-compose.yml` so that you can experiment with this locally before deciding to migrate it up to the cloud with Step 3 of this article.

```yaml
version: "3.8"
services:
  dynamodb-local:
    command: "-jar DynamoDBLocal.jar -sharedDb -dbPath ./data"
    image: "amazon/dynamodb-local:latest"
    container_name: dynamodb-local
    ports:
      - "8000:8000"
    volumes:
      - "./docker/dynamodb:/home/dynamodblocal/data"
    working_dir: /home/dynamodblocal
  application:
    depends_on:
      - dynamodb-local
    build:
      context: .
      dockerfile: Dockerfile
    container_name: application
    ports:
      - "8080:8080"
    environment:
      AWS_ACCESS_KEY_ID: "DUMMYIDEXAMPLE"
      AWS_SECRET_ACCESS_KEY: "DUMMYEXAMPLEKEY"
      USE_LOCAL: TRUE
      TABLE_NAME: Todo
      DDB_HOST: http://host.docker.internal:8000
```

Now running the DynamoDB container and the Rust Web API locally is as simple as doing these two things.

```
docker-compose up -d
cd scripts
scripts/create_table.sh
```

![Docker Compose Up](/images/docker-compose.png)  
The create table script only needs to be run once and you'll have a fully working local version of your API along with a DynamoDB instance sitting right next to it.

Once all that is functional, a quick cURL to the POST endpoint should yield a new Todo item.

![POST Success](/images/1_curl.png)

### Preparing for Deployment

Now for the fun part. The Web API is coded in Rust, Dockerized and is now ready for Fargate. But wait, one more thing. I need to upload the container into ECR (Elastic Container Registry) so that my ECS Fargate Task can source the image.

The following commands will get the image ready, perform a login to ECR and then push the image up to the AWS Cloud. The `test-images` reference is a repository I have already created in ECR.

```bash
docker build -t axum-demo .

docker tag axum-demo:latest <your account id>.dkr.ecr.<your region>.amazonaws.com/test-images:latest

aws ecr get-login-password --region <your region> | docker login --username AWS --password-stdin <your account id>.dkr.ecr.<your region>.amazonaws.com/test-images

docker push <your account id>.dkr.ecr.<your region>.amazonaws.com/test-images:latest
```

There's now an image in the cloud ready to be consumed by Fargate.

## Deploying to Fargate

We've now reached the Fargate component of building a Web API in Rust. If you've been following along for a while, you know that I almost always include IaC (Infrastructure as Code) in my examples. Due to the concepts and the detail in this article, I didn't want to also include the depth of the inner workings of say CDK with everything else. I will put out something with CDK at some point soon around this topic, but I wanted to focus on the build in Rust and not necessarily the code to deploy.

Warning up front, there will be heavy screenshot utilization below but at the end, you will be able to hit the exposed Application Load Balancer from Postman or cURL.

Going back to the initial architecture diagram and the outlined deployed items, let's start with the VPC and networking.

### VPC and Networking Setup

Anyone who knows me beyond the internet knows that my experience doesn't lie in networking. I've never devoted enough time to get any good at it. Luckily, creating a VPC with 2 public and 2 private subnets is a snap in the AWS Console. The goal here is to have a VPC with a Public Subnet that the Load Balancer can sit in and be accessible from the internet. Then have the Fargate container running in a Private Subnet with traffic routed to it via the Load balancer. This design will keep the internals of the container hidden with only the allowed traffic patterns that I specify on the Load Balancer routes to the target groups.

![VPC](/images/vpc_init.png)

### Cluster, Service and Task

To deploy the Web API built in Rust on Fargate, I need to build 3 things.

1.  An ECS Cluster
2.  A Fargate Task to launch the container
3.  An ECS Service to run the Task and receive the Load Balancer Traffic

#### Cluster Definition

Defining the Cluster is simple.

![Cluster Definition](/images/create_cluster.png)

Once the cluster is set up, I can now go and build the Task Definition.

#### Task Definition

Think of a Fargate Task Definition as a collection of things. I need to define the Docker Image, the Environment variables, the parameters for compute and memory and other details like logging.

First the task details.

![Task Definition](/images/create_task.png)

Then build the infrastructure requirements.

![Infrastructure Requirements](/images/task_infrastructure.png)

Pay attention to the Task Role. This is where you will grant permissions to other AWS resources that the task will need access to. I've included an image below that highlights what needs to exist for the API code to query DynamoDB.

![IAM Permissions](/images/service_iam-1.png)

And finally the container definition. This is where I pulled from the ECR image I pushed a few steps above. It's also where I can do Docker-type things like set commands, environment variables and other options.

![Docker/Container](/images/task_container-1.png)

#### Service Definition

The last piece of the ECS puzzle is to define the Service that runs in the Cluster and responds to the Load Balancer's traffic.

The Service Environment.

![Service Environment](/images/service_environment.png)

Service Deployment Configuration.

![Service Deployment](/images/service_deployment.png)

Service Load Balancer.

![Service Load Balancer](/images/service_load_balancing.png)

### Load Balancer Tweaks

Wrapping this all up, I need to tweak the Load Balancer and the Security Group attached to the Target group. When the ECS Service creates the LB, it doesn't put it in the public subnet. If I navigate to the LB that was created, I can make those adjustments and I should see my Load Balancer in the correct spot now.

![Load balancer](/images/lb_settings.png)

The second thing I needed to do was update the Security Group. Make sure to allow traffic over port 80 from all outbound IPs so that it can be forwarded to the service which then routes to the container.

![Security Group](/images/security_group.png)

## Tying it All Together

I've been working on this concept for a little over a month at this point. Most of my articles and projects are within a few hours. [I've described my process](https://binaryheap.com/writing-a-technical-blog-article/) in good detail before. But this article included learning a great deal about Rust and how to tie my Docker and Fargate experience together to build a Sample Web API.

### Key Takeaways

Here's what I'd tell you going forward if I've convinced you to dip a toe into this ecosystem.

1.  Rust isn't for everyone. I've never embarked on learning a language like this before. Memory allocation and a skinnier standard library in addition to long build times don't bother me. I learned C and C++ in the 90s. But the Rust borrow checker, lifetimes, scopes and some of the async bits still have me a little fooled. Dedicate some time to learning this.
2.  Performance improvements in CPU and Memory Utilization are real. Especially compared to some of the Runtime-based languages like .NET, Java and even more so in the interpreted ones. I found Rust to need much less memory and CPU with a small total container size to accomplish similar throughput. More on this in another article.
3.  For teams that have no experience or the time to get up to speed, Golang still feels like my best bang for the buck. It's not quite as performant in all areas or as resource friendly but it's not far off. And the language is way easier to learn and operate in addition to being read. I still think it's my goto when thinking about team development.
4.  I'm 100% going to do more Rust personally. It's almost like a rare Pokemon I want to collect. I'm yearning to learn more and I plan to.
5.  If you believe Sustainability is closely aligned with Cost, Rust is something you need to invest time in.

### Closing Thoughts

As I start to close this article out and point you back to the [GitHub Repository](https://github.com/benbpyle/rust-axum-todo), a slight labor of love feels like it's being lifted. I've put a lot of energy into diving deep into this topic because quite frankly I feel that there just isn't solid material out there for common AWS workloads coded in Rust. My commitment going into 2024 is that I help do a small part to improve that. Samples of working with SQS, SNS, DynamoDB, Kinesis and others will start to show up in Rust using the AWS SDK here on [Binaryheap](https://binaryheap.com). I hope that this has been as beneficial for you as it has for me.

## Wrapping Up

The future of application development with Rust and AWS seems very bright. I hope I've shown you a path to building a Web API with Rust that is ready for Fargate. There's a lot to digest in the ecosystem but there are smart folks in the community that can help you along the way. There is additionally some great written text and the online Rust book that do more than set you up well. The things I had to focus on most while building this article which I think would benefit you as well are:

- Learning Rust
- Understanding Crates
- Tokio, Axum and the AWS SDK
- Working with the Compiler
- VSCode vs others

If I can leave you with this. If you start learning, stick with it. I've been coding for a long time and it's taken me months to get this far. You might do it in weeks or it might take a year. Who cares. The point is the learning. Growth is the goal. Results are just a by-product of those two things.

Thanks for reading and happy building!
