---
title: Guaranteed Safety using Blue Green with ECS and CDK
author: "Benjamen Pyle"
description: "Buckle up for this one as it's going to be a lengthy piece. I love writing articles like this one because they contain complete infrastructure builds that highlight some best practices to put multiple"
pubDatetime: 2024-04-21T00:00:00Z
tags:
  - aws
  - cdk
  - infrastructure
  - programming
  - rust
  - serverless
  - typescript
draft: false
---

Buckle up for this one as it's going to be a lengthy piece. I love writing articles like this one because they contain complete infrastructure builds that highlight some best practices to put multiple components together and act as great starting points for people to use immediately. I've been working a great deal with containers lately and I kept finding it difficult to locate a working sample of building Blue Green with ECS and CDK. So I set out to put that together. Let's get started.

## Architecture

I've been running Blue Green with ECS in production for several years now and have been helping customers integrate the practices into their current environments. But I hadn't documented one from scratch to make Blue Gree with ECS and CDK a pattern. For reference, I took inspiration from [this article](https://aws.amazon.com/blogs/compute/architecting-for-scale-with-amazon-api-gateway-private-integrations/) which highlights the decision points that one needs to make when taking this approach in a purely native AWS manner.

What I was looking for with this code was this:

1.  Publically exposed over an API Gateway
2.  The load balancer supporting the services must be inaccessible from the public internet
3.  Deployed as ECS Fargate tasks
4.  Deployments managed by AWS' CodeDeploy
5.  Optionally the ECR repository could be behind a VPC Endpoint

With that criteria in mind, here's the architecture that we'll be working through for the rest of the article.

[![](/images/image-1024x579.jpeg)](/images/image.jpeg)

## Blue Green with ECS and CDK

Where do we get started on this epic build? Well, it's hard to have any resources deployed without a VPC, so that's where we will begin.

### Building the VPC

This VPC will be simple enough and possess the following attributes.

-   Subnets will be Public, Private with Egress and Isolated
-   Contain 2 availability zones
-   A VPC Endpoint to ECR in case you want to leverage this capability

```typescript
this._vpc = new Vpc(this, "CustomVpc", {
    subnetConfiguration: [
        {
            name: "custom-vpc-public-subnet",
            subnetType: SubnetType.PUBLIC,
            cidrMask: 24,
        },
        {
            name: "custom-vpc-private-subnet",
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
            cidrMask: 24,
        },
        {
            name: "custom-vpc-isolated-subnet",
            subnetType: SubnetType.PRIVATE_ISOLATED,
            cidrMask: 24,
        },
    ],
    maxAzs: 2,
    natGateways: 2,
    vpcName: "CustomVpc",
});

this._vpc.addInterfaceEndpoint("EcrEndpoint", {
    service: InterfaceVpcEndpointAwsService.ECR,
});
```

Once deployed, this will produce a resource map like the one below.

[![VPC Resource Map](/images/image-6.png)](/images/image-6.png)

### The ECS Cluster

Next up, I have to establish an ECS Cluster. AWS defines Elastic Container Service in this way.

> Amazon Elastic Container Service (ECS) is a fully managed container orchestration service that helps you to more efficiently deploy, manage, and scale containerized applications. It deeply integrates with the AWS environment to provide an easy-to-use solution for running container workloads in the cloud and on premises with advanced security features using Amazon ECS Anywhere. - AWS

By leveraging ECS, I can take advantage of another type of [serverless compute called Fargate](https://binaryheap.com/building-serverless-applications-with-aws-compute/).

The CDK code to establish the cluster sets a name and the VPC that was defined above.

```typescript
this._cluster = new Cluster(scope, 'EcsCluster', {
    clusterName: 'sample-cluster',
    vpc: props.vpc
})
```

### Load Balancing

When building Blue Green with ECS and CDK, a decision needs to be made about which type of Load Balancer is going to be used. Additionally, the load balancer type will influence the way that the VPC PrivateLink is configured. Before diving in, what is a PrivateLink?

> AWS PrivateLink provides private connectivity between virtual private clouds (VPCs), supported AWS services, and your on-premises networks without exposing your traffic to the public internet. Interface VPC endpoints, powered by PrivateLink, connect you to services hosted by AWS Partners and supported solutions available in AWS Marketplace. - AWS

#### PrivateLink Considerations

Choosing the load balancer and API Gateway type will drive certain design decisions. Before highlighting those though, the option that will be built below is an API Gateway HTTP version paired with PrivateLink. What this allows is multiple Application Load Balancers can be connected via one PrivateLink. If the solution spans multiple VPCs, then more PrivateLinks can be added. This is a flexible approach in that multiple microservices can be supported under multiple Application Load Balancers under a single PrivateLink.

You might be wondering, isn't the HTTP API less featured than the REST version of API Gateway? That's correct, it is. There are benefits though to the HTTP version. HTTP is cheaper, and faster and offers this nice PrivateLink integration with a VPC. If the HTTP API isn't what you want, then leaning API Gateway's REST version comes with other things to take into account.

When choosing API Gateway's REST version, the choices with PrivateLink shuttle you down a different path. You must choose a Network Load Balancer integration which comes with a handleful of limitations.

1.  NLB operates on a lower level of the [OSI](https://www.imperva.com/learn/application-security/osi-model/)
2.  NLB paired with CodeDeploy only allows `CodeDeployDefault.AllAtOnce` deployment configuration.
3.  PrivateLinks are established with the Load Balancer, not the VPC, which comes with quota limits (that are soft) and additional hops to perhaps an ALB to support more advanced rollouts.

It must be said though, NLB's are amazingly fast and also inexpensive. You might only need All At Once deployments and your application might not have a bunch of services, therefore NLB is the move. You can also add in multiple ALBs behind the NLB. This will add some latency but will bring back maximum flexibility.

That's a lot of information compressed into one writing block but the point of that is to simply state, that there is no one size fits all. And there will be trade-offs that you'll have to take on and be OK with regardless of the approach that you take.

#### Establishing the Load Balancer

Back on track to putting the load balancer together when building Blue Green with ECS and CDK. As mentioned above, I'm going to show the Application Load Balancer with the API Gateway HTTP version.

```typescript
this._securityGroup = new SecurityGroup(scope, 'SecurityGroup', {
    vpc: props.vpc,
    allowAllOutbound: true
})

this._securityGroup.addIngressRule(this.securityGroup, Port.tcp(3000), 'Group Inbound', false);

this._loadBalancer = new ApplicationLoadBalancer(scope, 'NetworkLoadBalancer', {
    vpc: props.vpc,
    loadBalancerName: 'sample-cluster-nlb',
    vpcSubnets: {
        subnets: props.vpc.privateSubnets,
        onePerAz: true,
        availabilityZones: props.vpc.availabilityZones
    },
    securityGroup: this.securityGroup
});
```

The code above is building the Application Load Balancer with the VPC that was built higher up in the article. What also needs to be done is the creation of a SecurityGroup which acts as a virtual firewall on the load balancer.

#### Adding Target Groups

Blue Green with ECS and CDK is performed by CodeDeploy shifting traffic between load balancer target groups. I've got to establish those, create listener rules, and then make them available for CodeDeploy. Let's first create the groups.

```typescript
this._blueTargetGroup = new ApplicationTargetGroup(this, 'blueGroup', {
    vpc: props.vpc,
    port: 80,
        targetGroupName: "sample-cluster-blue",
    targetType: TargetType.IP,
    healthCheck: {
        protocol: Protocol.HTTP,
        path: '/health',
        timeout: Duration.seconds(30),
        interval: Duration.seconds(60),
        healthyHttpCodes: '200'
    }
});

this._greenTargetGroup = new ApplicationTargetGroup(this, 'greenGroup', {
    vpc: props.vpc,
    port: 80,
    targetType: TargetType.IP,
    targetGroupName: "sample-cluster-green",
    healthCheck: {
        protocol: Protocol.HTTP,
        path: '/health',
        timeout: Duration.seconds(30),
        interval: Duration.seconds(60),
        healthyHttpCodes: '200'
    }
});

this._listener = this._loadBalancer.addListener('albProdListener', {
    port: 80,
    defaultTargetGroups: [this._blueTargetGroup]
});

this._testListener = this._loadBalancer.addListener('albTestListener', {
    port: 8080,
    defaultTargetGroups: [this._greenTargetGroup]
});
```

From this code, I'm building up two target groups that are configured the same. Both have the same timeouts, and intervals, looking for health checks that return codes in the 200s and use target types of IP.

Next, I'm defining listeners and then assigning them to the target groups. The listeners are also managed during the CodeDeploy rollout and allow the testing of traffic while things are in progress at various stages. We will get to that more below.

[![Target Groups](/images/image-12.png)](/images/image-12.png)

### ECS Task Definition

The definition for executing code in Blue Green with ECS and CDK is the ECS Task. The task definition contains information about the containers that will run together, port definitions, logging definitions, and many other useful settings that impact the runtime of your code. Tasks also aren't tied specifically to a cluster but will be married together with a Service to form the bond within a specific Cluster. With ECS, the task could exist in several clusters if needed. Tasks also contain versions so every update of the definition will create a new revision.

```typescript
this._taskDefinition = new TaskDefinition(scope, 'rust-blue-green', {
    cpu: "256",
    memoryMiB: "512",
    compatibility: Compatibility.FARGATE,
    runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX
    },
    networkMode: NetworkMode.AWS_VPC,
    family: "rust-blue-green"
});

const container = this._taskDefinition.addContainer("rust-api", {
    // Use an image from Amazon ECR
    image: ContainerImage.fromRegistry("public.ecr.aws/f8u4w2p3/rust-blue-green:latest"),
    logging: LogDrivers.awsLogs({streamPrefix: 'rust-api'}),
    environment: {
    },
    containerName: 'rust-api',
    essential: true,
    cpu: 256,
    memoryReservationMiB: 512
    // ... other options here ...
});

container.addPortMappings({
    containerPort: 3000,
    appProtocol: AppProtocol.http,
    name: "web",
    protocol: Protocol.TCP
});
```

There are three parts to this block.

1.  Establish the task definition.
    -   I'm opting for .25 vCPU and 512MB of memory. This is a Web API coded in Rust, so tons of resources aren't needed.
    -   Fargate is my deployment option as I want it to be serverless
    -   Graviton/ARM64 is my architecture type because who doesn't want more performance for less money?
2.  Add my container to the task. I'm doing this via a public ECR repository where I've shipped my container ahead of time. I'll include this code's repos at the bottom as well.
3.  Specify the ports that I want to communicate over and that my container exposes per the Dockerfile

[![Task Definition](/images/image-2.jpeg)](/images/image-2.jpeg)

#### Task Definition IAM

One last piece of the Task Definition is to add an execution policy. This policy defines things that ECS will use to launch the task. Things such as the ability to pull the container from ECR would be helpful. I've included this here in case you want to put an image in your own ECR and use that. Don't be confused with the Task Role though. This second role is where you define permissions that the task needs to have. Things like DynamoDB, SQS, or Secrets Manager.

```typescript
const executionPolicy = new PolicyStatement({
    actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
    ],
    resources: ["*"],
    effect: Effect.ALLOW
});

this._taskDefinition.addToExecutionRolePolicy(executionPolicy);
```

### ECS Service

We are most of the way done, but still need to put the cluster and the task together. With ECS you do this with a service. And with Blue Green with ECS and CDK, it looks like this.

```typescript
const service = new FargateService(this, 'Service', {
    cluster: props.cluster,
    taskDefinition: props.task,
    desiredCount: 1,
    deploymentController: {
        type: DeploymentControllerType.CODE_DEPLOY,
    },
    securityGroups: [props.securityGroup]
});

service.attachToNetworkTargetGroup(props.blueTargetGroup as NetworkTargetGroup);
new EcsDeploymentGroup(this, 'BlueGreenDG', {
    service,
    blueGreenDeploymentConfig: {
        blueTargetGroup: props.blueTargetGroup,
        greenTargetGroup: props.greenTargetGroup,
        listener: props.listener,
        testListener: props.testListener,

    },

    deploymentConfig: EcsDeploymentConfig.ALL_AT_ONCE,
});

```

Notice the first mention in the infrastructure of CodeDeploy. We'll get into more of that in the testing phase of the article but ECS is very tightly integrated with AWS CodeDeploy.

[![Service Definition](/images/image-1.jpeg)](/images/image-1.jpeg)

### API Gateway

Our Blue Green with ECS and CDK infrastructure journey is almost coming to a close. I'm getting excited about the testing phase of this operation. I hope you are as well.

Remember, I'm going for an HTTP API Gateway which is limited in features but low in cost and latency.

I'm going to establish the PrivateLink and the API Gateway all in one swoop.

```typescript
const link = new VpcLink(scope, 'VpcLink', {
    vpc: props.vpc,
    vpcLinkName: 'sample-cluster-vpc-link',
    securityGroups: [props.securityGroup],

})

const albIntegration = new HttpAlbIntegration('ALBIntegration', props.listener, {
    vpcLink: link
});

const apiGateway = new HttpApi(scope, 'SampleClusterAPI', {});
apiGateway.addRoutes({
    path: "/one",
    methods: [HttpMethod.GET],
    integration: albIntegration
})
```

What I like about this is the simplicity of attaching the ALB Integration directly to the route definition. When I supply `/one`, it'll be routed into my load balancer passing along that path into the container.

On the VPC Link, I'm using the VPC defined way up at the top of this article and the SecurityGroup that was also defined in that construct for additional security.

Once deployed, there will be a VPC Link and an API Gateway.

[![VPC Link](/images/image-14.png)](/images/image-14.png)

[![API Gateway](/images/image-17.png)](/images/image-17.png)

### Deploying

Deploying Blue Green with ECS and CDK just requires the following command from the root directory.

```bash
cdk deploy
```

Now sit back and watch CloudFormation do its thing. Once it's completed, you'll see the same resources I've highlighted above.

## The Blue/Green in Blue Green with ECS and CDK

Now onto the Blue/Green in Blue Green with ECS and CDK.

AWS defines the CodeDeploy service in this way:

> AWS CodeDeploy is a fully managed deployment service that automates software deployments to various compute services, such as Amazon Elastic Compute Cloud (EC2), Amazon Elastic Container Service (ECS), AWS Lambda, and your on-premises servers. Use CodeDeploy to automate software deployments, eliminating the need for error-prone manual operations. - AWS

What I love about CodeDeploy is that I can use it for ECS and Lambda. It's a managed service so it does come with some limitations but it also comes with plenty of defaults that I don't have to worry about. Focus on shipping and not on the tools.

When the stack is deployed, you'll have a CodeDeploy Application and a DeploymentGroup.

[![CodeDeploy Application](/images/image-13.png)](/images/image-13.png)

[![CodeDeploy DeploymentGroup](/images/image-18.png)](/images/image-18.png)

### Hidden Gem

Buried in this Blue Green with ECS and CDK project is a Lambda Function that you might have missed if just reading through the repository.

```typescript
const securityGroup = new SecurityGroup(scope, 'FunctionSecurityGroup', {
    allowAllOutbound: true,
    vpc: props.vpc,
});

this._function = new RustFunction(scope, "InstallTestFunction", {
    manifestPath: './',
    architecture: Architecture.ARM_64,
    memorySize: 256,
    vpc: props.vpc,
    securityGroups: [securityGroup],
    vpcSubnets: {
        subnets: props.vpc.privateSubnets
    },
    environment: {
        ALB_URL: props.alb.loadBalancerDnsName
    }
});

this._function.addToRolePolicy(new PolicyStatement({
    actions: [
        "codedeploy:PutLifecycleEventHookExecutionStatus"
    ],
    resources: ["*"],
    effect: Effect.ALLOW,
    sid: "CodeDeployActions"
}))
```

If you notice that this function is coded in [Rust](https://binaryheap.com/serverless-rust-developer-experience/), I'm sure you won't be surprised.

But what does this function do?

#### Pre-Traffic Lambda Function

You might notice that I've attached our VPC to the Function. And if we explore this function's code, what you'll also find is that it is testing routes. To test routes by hitting our ALB, the VPC piece is required. But why would we test routes?

CodeDeploy offers a handful of hooks that can be exercised during the rollout. At any point, the Lambda Function that is attached to that hook can send Success or Failure back to CodeDeploy thus allowing the deployment to continue or stop which triggers a rollback. Pretty cool right? This is a feature that isn't shared nearly enough.

The tour of this code is short but it's in the repository so you can walk through it in full when you clone it.

```rust
let deployment_id = event.payload.get("DeploymentId").unwrap();
let lifecycle_event_hook_execution_id = event.payload.get("LifecycleEventHookExecutionId").unwrap();

let config = aws_config::load_from_env().await;
let client = Client::new(&config);

let mut passed = true;

if let Err(_) = run_test(alb_url, "one".to_string()).await {
    info!("Test on Route one failed, rolling back");
    passed = false
}

# More tests happen here they are just omitted

let status = if passed { LifecycleEventStatus::Succeeded } else { LifecycleEventStatus::Failed };
let cloned = status.clone();
client.put_lifecycle_event_hook_execution_status()
    .deployment_id(deployment_id)
    .lifecycle_event_hook_execution_id(lifecycle_event_hook_execution_id)
    .status(status)
    .send().await?;

info!("Wrapping up requests with a status of: {:?}", cloned);
Ok(())
```

What's happening here is that I'm running HTTP requests against endpoints over the test listener ports defined on the load balancer. I'm going to write more on this code over at [Serverless Rust](https://serverless-rust.com) so don't worry if you are looking for more content on this pattern. It's coming.

### Triggering a Deployment

Triggering a deployment using Blue Green with ECS and CDK requires an application deployment configuration. For this example, I'm going to use YAML and perform this through the Console. This could be done via an automated process, but I think showing from the Console at this point makes the most sense as deployment triggers can take different shapes and options.

This file is included in the repository for you to adjust and use as well and looks like this.

```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "arn:aws:ecs:<region>:<account>:task-definition/rust-blue-green:9"
        LoadBalancerInfo:
          ContainerName: "rust-api"
          ContainerPort: 3000
Hooks:
  - BeforeAllowTraffic: "arn:aws:lambda:<region>:<account>:function:EcsDeploymentStack-InstallTestFunction55902174-yzGCQXvLAhXM"
```

Notice that I'm able to select the Task Definition that I want to deploy and then supply a Lambda Function for any of the Hooks that I want to trigger. To test this, I recommend you create two Task Definitions where each version is represented. There are tags in the ECR repository for both print-blue and print-green so that you can switch back and forth. The default infrastructure deployment will launch the Green version of the image.

[![Blue Green with ECS and CDK Images](/images/image-16.png)](/images/image-16.png)

### Testing the Initial Deployment

If I go back to the API Gateway portion of this article, I'm going to grab the AWS-assigned Endpoint URL and add the `/one` route onto it. Doing so and running in Postman will yield the following result.

[![Postman Green](/images/image-15.png)](/images/image-15.png)

As you can see in the response, the output is showing "green".

```json
{
    "key": "route_one from Green"
}
```

### Now to Push to Blue

Pushing the "Blue" version using our Blue Green with ECS and CDK requires creating a deployment from the CodeDeploy Application page. What's worth paying attention to is that I mentioned the application file and then I'm going to highlight the Deployment Group Overrides. There are other options that I plan to explore later around rollback alarms but for now, these are the only two things we will look at.

[![Deployment App File](/images/image-5.png)](/images/image-5.png)

[![Deployment Overrides](/images/image-11.png)](/images/image-11.png)

Feel free to play with the Deployment Overrides, but for now, I'm going to run them with the AllAtOnce configuration which means that all traffic shifts at once barring new issues occur in my triggers.

Make note of the task you created that makes use of the `print-blue` Docker tag, and off we go!

### Final Testing

The end is near! If you've hung on this long to Blue Green with ECS and CDK, the payout is just below. When done, you will see the following artifacts. CodeDeploy will have deployed the new task, CloudWatch will show the triggered logs from the Lambda Function, and then Postman will show that the URL with route one now shows it's hitting the blue container.

#### CodeDeploy

[![Installing](/images/image-8.png)](/images/image-8.png)

[![Post Test](/images/image-9.png)](/images/image-9.png)

[![Code Deployed](/images/image-19.png)](/images/image-19.png)

#### Lambda Function Execution

[![Lambda Execution](/images/image-10.png)](/images/image-10.png)

#### Postman Execution

[![Postman Blue](/images/image-7.png)](/images/image-7.png)

As you can see in the response, the output is showing "blue".

```json
{
    "key": "route_one from Blue"
}
```

## Wrapping Up

Phew! I feel like this could have been a few chapters in a book! Let's wrap up on Blue Green with ECS and CDK.

### Cleaning things Up

To clean up this whole process, simply issue from the root directory.

```
cdk destoy
```

This command will destroy the stack and all of the resources so you aren't changed for the Load Balancer, Nat Gateway, and other always-on resources

### Last Thoughts

If you've made it this far, thanks so much for hanging in there. This article can be saved and scanned for future use as the real value is in the code attached. And as promised, here are the two repositories.

1.  [This article's CDK Project](https://github.com/benbpyle/ecs-blue-green-cdk-rust-hook)
2.  [Rust Blue/Green Image Code](https://github.com/benbpyle/rust-blue-green-api)

Please feel free to clone, reshape, or adjust as needed. If you are looking for an API Gateway HTTP version that offers Blue/Green deployments with ECS and Fargate, while also providing Load Balancer security, this repository is a fantastic way to get started.

I've said before, that I do love the developer experience when working with containers and I'm a big fan of using ECS to manage my container workloads. It scales, it's simple, and it's highly secure. When using Fargate paired with AWS CDK, it lets me focus on shipping value and not all of the other things that go into running production systems.

Thanks for reading and happy building!
