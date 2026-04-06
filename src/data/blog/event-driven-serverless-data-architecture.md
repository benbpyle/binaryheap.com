---
title: Event-Driven Serverless Data Architecture
author: "Benjamen Pyle"
description: "Follow me along on a journey toward data unification. One of the applications that I work on is a modern, distributed, event-driven and serverless-based architecture. What that means is that data is c"
pubDatetime: 2023-03-25T00:00:00Z
tags:
  - aws
  - data
  - serverless
draft: false
---

### The Preface

Follow me along on a journey toward data unification. One of the applications that I work on is a modern, distributed, event-driven and serverless-based architecture. What that means is that data is completely isolated from other components and evolves at a different pace from its neighbor. This type of architecture is achievable using Event-Driven Serverless Data Architecture with AWS.

This is great if you are building a transactional system. You've got isolation, independent component scaling and feature delivery that goes at the pace of the team working on it. So what could be wrong? What possibly isn't good about this outside of the fact that modern distributed systems are complex? The big issue is that all of this data is not in the same place.

What's the point in having everything in the same place you ask? Simple. Source of truth for:

-   Reporting
-   Public APIs
-   Versioning
-   Audits
-   Data Sandbox

These are just the tip of the iceberg. When you are working on a big system with lots of data, having a single ingress and egress point is important when you are talking about the above.

### Solving without AWS

Let me be clear, the above can be accomplished without AWS and its plethora of cloud services. There are opensource projects/products that are out there which will bring the pieces and parts together. But what that means is that you'd have to install, manage, patch and continuously monitor a bunch of independent products and services.

Take for instance that this data needs to be stored in FHIR format. Is there a Data Lake that natively does that? How well does it manage versioning and upgrades? Sure, the HAPI FHIR engine is really good and I'd recommend it for a lot of use cases but it's just one part. From my best estimates here are the high-level parts that you must have.

