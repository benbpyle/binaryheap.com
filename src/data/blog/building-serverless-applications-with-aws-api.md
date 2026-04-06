---
title: Building Serverless Applications with AWS – API
author: "Benjamen Pyle"
description: "Building Serverless applications can feel a bit overwhelming when you are first getting started. Sure, Event-Driven Systems have been around for many years but this notion of using managed services to"
pubDatetime: 2023-08-05T00:00:00Z
tags:
  - aws
  - programming
  - serverless
draft: false
---

Building Serverless applications can feel a bit overwhelming when you are first getting started. Sure, Event-Driven Systems have been around for many years but this notion of using managed services to "assemble" solutions vs a more traditional "plugin" style architecture might throw you for a loop. Continuing in the series of Building Serverless Applications with AWS, let's have a look at the "API" aspect.

## Series Topics

1.  [Data Storage Choices](https://binaryheap.com/building-serverless-applications-with-aws-data/)
2.  [Building the Application (Fargate/Containers vs Lambda)](https://binaryheap.com/building-serverless-applications-with-aws-compute/)
3.  [Handling Events](https://binaryheap.com/building-serverless-applications-with-aws-handling-events/)
4.  Exposing the API (if there is one)
5.  Securing it all, including the API
6.  Debugging and Troubleshooting in Production

## Building Serverless Applications - API

There are a few different ways to connect a Lambda or Fargate task to the internet when exposing an API. You've got the Load Balancer approach, direct IP address or function URLs. But honestly, those routes are more special use cases that I think stray from the point of this series, which is to highlight how to get started with Serverless development. So for this article, we are going to look at the [API Gateway](https://aws.amazon.com/api-gateway/) approach and I'm going to talk through the things that I have found to be important when implementing this service. I will caution you, however, that this service is quite extensive so it's worth digging into the documentation and gaining as much understanding as possible when working with it.

> Amazon API Gateway is a fully managed service that makes it easy for developers to create, publish, maintain, monitor, and secure APIs at any scale. APIs act as the "front door" for applications to access data, business logic, or functionality from your backend services. Using API Gateway, you can create RESTful APIs and WebSocket APIs that enable real-time two-way communication applications. API Gateway supports containerized and serverless workloads, as well as web applications. API Gateway handles all the tasks involved in accepting and processing up to hundreds of thousands of concurrent API calls, including traffic management, CORS support, authorization and access control, throttling, monitoring, and API version management. API Gateway has no minimum fees or startup costs. You pay for the API calls you receive and the amount of data transferred out and, with the API Gateway tiered pricing model, you can reduce your cost as your API usage scales. - AWS

That's quite a long description of the service, but ultimately what you have in API Gateway is a front door for your code. That front door can handle traffic routing, shaping, authorization and versioning. In addition, you can extend it with something like a Web Application Firewall that can further reduce and refine what's allowed to trigger your code's execution.

![API Gateway Building](/images/api_gateway_building.png)

## API Gateway (The Tour)

As I was putting together my thoughts for this article, I felt that I was going to stray a bit from the previous ones in the series because while those articles seemed to be a comparison of services, this one is more of a tour of the service.

I want to walk you through the following topics while giving you my thoughts on the experience when working with that part. This won't be exhaustive, but from a getting-started perspective, this will give you enough to begin being productive with API Gateway. The tour will cover:

-   Resources
    -   Method Request
    -   Integration Request
    -   Integration Response
    -   Method Response
-   Models
-   Custom Domain Names and Base Path Mapping

My feeling is that by covering the above, you'll be well on your way to shipping your first Gateway projects. And for our examples, I'm going to be covering a [REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-rest-api.html) as defined by AWS inside the API Gateway Product.

### Tour - Resources

When looking at resources, I like to think about how I'm going to organize my requests. We could get into a big debate as to the correct layout for REST resources, but in my opinion, pragmatism wins while trying to be as close to standards. Be thinking about the following things

-   What are the logical paths?
-   Which verbs do I want to offer?
-   Do I need CORS?

You might end up with the following routes for a basic set of endpoints:

```
/ # POST
/{id} # GET
/{id} # PUT
/{id} # DELETE
/{id}/children # POST
/{id}/children # GET all children
/{id}/children{childId} # GET
/{id}/children{childId} # PUT
/{id}/children{childId} # DELETE

```

Once you've defined those routes, you can begin to configure the important settings behind each of them.

![Request](/images/request.png)

### Method Request

Before I continue through the settings of each of the parts of a request if you are choosing to use a Proxy request, a great deal of the shaping request and response doesn't matter too much. What I mean by this is that when choosing a Proxy request, the payload that is requested from the client is directly forwarded into your target code. For full disclosure, I tend to use Proxy requests most often because I often don't take advantage of the shaping capabilities that are at my disposal with API Gateway. My opinion on that is sometimes I just don't have the need and I don't bother with it. I'll touch on a few things in a bit that makes me change my mind though.

![Method Request](/images/method_request.png)

Key things to pay attention to on this screen.

Authorizer. I wrote an article on this and I'll dig deeper in the next article in this series, but just know that you can force authorization before your code is executed. Here's how I did that with [Golang](https://binaryheap.com/custom-api-gateway-authorizer-with-golang/)

API Key. This part of the request is super cool as even though you can have Authorization, you might have a client use an API Key. This is outside of the scope of this article, but with keys, you can have Usage Plans which come with things like throttling and request limits. These are nice features if you have partner-type integrations.

URL Query and HTTP Headers. Remember, this means more when you aren't doing Proxy requests, but this is where you can define the parts of your request that are coming in from the client. I tend to put these on my definitions regardless of whether I use them or not.

Request Body. Don't sleep on this. API Gateway supports the OpenAPI specification and you can use that specification to both documentation and build your APIs. At Curantis, we currently include the export of our API in our build steps and it gets published to our internal OpenAPI-hosted UI. Makes documentation a breeze!

#### Integration Request

![Integration Request](/images/integration_request.png)

Look at the options for what can be triggered by your request. So I'm going to quickly run through them but I sort of feel like I need to do some further writing on each of these.

-   Lambda Function. Going back to compute, this is going to be the Lambda Function that will be triggered by this request. Permission to run "lambda:Invoke" will matter. Choosing Proxy will send all data straight to the Lambda.
-   HTTP. Make a call to another endpoint somewhere else. I honestly don't use this often or if ever, but there is a use-case there.
-   Mock. Ever have a backend developer working separately from a frontend developer? Ever heard that frontend developers say they can't start coding until the backend is done? If yes to either of those, Mock is your friend. It'll do what it sounds like.
-   AWS Service. I could spend a lot of time talking about this. But you can connect pretty much any AWS service you need to an endpoint. And here's the beauty of that. Need durability above anything else? Dump the request straight to an SQS and then work the problem with Step Functions. Or just trigger the Step Function directly. Pretty cool.
-   VPC Link. Want to not expose your Private ALBs or NLBs? Who doesn't? A VPC link can connect those private resources to your API Gateway so that the only way to your containers is through Gateway. This can be done as well with CloudMap for ECS Tasks which we just discussed 2 articles ago.

#### Integration Response

![Integration Response](/images/integration_response.png)

With Integration Responses, you get the opportunity to shape what comes back from your Integration. This is done by first defining the Response Status. From there, you can customize the Header. And lastly, the Mapping template will allow you to shape the body of the response. Doing this is not so easy though as it's done through [VTL](https://velocity.apache.org/engine/2.0/vtl-reference.html)

My recommendation for you as a new API Gateway developer is to wade into this slowly. In my 7 years working with API Gateway, I've only used VTL when working with AWS Service Integrations. I wrote [how to do that with Step Functions](https://binaryheap.com/mapping-aws-state-machine-output-to-api-gateway-response-with-vtl/) a while back. My main issue with VTL is that its logic gets buried into your IaC and can get lost and is a little tricky to test. But it does have a place.

#### Method Response

![Method Response](/images/method_response.png)

I use the Method Response to further build out my API Documentation. This is the final link in the Request chain. My best advice here is that if you want to have your APIs well documented, attaching models to the request responses will be beneficial as you pull the API Documentation into something like OpenAPI.

### The Tour - Models

![Models](/images/model.png)

I've mentioned a couple of times about documentation. Defining API Models will do a couple of things for you as you build

1.  You will be more intentional about your payloads and responses
2.  You will make it easier for others to consume your API as you designed it

From a technical perspective, models are defined using [JSON Schema](https://json-schema.org/). I always put these in my IaC. From a CDK perspective, you can easily build models and attach them where they are needed. SAM supports the same thing. In addition, if you build your API from OpenAPI, you can define them there as well.

As a new developer, I wish I had appreciated this feature sooner in my journey.

### The Tour - Custom Domain Names and Base Path Mapping

When you create an API Gateway, AWS builds you a really nasty BUT unique domain name. That is all fine and good for working in development, but if you want to publish this to others, that's not going to give the impression you desire.

Enter, Custom Domain Names. This allows you to attach your domain name that can be used for your individual API Gateways. On a small detour and architectural side-point, don't be afraid of having multiple API Gateways. You might have a bunch of different parts of your application that each has its own IaC and the API Gateway built inside of it. It took me a long time to get comfortable with this but it is 100% the right way to do it. And here's why.

When you attach your custom domain name, you then can use Base Path Mapping. For a super deep dive into that, [here's an article that explains it with CDK](https://binaryheap.com/base-path-mapping-with-cdk/). But on the surface, if your domain is this: `www.your-domain.com`. You can link API Gateways to your domain by supplying:

-   A Path
-   An API Gateway
-   A Stage

So that, `www.your-domain.com/a-path` will now route to your API and all of the Requests you've defined will be accessible underneath that. This is the way when it comes to multiple API Gateways under one Domain Name.

## Thoughts and Opinions

Now that the tour is over, I wanted to leave you with some thoughts and opinions about working with this service.

First off, I love API Gateway. It is easy to work with, performs well and gives me the flexibility to connect my outside clients to anything inside the AWS ecosystem that I want. I'm not a huge fan of VTL and the mapping templates, but being that I don't need to work with it very often, it feels just fine.

I've mentioned it a couple of times, but I tend to use Proxy requests more often than not. I like that because it gives me a little more control over the inputs and outputs at the code level vs at the configuration level. That's what works best for me. But I know that others have different opinions and experiences.

Authorizers are super powerful. I'm going to dive deeper into that in the next article, but please do make use of them.

If you are running Containers, use the VPC link. You will want to have your code running in a private environment that is not publically accessible. API Gateway can help with your security posture by protecting these containers from the public.

The OpenAPI to API Gateway experience can be a little clunky. This is because there are extensions that have to be included to support what API Gateway needs. On top of that, supporting the export of the API to be included in the broader domain-level documentation could be improved as well, but it can be stitched together.

Pay attention to your requirements. There is an HTTP API Gateway and a REST API Gateway. They are the same service but the REST is more full-featured which you might not need. Additionally, if you need to support Web Sockets, then there is an API Gateway for that as well. Don't get these confused.

## Wrapping Up

API Gateway is a super powerful service that is a must if you are building Serverless Apps that connect to a client outside of your control. When developing a web or mobile application, unless you are using AppSync, you will be using API Gateway. So as a Serverless developer/architect, it is worth your while to dive in and understand how this service works. It will pay you dividends down the line.

I honestly didn't do more than scratch the surface on this tour but I hoped you picked up enough to get you going. The journey to being a Serverless developer with AWS starts with the data and the compute, but quickly progresses to how someone will interact with your code. API Gateway is that way.

Until next time. And happy building!
