---
title: Serverless and Agile
author: "Benjamen Pyle"
description: "Agile and Serverless go together like peanut butter and jelly. Ham and eggs. Coffee and creamer. Tea and milk. Name your favorite combination that resonates best in your head. But the truth is this, A"
pubDatetime: 2024-01-07T00:00:00Z
tags:
  - aws
  - leadership
  - people
  - serverless
draft: false
---

Agile and Serverless go together like peanut butter and jelly. Ham and eggs. Coffee and creamer. Tea and milk. Name your favorite combination that resonates best in your head. But the truth is this, Agile and Serverless are a great pair when it comes to delivering value quickly to your customers and sets a foundation for adapting to change. And isn't that the point?

## How we got here

I tend to view IT Professionals in two camps. Yes, there is a third camp but I find that the third camp is smaller in numbers than the other 2. For clarification, those camps are:

- Old enough to remember Client/Server applications and maybe the Mainframe thus familiar with Waterfall, RUP, early days XP and then later on Scrum and Kanban
- Those who only know software delivery in the cloud. This means that they probably didn't have to experience much Waterfall and big upfront design delivery.
- The smallest last group is one that caught the tail end of the client/server and Waterfall boom and probably started working late 2000's and early 2010's.

With that context set, the word Agile almost seems synonymous with the SDLC (Software Development Life Cycle). But that wasn't always the case and the industry spent many years working to make that so. On the flip side, Executives and Product leaders spent many years equating Agile with more for less. Better, cheaper, faster.

On top of that, I have no disillusions that many engineers view Agile as just another stick to use to generate output. Too many times have I heard teams asked to take on more points in a sprint. Demos that have questions asked about the teams' performance and ability vs celebrating accomplishments. And worst of all, software being shipped before it's ready thus causing customer pain which ultimately falls back on the team.

But I thought this article was about how Agile and Serverless were a great fit. Well, they are. And we'll get there. But I first wanted to remind you of what the world of Agile and software has become for so many. But if you look back to Principle #1 of the Agile Manifesto:

> Our highest priority is to satisfy the customer through the early and continuous delivery of valuable software. - Agile Manifesto

It's that statement above that I want to focus on in addition to looking at some of the other principles. I do Agile because I want to delight customers faster and use their delight as a motivator for shipping and building more value. I choose Serverless because it enables me to ship easier, faster and with lower cost as true Serverless scales to zero when not being used. And I believe in it so much, I think you should look into it too. Agile and Serverless

## Key Principles