-   Data change detection and capture (source systems)
-   Transformation and standardization tools
-   Scalable and highly available data store for transformed data
-   [FHIR](https://fhir.org) capable. This is a big deal with Healthcare data. [CMS](https://www.cms.gov) is pushing hard for organizations to adopt this standard
-   Extensibility - how can the data be used and expanded? Reports, dashboards, analytics, machine learning, and APIs just to name a few.
-   Governance and Security - goes without saying for almost all data, but in Healthcare this is super important

This isn't an article about alternatives but the above list could easily bring in 6, 8, 10 or even 20 different tools and projects to be accomplished. And not to mention that none of it is managed. Therefore once the architecture and software are built and connected, it will still need to be managed, patched, monitored and everything in between.

### Undifferentiated Heavy Lifting

I've mentioned this in other articles before but the real power in my opinion in picking a cloud provider is so that you can take advantage of their native tooling and capabilities. Look, there is nothing wrong with trying to be cloud agnostic or avoiding "vendor lock-in" but you aren't doing that. You are just lowering the bar of where you are locked in and raising the bar in terms of complexity and maintainability that you are adding to your team.

What I've learned over the years and especially as a leader and an architect is that when you are building something you want your creative builders to be focused on the output and the value, not the things that help them build that value. Again, some spaces aren't like this, but for me, and the things I work on, I build user-driven applications that customers get value from using. The customers I build for get no value in the work I do to build the next best graph database or whatever.

Embrace your Cloud Provider and their tooling. It'll save you time, money and operational complexity when done right. Don't fret about the "lock-in" but embrace the connectivity, the value in the common SDKs and peace of mind knowing that someone else is taking care of building and supporting the saws, hammers, nails and glue that you are using to build your value.

### AWS Serverless and Healthlake

To restate the goal of having a unified data store that is scalable, extensible and easy to monitor and operate, let's continue to explore Event-Driven Data Architecture with AWS Serverless. The below diagram is the foundation for the rest of this article.

![Event-Driven Serverless Data Architecture](/images/Modern-Data-Architecture-Sanitized-Architecture.png)

I'm going to break down the 4 lanes of this diagram into different sections and speak about the tooling and experience of working in each of them. This isn't something theoretical but is something that I have personal hands-on experience coding with and operating.

### Event-Driven Sources

When you look at the world through a Serverless and Event-Driven set of glasses you start to see everything as an event. This isn't necessarily a bad thing but sources are producers of events. On the left-most column, the diagram highlights the following sources:

-   API Gateway - external API events that might come in externally (hopefully in FHIR format as shown)
-   RDS - so many systems have relational data at their core. Nothing at all wrong with it but don't sleep on it, as it can be an EDA source
-   DynamoDB - in the AWS world there is no better EDA data source than DyanamoDB with its built-in Streams support. If you haven't read up on that, [here's an article that talks more about it.](https://binaryheap.com/streaming-aws-dynamodb-to-a-lambda-via-eventbridge-pipes/)
-   S3/Transfer - Doesn't matter what you work on, it's hard to get away from file-based transfers and [S3 and AWS Transfer](https://aws.amazon.com/aws-transfer-family/) are great choices for that.

The important thing to note about the sources is that they produce things, mostly change. The term Change Data Capture or CDC is very important to this architecture as those changes turn into events that are "sources" that then can be turned into "unified data".

I hope you are following along so far on this journey toward Event-Driven Serverless Data Architecture with AWS.

### Cleansing and Preparation

Going back to standardized tooling and leaning into your Cloud Provider, if you pick a high enough waterline, the mental jumps of "how to build something" quickly jump to "what are we building". When you remove the doubts and questions about how and shift towards what and why and for what value, magic happens.

I find that to shine in this preparation phase. Because by leveraging more concepts and capabilities when building Event-Driven Data and Serverless Data Architectures with AWS you can gain speed by having the same developers work, train, pair or even partner that build different sets of functionality. This means that app devs could help data devs and data devs can pair with app devs. I don't mean everyone does everything by any stretch. But when everyone knows Lambda, DynamoDB, SQS, EventBridge and then sprinkles in 2 or 3 programming languages they have these common building blocks to be able to build upon which removes "how" and focuses on "what"

I seriously can't stress this enough and have seen the power of this approach. Most developers I work with and know are problem solvers at heart. The tools are a means to an end to solve a problem and build something great.

When I work on this stage of the workflow the transformations and preparations depend upon the data source to some extent to get the raw data into a State Machine. For instance:

### State Machines Shine

-   RDS - Use DMS to pick up transaction logs to push into S3 and store in Parquet. If you want to see how to parse parquet, [head over here](https://binaryheap.com/parsing-an-apache-parquet-file-with-golang/).
-   DynamoDB - Streams, streams, streams. You need to be using streams.
-   API Gateway - if the data is formatted in FHIR, it's cake. If not, a State Machine started from the gateway works great.
-   AWS Transfer - Similar to the RDS approach. Get the Data in S3 first, and go from there.

Each of these paths ultimately needs to flow into a State Machine. What I've found is that once I used the right AWS tool to handle the CDC from the source, Step Functions, Lambdas and EventBridge could easily be used to take care of the rest.

That's the approach that I've taken with each of those. The ultimate output is to get the data into FHIR format so that it can be consumed by what's in the next column.

### Unifying Event-Driven Serverless Architecture Data

#### Healthlake as a Service

At some point soon I need to write more about [Healthlake](https://aws.amazon.com/healthlake/) but it's quickly becoming one of my favorite managed/serverless services at AWS.

This piece of tech sits in the middle of the design. Without it, I'd need so many pieces and parts to replace it. To put it simply, it's Hadoop, HAPI, AWS Comprehend, S3, OpenSearch and API Gateway rolled all into one plus a bunch more. I've used it to unify the various EDA sources that I talked about above.

#### Healthlake as the Unifier

Once the data is transformed in the various State Machine workflows, it is outputted as FHIR resources that are ready to be published into Healthlake. What I like a lot about data storage in Healthlake is that it holds me accountable for having correctly formatted FHIR resources, with solid coding (medical coding) patterns and the easy ability to connect FHIR resources. I say this a great deal, but with almost all data there are standards that I care about.

1.  Contract standardization - the format of the data being transferred. FieldA = FieldA. FieldA is of type `int`, great, it needs to be an `int`
2.  Content standardization - just because a field might be an `int` for "age", is it age in days, months or years? Is a code field, SNOMED, ICD, CPT? These things matter.

Healthlake gives me a piece of mind when working with it that I can achieve both of these things which puts interoperability between systems as a possibility and not a pipe dream.

I've been operating Healthlake in production for over 6 months and I can tell you that I greatly value its care around these standards and gives me a consistent API and experience to work with. It also gives me the option to use the like I want in the Consume column.

### Consuming AWS Serverless Data

I want to break down "Consume" into two sections:

1.  The output that brings human value
2.  The output that brings system value

#### Output for Human Value

The way I think about this is analytics, reporting and machine learning. These are three very specific outputs that a human can consume when embedded in an application. This is how I use them for sure.

Analytics to me means something that is calculated, perhaps over time with multiple inputs to help drive a decision. In the Healthcare world, think of Patient Lenght of Stay. It's a calculation of the number of days or hours a patient is admitted for an "encounter'. (which is also an FHIR resource). That analytic is used for all kinds of reasons that are broader than this article.

Closely tied to that is machine learning. Most of us building with AWS have heard of Sage Maker. But again to keep things simple, how about an algorithm that can predict patient Length of Stay based on many factors? That output can be used in so many ways by a clinician or an operator. I've seen the power in it.

Finally, reporting. Not the flashiest tool in the shed, but you can't build anything without reporting. Think of having a Patient's profile printed for sharing. That's what I mean by reporting.

As far as accomplishing those with AWS, I've been using Quicksight and Sage Maker to get those tasks done. Again, as I keep going back to it, sticking with the same ecosystem makes it so much easier as the SDKs are similar, the interactions are similar and using AWS IAM for access and controls makes all of it very uniform.

#### Output for System Value

I've been building for system value with Event-Driven Data Architecture when I talk about system value I'm talking about the ability of another system to either

-   Pull changes
-   Receive changes

For pulling changes, this is an API. And for me, almost every API I build and publish in AWS is done with either API Gateway or AppSync. What I used for building APIs on top of Healthlake is more of a wrapper on top of the FHIR API that it currently provides. Adding in a Custom Authorizer, Cognito or both to provide an externally focused Identity Manager works super well too.

For pushing changes. Well CDC comes into play here as well. How do you turn Healthlake into a CDC producer? Well, Healthlake does not support this currently. However, since pretty much everything in AWS can be an event, I've rolled my own. [I'd love for you to read about that here](https://binaryheap.com/handling-change-with-aws-healthlake/)

What I've done with these tools is make Healthlake the center of the platform as it's not just a consumer and a unifier, but also a producer. I'm super happy with that.

### Wrapping Up

I hope the above has shown you how I've been able to build an Event-Driven Serverless Data Architecture with AWS tooling. I really can't stress this enough. Don't fear vendor lock-in. Unless you are an ISV, I don't buy into multi-cloud. As a SaaS vendor, it's better to focus on value and delivering that to your customers than it is to make the conversation about your infrastructure. Pick a lane, learn it and be amazing at it. Your customers will thank you.

When I look back on the journey of the above outside of this article I continue to be encouraged by the progress of technology for builders. I'd also like to encourage you to get out and try something new. Event-Driven Architecture and by extension the pattern of Microservices are not silver bullets. And they by no means are "simple" in all cases, but when you are building with a team or teams of teams, the isolation, the decoupling and the feature deployment indendepence is currently my favorite way to make things happen.

My ultimate hope by you reading the above is that now you've seen that the skills, patterns and tools you use to build Apps can also be used to build super cool Data Apps and Data Platforms. Serverless and Event-Driven Architecture with AWS is not just for Web and Mobile Applications but can be used for much more!
