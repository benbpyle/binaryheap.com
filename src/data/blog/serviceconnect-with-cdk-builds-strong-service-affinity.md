---
title: ServiceConnect with CDK builds Strong Service Affinity
author: "Benjamen Pyle"
description: "Containers are a fantastic way to package up your application code and its dependencies. I'm on the record as a huge fan and probably write more production code in containers than I do with Lambda Fun"
pubDatetime: 2024-07-07T00:00:00Z
tags:
  - aws
  - cdk
  - datadog
  - ecs
  - observability
  - serverless
draft: false
---

Containers are a fantastic way to package up your application code and its dependencies. I'm on the record as a huge fan and probably write more production code in containers than I do with Lambda Functions. Call me crazy, but I like frameworks like Axum and ActiveX in Rust. When I'm connecting APIs over either HTTP or gRPC, I generally reach for AWS Elastic Container Service (ECS). I enjoy working with k8s and the plethora of open source tools, but ECS just makes things so simple, highly available, and with the announcement of ServiceConnect in 2022, more connected. In this article, I'm going to explore ServiceConnect with CDK.

## Why ServiceConnect

When working with connected Microservices, there is often a great deal of networking that goes into connecting pieces. Traditionally, this happens with an Application or Network Load Balancer that manages targets, health, and routes. In a simple setup, this might be one load balancer, but in a more complex there could be 10s of these or more. It forces your application code to be more aware of the network topology and how to find the services that it needs to communicate with.

On top of the networking, there are behaviors that some services do well and others might ignore. I'd call these being a good neighbor. A good neighbor in the neighborhood should exhibit these neighborly characteristics.

1.  Make itself available over a friendly name
2.  Abstract itself from the networking topology
3.  Allow for secure communication over TLS including restricting who can talk to them
4.  Handle graceful retries
5.  Shed load so that bad upstream neighbors don't make things bad for the whole neighborhood

These are just a few of the abilities that can be addressed with a Service Mesh that offers Service Discovery. The industry added this capability a few years ago when it saw the rise of 100s and 1000s of coordinating Microservices operating at scale. Being a good neighbor gets applied at the infrastructure level almost like being a good neighbor in real life. Imagine if you were able to install higher capacity electrical or plumbing capabilities in your house. Your gains could come at the detriment of your neighbors. The same applies to API neighbors.

> As on the ground microservice practitioners quickly realize, the majority of operational problems that arise when moving to a distributed architecture are ultimately grounded in two areas: networking and observability. It is simply an orders of magnitude larger problem to network and debug a set of intertwined distributed services versus a single monolithic application. - Envoy

## ServiceConnect with CDK

This project that I've been working on for a while has grown into multiple repositories, several services, and more than 3 CloudFormation stacks. What I want to walk through today is how to build a connected API with 3 services that talk over a proxy with ServiceConnect and are built with CDK.

![ServiceConnect with CDK](/images/service_connect.png)

## The Project

I mentioned above that this project spans multiple repos and parts, so let's dive in and talk through how it comes together. When I'm done, I'll execute a `GET` on an endpoint that'll yield the below response. That response will be brought together by 3 services. Service-A, Service-B, and Service-C.

```json
{
    "key_one": "(Hello)Field 1",
    "key_two": "(Hello)Field 2",
    "key_time": "2024-07-07T02:44:59.984673361Z"
}
```

### BaseInfra, Service-A, Service-B, Service-C

My project has 4 stacks that I've separated into 4 separate CDK projects. Service-A and Service-C are very similar but I opted to repeat code instead of trying to be too clever. There's a lesson in there somewhere, but I'll save that for another day.

The image below shows what I'm talking about a little better.

![File Structure](/images/1_project_structure.png)

There's a lot of CDK going on in this ServiceConnect example.

### BaseInfra

The BaseInfra project establishes exactly what it sounds like. BaseInfra. It will build the following components.

1.  A VPC with Public, Private, and Isolated Subnets
2.  An ECS Cluster for my services
3.  The Namespace for that cluster to register my services into

```typescript
export class InfraStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // build the base VPC
    const vpcConstruct = new VpcConstruct(this, 'VpcConstruct');

    // create a new Application Load Balancer
    new LoadBalancerConstruct(
      this,
      'LoadBalancerConstruct',
      {
        vpc: vpcConstruct.vpc
      }
    );

    // Build the ECS Cluster to hold the services
    new EcsClusterConstruct(this, 'EcsClusterConstruct', {
      vpc: vpcConstruct.vpc,
    });
  }
}
```

**VPC**

![](/images/vpc_resource_map-1024x471.png)

### Service-A and Service-C

ServiceConnect offers the option to run services in what it describes as client and client/server mode. Essentially what this boils down to is whether a service will only send requests or if it will send AND receive requests. For my use case, I'm opting to put all of the services in the client/server for simplicity.

