---
title: Intersection of Technology and People
author: "Benjamen Pyle"
description: "There is so much buzz in the Serverless world about scalability, reliability, and nano-sized functions with the ability to generate faster speeds to market. These points are no doubt true and there ar"
pubDatetime: 2023-04-08T00:00:00Z
tags:
  - aws
  - people
  - serverless
draft: false
---

### Admitting my Bias

There is so much buzz in the Serverless world about scalability, reliability, and nano-sized functions with the ability to generate faster speeds to market. These points are no doubt true and there are many other things to consider when picking the tech for your next project. But I'd like to take a look at why choosing Serverless is about more than those attributes. It can be about the intersection of technology and people.

I can admit my bias upfront that I love and often choose Serverless first. And in my current role, my teams are heavily leveraging Lambdas, SQS, SNS, EventBridge, DynamoDB and many other AWS Serverless stalwarts. But what I want to leave you with below is that choosing serverless when building a product can elevate your solutions thinking and center your thoughts around problem-solving which leaves the undifferentiated heavy lifting to be the focus of your partner in AWS.

### Defining the Waterline

I think this holds regardless of how big your application is. But I believe the bigger the application the more benefits you will reap from this thinking. By choosing managed services as your foundation I think you will save yourself 70 - 80% of the headache that will come from attempting to power your infrastructure yourself. Now before you think I'm saying "in all cases". I'm not saying that but I do feel strongly that this is true in most cases. And why?

As a builder of products, your customers are paying you for the value that you bring them. They aren't paying you for the infrastructure you are running or if you are co-located or cloud hosted. Those are your choices as a builder. And by choosing managed cloud components and leaning into being cloud-native you can focus your resources on innovation and delivery. And as a result, less on the architectural runway or infrastructure runway you need to power these solutions. This part of your thinking is the tech part of the intersection of technology and people.

This pyramid below is how I like to visualize this

![Serverless Waterline](/images/code.png)

Let's walk through these layers just a bit

#### Serverless

These are the managed components that you build your solutions thinking on top of. Again, when you are designing for an event-driven integration you know that you'll want to put a queue in place. If starting from scratch you'll need a queuing system. You'll need to select a tool, build some configuration, decide on the infrastructure and then make sure that the language you are going to code in has support for your queuing system. This is all before you even put your first event in production.

With AWS and serverless, drop in SQS and you've instantly got a highly available queueing system that has an SDK for every major language that you could want. And if for some reason you pick something, not on the menu, you've got HTTP to fall back on that you can communicate with.

This approaches carries forward with other layers in your application. Just to name a few below.

- Database - DynamoDB/Aurora
- Publishing Events - EventBridge/SNS
- Streams - Kinesis
- Disk space - S3

#### Language and Frameworks

Once you've leaped into thinking as a serverless problem solver, it makes a lot of sense to standardize some tooling and frameworks. The old adage right tool for the job is what I like about this layer of the pyramid. For instance, if a problem requires flexibility in data and your team enjoys validating schema with [Joi](https://github.com/hapijs/joi) then you might use TypeScript with a Node.js runtime with your lambdas. If you prefer the developer experience and small footprint and simplicity of [Go](https://go.dev) then use the Go 1.x runtime. You might find you don't need "compute" at all, so using intrinsic functions in State Machines might be plenty.

These decisions are very important as you look at teaming and shared architecture and thinking. If you introduce too many patterns and frameworks and allow this to run wild, you might end up with a situation where you've standardized on serverless but still can't achieve the higher level of thinking across your product that I think you could have.

In addition to the languages you are going to select and the language frameworks you choose, I believe you need to pick the infrastructure as code direction you are going to take. Again, lots of options here from

- SAM
- CDK
- SST
- Serverless
- Terraform
- CloudFormation

I'm sure I am missing one but these are the key ones that I've seen in the wild. I don't know that it matters much which one you choose but what matters is that you have consistency in the usage. You 100% do not want a ClickOps scenario where you have people building things in the Console. And you don't want a situation where people are using a mixture of all of these. Efficiency is gained and knowledge is shared when you standardize. This is a little bit of the people part of the intersection of technology and people. I'm a big fan of CDK and SAM. Here are a couple of articles that dive in a little more