12 Principles were written in the Agile Manifesto all those years ago. I am not going to list them all out here, but they [can be found at this link](https://agilemanifesto.org/principles.html). I am going to focus on the 4 that I feel are key when looking at choosing Serverless when building software. They are in no order:

- Our highest priority is to satisfy the customer through early and continuous delivery of valuable software.
- Deliver working software frequently, from a couple of weeks to a couple of months, with a preference to the shorter timescale.
- Build projects around motivated individuals. Give them the environment and support they need, and trust them to get the job done.
- Simplicity--the art of maximizing the amount of work not done--is essential.

### Customer Satisfaction

I can't count how many times in my career a customer has been delighted by how quickly I was able to make something happen. I've always been a super hard worker who is motivated by other's finding value in what I've built. But conversely, how many hours did I work behind the scenes to make that magical experience happen? Also countless. Has that changed over the last handful of years though thanks to Serverless? 100%

When you choose to build with Serverless components, you are committing to a base level of functionality. Serverless gives me the ability to focus on the problem and not the underpinnings of how I'm going to run or deploy those functional bits. But what does that truly mean? It gives me a common set of blocks to build from that I know are going to be the same today as they were yesterday. If I need a queue and I'm using AWS' SQS, that queue implementation will work the same way it worked on my last project. I know its characteristics, cost and interfaces.

Taking this a step further, deployment becomes simpler as well. I'm not concerned with hosts, config files or provisioning of equipment. This is especially important when I am starting from scratch but can also be true when I need to extend existing functionality. By learning the definition of the components through [Infrastructure as Code Techniques](https://binaryheap.com/intro-to-cdk/) I spend more time coding and less time focusing on those things that don't add customer value.

And lastly, true Serverless components allow me to scale to zero which means that when my customer isn't running their software, there is no hardware operating. With no hardware running, there are no costs. No costs == customer satisfaction.

Productivity, focusing on the problem and the ability to control costs based upon usage, are all things that add up to customer satisfaction by continuously delivering them software.

### Delivering working software

I touched on this above with IaC. With Serverless, I am in control of the build of my components and delivery to the customer. For years of my career, the speed of my delivery was capped by the size of the server farm and the capacity of the Operations Team. I needed to plan months ahead of time to get things ready for my first push of code. And then if I wanted to automate those deploys I needed to work with another team to make that happen. On more than one occasion, the customer opportunity slipped away because of my inability to get something to production sooner. That was a team failure but in my experience, the delivery team is always to blame.

Serverless and Agile shine so well in this regard. By using tools like AWS CDK and AWS SAM, I can construct my pipelines which orchestrate the build, unit tests, integration tests and deployment of my assets in under 5 minutes from a Git checkin. I can also have parity between my development environment and my production environment. How many times have I heard this? It'll be faster in production, it's on bigger hardware. In Serverless, this doesn't have to be the case. I can run the same configuration settings in my development account as in my production account to verify that things will feel the same to customers as they do to QA. I can do this without increasing costs because if it scales to zero, there are no costs when it's not running.

With Serverless and Agile I can get things out quicker and establish solid engineering practices easier than in traditional methods. That's a bold statement. Notice I didn't say you can't establish these in traditional methods, but in my experience, once you get going with Serverless, you'll find it's easier to standardize. And solid practices like code reviews, unit tests, integration tests and a solid CI pipeline are just easier to do in the Cloud and with Serverless.

## Projects around motivated individuals

Serverless isn't a silver bullet by any stretch. I don't want you to walk away from this article thinking it is. Neither is Agile. And honestly Agile and Serverless aren't together. Because for this to really shine you need motivated people. You need people who want to do something together. They need to be willing to learn, grow, fail, succeed, trust, verify and challenge. Those sound like superhumans. Maybe. I like to think of them as motivated people. And that's what the manifesto is talking about.

By choosing Serverless, giving people the environment is taken care of. I've yet to work with a developer who hasn't enjoyed the freedom and autonomy that Serverless provides. Want event-driven communication? Pick Kinesis, SQS or EventBridge. Want compute? How about Lambda, Fargate, AppRunner. Data? DynamoDB, Timestream HealthLake. I wrote a whole series this summer on these.

1.  [Data Storage Choices](https://binaryheap.com/building-serverless-applications-with-aws-data/)
2.  [Building the Application (Fargate/Containers vs Lambda)](https://binaryheap.com/building-serverless-applications-with-aws-compute/)
3.  [Handling Events](https://binaryheap.com/building-serverless-applications-with-aws-handling-events/)
4.  [Exposing the API (if there is one)](https://binaryheap.com/building-serverless-applications-with-aws-api/)
5.  [Securing it all, including the API](https://binaryheap.com/building-serverless-applications-with-aws-security/)
6.  [Debugging and Troubleshooting in Production](https://binaryheap.com/building-serverless-applications-with-aws-observability/)

Motivated people want to work independently and have choices. Serverless provides that.

### Simplicity

I firmly believe that the code I didn't have to write is the best kind of code. And with Serverless, I write less code. For instance, Lambda has many built-in mechanisms for responding to events from upstream systems. Polling SQS, reading Kinesis, and handling API Gateway Events all come out of the box. If I need to have an API Gateway that fronts my public API? AWS' API Gateway comes with settings that I can tweak to adjust performance and usage but I don't need to worry about things like TLS termination, path routing, and payload forwarding.

These are but a couple of examples of the simplicity that Serverless affords me. And those rewards further enhance the alignment between Serverless and Agile.

Even beyond the physical nature of the component, simplicity comes in the design choices at the feature level. One of the other principles in the Agile Manifesto is emerging design. The notion of creating 2-way doors and having the ability to adapt based upon evidence-based learning is critical. For example, EventBridge can decouple producers from consumers. If one consumer is not meeting the service level agreements set upon it, that one piece could be swapped for either a more performant language, a persistent container or a code-level optimization. Again, by using tools that handle much of the heavy lifting, I can make adjustments based on need.

And while keeping things as simple as possible, I am afforded the ability to pivot and adapt.

> Focus first on your people. Make a conscious choice that you want to be Agile and put customer satisfaction first. And then dive into your Serverless development craft. When you join motivated people with a focus on the customer and give them an amazing development experience, magic will happen.

## I Believe in Agile and Serverless

I've been writing software for a long time now and I'm more excited about my future as a programmer than I've ever been. Serverless gives me so much freedom, autonomy and choice in addition to being performant, scalable and cost-effective. I believe in Serverless and the benefits that it provides. I also believe we are still early on in the days of Serverless and expect to see more offerings and competition in the future which is great for me as a developer. And great for you too if you are coding or are looking to become a programmer.

I also believe in Agile. I believe in following customer's needs and desires. I believe in shipping early and often to meet those needs. I also believe in people. Agile puts people first and I love that. Remember, software delivery is a team sport. If you put people first and align them with customers, magical things will happen.

## Wrapping Up

I've been thinking about this topic for a long time. As a developer, you often don't get to choose the project framework that is forced upon you. As a leader, we sometimes forget to put people first and approve or allow techniques that open up that creativity that enable engineers to delight customers.

If you noticed throughout this article, I rarely said Scrum. Scrum is a popular project management technique that aligns itself to the Agile Principles. There are others. Notably XP and Kanban. Scrum is sometimes used interchangeably with Agile. They aren't the same thing. Scrum is an amazing way to build software but just know it's not the only way to build software and be Agile.

When setting up a new software project, the process or framework that is adopted to pair Agile and Serverless is not that interesting to me. I'm more interested in the one that aligns with the values and culture of the people I'm delivering with. Keeping at the forefront those principles that are outlined in the Agile Manifesto, paired with Serverless makes a fantastic duo.

I want to leave you with these last thoughts.

Focus first on your people. Make a conscious choice that you want to be Agile and put customer satisfaction first. And then dive into your Serverless development craft. When you join motivated people with a focus on the customer and give them an amazing development experience, magic will happen.

Thanks for reading and happy building!