What will happen from there is a few things.

1.  A Proxy will be installed next to your ECS Task. Under the hood, it's built on [Envoy](https://www.envoyproxy.io/)
2.  A CloudMap resource will be established for the service and the instances will be registered. The proxy will handle keeping its local registry up to date
3.  The service will gain a simple name that is resolvable and be attached to a port. Requesting the service is as simple as using the ServiceConnect address.

**_Service-C_**

![](/images/service_connect_configuration-1024x207.png)

**_Discoverable Services_**

![](/images/namespace_list-1024x239.png)

#### Service-A Code

Let's dive in a bit on the TaskDefinition and the ServiceConnect pieces of building a FargateService.

I mentioned that a proxy sidecar is installed next to your application code. Is that something that I need to do or does ServiceConnect with CDK take care of that for me? The answer is, AWS does that on my behalf. Here are the two blocks of code that build my ECS Task and there is no mention of a proxy. I don't configure ServiceConnect with CDK here.

```typescript
// task definition
this._taskDefinition = new TaskDefinition(scope, `${props.service.serviceName}-TaskDefinition`, {
    cpu: '1024',
    memoryMiB: '2048',
    compatibility: Compatibility.FARGATE,
    runtimePlatform: {
    cpuArchitecture: CpuArchitecture.ARM64,
    operatingSystemFamily: OperatingSystemFamily.LINUX,
    },
    networkMode: NetworkMode.AWS_VPC,
    family: `${props.service.serviceName}-task`,
});

// add the container
const apiContainer = this._taskDefinition.addContainer('rust-api', {
    // Use an image from Amazon ECR
    image: ContainerImage.fromRegistry(
    `${service.ecrUri}:${service.imageTag}`
    ),
    logging: LogDrivers.awsLogs({ streamPrefix: service.serviceName }),
    environment: {
    BIND_ADDRESS: "0.0.0.0:3000",
    // uncomment this if you want to use DD tracing
    // AGENT_ADDRESS: "binaryheap.com",
    // set this to true if you want to use DD tracing
    DD_TRACING_ENABLED: "false",
    RUST_LOG: "info"
    },
    containerName: service.apiShortName,
    essential: true,
    cpu: 512,
    memoryReservationMiB: 1024,
});

apiContainer.addPortMappings({
    containerPort: 3000,
    appProtocol: AppProtocol.http,
    name: 'web',
    protocol: Protocol.TCP,
});
```