- [Intro to CDK](https://binaryheap.com/29b7)
- [CDK Pipelines](https://binaryheap.com/zn6k)

#### Your Code

I strongly believe that once you've set yourself up with these bottom 2 layers in this 3 layered pyramid you've entered into a space in your solutioning where you will be allowed to focus on the actual problem. The first two decisions are not easy for sure but they are mostly just decisions. There might be some proofs of concepts thrown in there to make sure choices are correct and developer experience is solid, but there aren't "things to configure" and "servers" to stand up.

I don't think it's a fair comparison to look at serverless vs co-location and racking your equipment because the comparisons are much too far apart. But compared to EC2 plus say installing your own Kafka vs dropping in Kinesis seems fair when choosing serverless you have eliminated the ramp-up time to be ready to build. And again, the focus should be on the build and problem you are trying to solve for your customers.

### Intersecting Technology and People

OK. Up until now I've been mostly singing the serverless praise and highlighting where making serverless decisions will enable you to be up and thinking about problems and not about what doesn't bring your customer's value.

What I want you to think about is that with any technology choices, there are always other paths you could have taken. There are no silver bullets. There are no fail-proof ways to build software. You can be successful with your application with a serverless approach just like you can with a monolithic approach. Your choices don't limit you from being successful because success also depends heavily and most importantly on your people.

If you are trying to migrate to serverless I'd advise you that it's a journey and not a destination. Start small. Being separating parts of your application versus trying to do it all at once.

If you are starting from nothing and building with serverless your barrier is lowered but you still need to find people that can help you get to where you want to go. Your path to success is more about who vs what.

The people part of choosing serverless is so important that I want to leave you with a few things to think about.

#### Developers who focus on Problem Solving

I keep going back to this "problem-solving" concept because I think it is so important. First off, serverless didn't invent problem-solving in solutioning I just believe that it elevates it because when you are focused less on the undifferentiated heavy lifting and more on the innovation, you need people that just want to do that. I've worked with so many great developers in my career who just wanted to focus on things in the lower levels of that pyramid above. There is 100% nothing wrong with any of that, but serverless to me is about this intersection of technology and people and the types of people matters.

What I find oftentimes is that developers that focus more on building and customer value tend to make this jump into serverless much easier. Software in my opinion must be fun or useful and software and when building things that are useful for customers, that elevation of thinking makes the discussions more productive.

The other piece of the problem-solving component is that by having the runtimes abstracted away from you like with Lambda or Step Functions you aren't limited to this type of thinking. We can't run xyz because our expertise operating in production is limited to abc. Or we can't use xyz because we don't have a license for abc. Freedom to choose the tool higher up the stack can often lead to much more purpose-built solutions for customers.

When looking to staff a team or teams of people to think and build serverless, I always start with this notion. I orient my interviews around it. I orient the onboarding process around it. And in design meetings with product teams, it's a front-and-center concept. What is the outcome we want to achieve?

#### Developers who think about failure

Serverless technology introduces event-driven design thinking into your world. And with event-driven thinking comes failure. When you break your solution into a bunch of tiny parts, those parts don't always make the connection so how do you guarantee that your solution can recover from failure?

The developer whose mindset orients around what happens "when" is the further melding of the intersection between technology and people. In a larger and monolithic style application, the request chain is simple to reason about. In a distributed and serverless style application that's not always the case. But what I find is that developers who are naturally thinking about failure will carry that thinking up to the user experience of your customer. So it's a win/win for the team.

#### Own the operation and execution

When developers embrace serverless and building components that they know how and when they are connected, they usually take owernship of those same pieces in production. I've seen more embracing DevOps when using serverless and serverless frameworks than I did in previous experiences with other operating models. Now, this isn't to say it doesn't happen in those others, this is just my experience.

DevOps is such a loaded word for me, but when a developer can embrace the tooling that they need to run their applications and understand how to monitor and have that visibility into the individual components it builds a much tighter bond between their counterparts in operations. And for operations people, when developers meet them more in the middle, there tends to be teamwork that happens when things go wrong.

#### Cross-team collaboration

So this last point on the intersection between technology and people is the one as a tech leader that I find the most interesting.

I recently wrote an article on [Event-Driven Serverless Data Architecture](https://binaryheap.com/gbfo) where I talk about using Serverless technologies to build real-time data pipelines streamed from upstream source events. What I find most interesting about this from a people standpoint is that I've seen developers on the application teams contribute to code on the data team's repositories and done so with little drag.

And when I stop to think about why, it comes down to two things.

1.  The people I'm working with a like the ones I described above
2.  Both domains are using that pyramid above and have standardized on the bottom 2 blocks making it easier for the developers to contribute.

I can't underscore this enough as I've honestly never seen this in my previous experience. I've seen things "close" but not at this level of efficiency and with this little drag. By choosing serverless and choosing to standardize the tooling, the teams can work together to solve problems that put value in customers' hands sooner than later and have the same operating model across the two domains.

### Wrapping Up

The decision for serverless is more than just about technology. It is a decision that centers around the intersection of people and technology. This intersection requires those in charge of the solution to first

- Decide to leverage serverless
- Standardize the tooling and frameworks
- Innovate and deliver value

From there you need to embrace the operating model that is serverless and lean into the tooling, deployments and costs.

As I mentioned above, there is no perfect architecture but there is only the right architecture for your people, desired outcomes and comfort with the technology.

I hope that this article gave you some additional things to think about when building your next application or taking on those new features.
