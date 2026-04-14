---
title: Building Serverless Applications with AWS - Data
author: "Benjamen Pyle"
description: "Serverless data storage on AWS compared across DynamoDB, RDS, S3, OpenSearch, Timestream, and HealthLake with guidance on choosing the right fit."
pubDatetime: 2023-07-10T00:00:00Z
tags:
  - aws
  - data
  - serverless
draft: false
---

Building Serverless applications can feel a bit overwhelming when you are first getting started. Sure, Event-Driven Systems have been around for many years but this notion of using managed services to "assemble" solutions vs a more traditional "plugin" style architecture might throw you for a loop. I haven't created a series yet, so this is my first attempt at that. My goal is to walk you through the design considerations when Building Serverless Applications with AWS.

## Series Topics

1.  [Data Storage Choices](https://binaryheap.com/building-serverless-applications-with-aws-data/)
2.  Building the Application (Fargate/Containers vs Lambda)
3.  Handling Events
4.  Exposing the API (if there is one)
5.  Securing it all, including the API
6.  Debugging and Troubleshooting in Production

This is an ambitious list, but when I think about what it takes to put together a Serverless application, these are the concepts and decisions that I often end up counseling or guiding developers new to the paradigm. So let's dig in.

## Building Serverless Applications - Data

![Building Serverless Applications](/images/aws_building_blog_data.png)

First off, yes, there are more ways to store data for a Serverless build, but these are generally the ones I end up discussing. With more focus really on RDS and DynamoDB. Not mentioned in this list is Elastic File System, Neptune, ElasticCache and I'm sure some others.

Second, I'm going to look at some high-level questions that you should ask yourself as you narrow down this design tree.

And lastly, I'm going to talk about the access models for using them in a programming language and the additional overhead/concerns that you might want to be aware of.

## Modeling

### Relational

- Is your data relational in nature?
- Does your comfort lie in the ability to query using something familiar like SQL?
- Are you migrating an existing workload into Serverless that might have been in a more traditional VM-backed system like MySQL or Postgres?

If you answered yes to these questions, it would benefit you to look into [AWS RDS](https://aws.amazon.com/rds/). Sure, maybe not as "Serverless" as some of the others as you tend to need to look at provisioning but the scaling can be handled nicely and you don't have to worry about patching etc.

### Time Series

- Is your data stored on a time series?
- Do you have certain keys/queries that you know you are always going to use?
- Are you OK using HTTP requests with your favorite programming language to access the data?

Answers to these questions will yield a finger point to [Timestream](https://aws.amazon.com/timestream/). This might service you are familiar with, but it's worth checking out if you have yeses to the questions above. I've used this in production for a couple of years, and while not quite as full-featured as say InfluxDB, it's low-maintenance and super easy to use. And performs well to boot.

### Healthcare

- Do you deal with Healthcare data?
- Do you need a Patient-centric view of the information?
- Are you comfortable making HTTP requests in your favorite programming language?
- Would you like additional capabilities like connecting to Machine Learning, Dashboards and Quicksight and leveraging other tools like [Comprehend](https://aws.amazon.com/comprehend/)

You might have a use case for [HealthLake](https://aws.amazon.com/healthlake). I can vouch for this service as I've been using it in production as well for the past 9 - 12 months. I'm trying my best to only speak on things I've used here. If you don't have the HealthLake use case, you will never need it. And you might not have ever heard of it. I wrote a case for [Event-Driven Serverless Data Architecture](https://binaryheap.com/event-driven-serverless-data-architecture/) a while back and that article has HealthLake at the core of the design. It has got its place for sure in the toolbox.

Let's continue the questions with a slant toward searching.

### Search

- Is your data used for complex queries? Broad ones down to specifics?
- Are these searches not predictable and might they be full-text in some cases?
- Is eventually consistent OK?
- Is your data in a wide variety of formats?
- Do you need scale to handle both intensive load and query operations?
- Are you comfortable making HTTP requests in your favorite programming language?

If yes to these, then [OpenSearch](https://aws.amazon.com/opensearch-service/) is where you are looking. I rarely ever use OpenSearch on its own but usually pair it with DynamoDB. The performance of DDB and the power of searching with OpenSearch make a nice combination. And as with most things with Serverless, pick the right tool for the job. And when it comes to Data, there are so many choices because each one of these is specific to the problem it solves.

### Files

- Do you have raw structured or unstructured files to work with?
- Does your data serve as input(s) into a workflow?
- Is your application built around a filesystem versus a traditional data store?

Most people don't even consider S3 (Simple Storage Service) as an option when it comes to a database for your application. But honestly, it's about the simplest solution possible. For disclosure, I've used S3 in conjunction with other services and I've also used S3 as a storage and trigger mechanism for AWS Step Functions. Don't sleep on this stalwart as it can fit in so many ways.

#### NoSQL

- Are you comfortable modeling relational data in Key/Value terms?
- Do you have non-relational data?
- Are you OK querying a database via an SDK that doesn't come with a traditional SQL Language (yes I know about PartiQL :))
- Are you good with non-traditional scaling (that is almost infinite) but is driven by access patterns and index definitions?

If you feel like this is you, [DynamoDB](https://aws.amazon.com/dynamodb/) is where you need to look. Full disclosure, this is my default data choice that I reach for. I find that if you know how your data is going to be accessed, and you understand the scaling modes, then this is the best all-purpose choice. You can model relational, non-relational, JSON-based and several other intrinsic datatypes out of the box.

### Modeling Summary

![Data Choice](/images/aws_building_data_choice.png)

Wrapping up the modeling aspect, the bottom line is you have a choice. Lots of choices honestly. And while I'm not in the inner circle at AWS, it surely seems on purpose. And as a Serverless Architect, having small and purpose-built components allows you to pick the right tool for the problem in a very composable fashion.

From a guidance perspective, I think you have 2 choices if you are just getting started. The RDS approach gives you the relational capabilities and SQL compatibility you've come to expect with tools like MySQL and Postgres. And then the alternate approach in DynamoDB. I've mentioned my personal preference above but I'll expand upon it more in the following sections.

Lastly, don't be afraid to combine where needed. I use DynamoDB and OpenSearch together quite a bit but there are other packages you can put together to bring value to your end-users.

## Working with Each Service

Once you've made the design choice based on your data model, you need to also take into account how you will access that particular service. These considerations will be programmatic, security, connectivity, and infrastructure requirements. Again, these are my experiences when working with each of these components and how they can be integrated as the foundation of your Serverless feature.

### Programmatic

In my mind, there are two good experiences and then one that is OK.

The RDS has a very traditional way of accessing data in your code. You are going to bring your library for working with the database compatibility that you are using. For instance, Postgres will be the PG library. And MySQL will be the MySQL library. Once you've got a client built, then you'll make queries like you normally would, via SQL.

The second positive experience is when working with DynamoDB and S3. Queries are wrapped HTTP requests that are proxied through the AWS SDK in the language of your choosing. Sure, you could just wrap them yourself against the DDB API, but why? You'll find that working with the SDK feels like the other SDKs as you explore deeper into the Serverless ecosystem. It might feel a touch odd in the beginning not to write SQL, but you won't miss it once you get going.

The last approach which is the same for HealthLake, OpenSearch and Timestream is to build your requests against the raw API and sign them as required per AWS security. This isn't the worst thing in the world as it's super standard, but it's not as clean nor does it feel as well packaged as the other two options. This shouldn't sway you from using one of these services, just beware as you get going.

### Security

When looking to secure access to your data resources you again have 2 approaches. You can make the argument that IAM is all you need but [check the limitations outlined](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html) on using IAM with RDS. So again, I look at it two ways.

The first way is for RDS, you have users just like in your traditional MySQL, Postgres or SQL Server. Those users then have access to schemas, tables, stored procedures and views etc. You will want to keep these credentials in something like Secrets Manager or inside Parameter Store (adds some overhead to your app, but there's no better way). From there when building your native client, use these credentials to access.

The second and more Cloud-ey way is to use IAM to secure your resources and the operations that you allow. The way I tend to do this is via a Resource Policy attached to the instance of whatever I'm running. For instance, the Lambda function needs Read access to a DynamoDB table, then grant that. If it only needs write, then grant that. That applies to all of the other services listed above as well. Remember `*`'s are for the sky, not your resource filters.

### Connectivity

I feel like a broken record at this point but there are 2 paths here. And yes, I know that you could add Private Link to the mix, but honestly, if I'm using native Serverless building blocks and AWS stands by the security around them, you probably don't need Private Link. Sure you might, then in that case go for it. But just getting started, I doubt that's the case.

First off with RDS, you might have a VPC component where your RDS instance is inside your VPC which makes connecting a touch more difficult. That's something to be accounted for. The second and probably more important is the fact that you are using Connections which are TCP based and persistent. This might not be as much of an issue if you are deploying your code in Fargate, but with a Lambda, you can easily overwhelm an RDS system with some traffic. This is why I recommend [RDS Proxy](https://aws.amazon.com/rds/proxy/) for use with Lambdas. It takes care of connection management.

And again, the second approach is the SDK and HTTP approach. You are not going to be dealing with VPCs unless your org chooses to have a Private Link in place. And when making requests you will be bound by Service Limits such as so many requests / second or so much data per request. Things like that. Things that you need to be aware of, but things that are often soft limits that can be adjusted as well. You need to know your service though and how it scales and performs per the AWS Developer Documentation. This matters and can be confusing at first as each service in the Serverless stack is a little different due to how it operates.

### Infrastructure

So the last and often overlooked piece of the equation here is how you set these resources up. From a Serverless perspective, you can use either SAM, CDK or raw Cloudformatio. Whichever of those you prefer is just fine. You can also use the Console and Click-Ops your way to success but that sounds unmaintainable. If you are starting with Serverless, I'd start with [SAM](https://aws.amazon.com/serverless/sam/) first. It is the Serverless Application Model. From there you can branch out to something else, but if I was getting into now, that's where I'd go.

## Wrapping Up

To repeat what I've been saying, Serverless is often about choice and specificity. You have many options when deciding how you want to store the data in your Serverless application and then various ways to work with it, secure it and connect to it. It's a big world, but if you start with either RDS or DynamoDB, you'll be in a good spot and can expand as you go. My encouragement is that you try DDB and see how it works. Find a place to use it and I think you'll end up there most of the time. But if Serverless in general is really stretching your comfort zone, then stick with what you know. RDS will do great and feel like an old friend that's just managed differently.

My hope in all this is that I demystify some of the challenges and decisions that all of us make as we build these types of applications. And just because I've been doing this for 6 or 7 years now doesn't mean I still don't look things up or ask advice from those in the community. No one person knows it all and I'm honestly a generalist that knows when and how to leverage experts.

Happy building!