Again, no mention of the proxy. A quick aside, if you notice the mentions of tracing, the service code does have [Observability](https://binaryheap.com/building-serverless-applications-with-aws-observability/) included but is off by default. I'll be writing more about this in the coming weeks as I dive into more Datadog, OpenTelemetry, and Observability with Rust.

The FargateService definition is where ServiceConnect comes into play.

```typescript
new FargateService(
    scope,
    `Service-${props.service.serviceName}`,
    {
    cluster: props.sharedResources.cluster,
    taskDefinition: props.task,
    desiredCount: 1,
    serviceName: props.service.serviceName,
    securityGroups: [securityGroup],
    serviceConnectConfiguration: {
        logDriver: LogDrivers.awsLogs({
        streamPrefix: props.service.serviceName
        }),
        namespace: 'highlands.local',
        services: [
        {
            portMappingName: 'web',
            dnsName: props.service.apiShortName,
            port: 8080,
            discoveryName: props.service.apiShortName,
            // timeout requests at 10 seconds
            perRequestTimeout: Duration.seconds(10)
        },
        ],
    },
    }
);
```

If you've worked with CDK and ECS before, this probably looks familiar. But if not, CDK offers many convenience classes that help with the type of service that I want to build. Anything from the above FargateService, EC2Service, and even Application Load Balanced Services. My ServiceConnect configuration is just a type on the FargateService. Let's break down what I'm doing here.

1.  Establishing a log driver and where the logs will be delivered
2.  A namespace for the service registers into
3.  A port mapping that goes along with the DNS name will yield `protocol://<name>:port`
4.  The per-request timeout lets me set up a time when I want the proxy to let the connection go. Think about this, if I have a bad neighbor, it occupies threads on the server that will ultimately bind up or cause scaling. By setting timeouts, I can give the server ample time to respond but if something isn't quite right, it releases.

And that's it. I have now registered a service with ServiceConnect and CDK. I'm not going to dig into Service-C because it looks just like Service-A does.

### Service-B

At the heart of this example is Service-B. This is the service that is connected to the Application Load Balancer and uses the CloudMap registry to connect to Service-A and Service-C. ServiceConnect with CDK makes its registration easy just like the other two services so I'm not going to focus on the ServiceConnect pieces. What I do want to do though is look quickly at the HTTP request code and then how I bring them together.

```rust
let service_a_host: String = std::env::var("SERVICE_A_URL").expect("SERVICE_A_URL Must be Set");
// code ommitted for brevity
let url = format!("{}/route?p={}", service_a_host, prefix);
let response = client.get(url.as_str()).headers(headers).send().await;
match response {
    Ok(r) => {
        if r.status().is_success() {
            let j: Result<ServiceAModel, Error> = r.json().await;
            match j {
                Ok(m) => Ok(m),
                Err(e) => {
                    tracing::error!("Error parsing: {}", e);
                    Err(StatusCode::BAD_REQUEST)
                }
            }
        } else {
            tracing::error!("Bad request={:?}", r.status());
            Err(StatusCode::BAD_REQUEST)
        }
    }
    Err(e) => {
        tracing::error!("Error requesting: {}", e);
        Err(StatusCode::INTERNAL_SERVER_ERROR)
    }
}
```

What matters in this code is that the `SERVICE_A_URL` is injected into the application via an environment variable. Without ServiceConnect, this might be a CNAME or A RECORD pointing at a load balancer or auto-scaling group of nginx. But this, in this case, it'll be the ServiceConnect endpoint. For Service-A, that'll be `http://service-a:8080` as defined in the Service-A ECS FargateService code above.

And when I bring that together with CDK, Service-B's TaskDefinition will look like the following. Note how I'm able to reference the services by the discoverable name. And then behind that is CloudMap keeping track of the instance IP addresses associated with them. Pretty neat.

```typescript
addApiContainer = (service: EcsService) => {
// api container
const apiContainer = this._taskDefinition.addContainer('rust-api', {
    // Use an image from Amazon ECR
    image: ContainerImage.fromRegistry(
    `${service.ecrUri}:${service.imageTag}`
    ),
    logging: LogDrivers.awsLogs({ streamPrefix: service.serviceName }),
    environment: {
    BIND_ADDRESS: "0.0.0.0:3000",
    // uncomment this if you want to use DD tracing
    // AGENT_ADDRESS: "binaryheap.com",
    // set this to true if you want to use DD tracing
    DD_TRACING_ENABLED: "false",
    RUST_LOG: "info",
    SERVICE_A_URL: "http://service-a:8080",
    SERVICE_C_URL: "http://service-c:8081"
    },
    containerName: service.apiShortName,
    essential: true,
    cpu: 512,
    memoryReservationMiB: 1024,
});
```

## Testing the Connectivity between Services

With ServiceConnect and CDK, you can see how easy it is to add advanced service mesh capabilities to any of your ECS services. I haven't said it up to this point, but ServiceConnect is only available for services deployed in ECS. This does include EC2 and Fargate deployment models, but if you have more variety in your compute, you might need to look at including VPC Lattice (something I also need to write more about).

**Coming Together**  

![](/images/connectivity-1024x156.png)

And that's it! 3 services deployed with AWS CDK using ECS with ServiceConnect to deliver a simple, yet powerful service mesh experience.

## Observability

I want to wrap up the article with this. One of the benefits of using a service mesh is the observability gained between the services. Oftentimes, developers and DevOps are unaware of the true requirements and dependencies from service to service. It can also be hard to pinpoint latency and failure when running through single or multiple load balancers. With ServiceConnect, I'm able to see what my service talks to, the latency between each service, and then a few other useful things to keep track of. Sure, I do this with Application Performance Monitoring as well, but having them right at hand when working with ECS is nice.

**_ServiceConnect Outgoing Traffic_**

![](/images/traffice-1024x667.png)

**_ServiceConnect Connections_**

![](/images/active_connections-1-1024x494.png)

## Wrapping Up

Microservices and containers bring so much power to a builder's toolkit when putting together systems for users. Sometimes these systems have interdependencies that are required and can lead to unintended negative consequences. Service Mesh technologies came out of the need to add observability, service discovery, and simplified networking with additional application-level controls. However, those tools are mostly designed to work with k8s and tend to be complex in setup. If you are running ECS (which I'd recommend most do), how can you benefit from these same capabilities? Enter ECS ServiceConnect which is built upon the popular Service Mesh Envoy.

ECS workloads with ServiceConnect enable so much power in such a simple and easy-to-configure package. The code that I walked through in this article can be found [in this repository](https://github.com/benbpyle/ecs-service-connect). Additionally, if you work through the Docker images that are in my public ECR repository, that code can be [found here](https://github.com/benbpyle/rust-connected-services-reference). As simple as ServiceConnect with CDK is, I almost describe it as the default for me at this point. With a few lines of configuration code, I gain so many features that I ask the question, why aren't you using ServiceConnect?

Thanks for reading and happy building!
