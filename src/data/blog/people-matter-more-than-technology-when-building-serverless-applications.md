---
title: People Matter more than Technology when Building Serverless Applications
author: "Benjamen Pyle"
description: "I've been hitting the gas pretty hard on Rust lately and doubling down on my desire to see more Rust in Serverless. I feel strongly though that balance is important in anything in life. For every peri"
pubDatetime: 2024-02-17T00:00:00Z
tags:
  - aws
  - people
  - programming
  - serverless
draft: false
---

I've been hitting the gas pretty hard on [Rust lately](https://binaryheap.com/serverless-rust-developer-experience/) and doubling down on my desire to see more Rust in Serverless. I feel strongly though that balance is important in anything in life. For every period of intense push, there needs to be time to pause and reflect. So for this article, I want to take a step back and hit some brake on my Rust content by looking at what's really important when building Serverless applications.

## How do I Arrive Here?

I've been building, leading, designing or assisting in the building of Serverless applications for going on 9 years now. I spent a little bit of time in Microsoft's Azure but most of that experience has been with the AWS Cloud.

Technology has been my profession for going on 27 years dating back to my earliest experiences when I started a company building dynamic websites in the mid-90s. I've coded on a Mainframe, worked in large HP-UX clusters and been through client-server, SOA and now Microservices.

![Building Serverless Applications](/images/here_to_here-1024x869.jpg)

I thought the work I did as a kid like in this photo would result in a life on the PGA Tour, but here I am building software instead.

I code and write mostly about compiled languages because that's what I prefer but my first love in programming was Perl. Quick aside, my friend [Jeremy Daly](https://www.jeremydaly.com/) also likes Perl. Back to my point, if it hadn't been for Perl and CGI, I might not have fallen in love with shipping customer value.

This backstory was simply to share a basic point. I love delivering software that customers use and I'm always in pursuit of better ways to quickly and safely make good on that passion. Software should either be fun or useful. If it serves neither of those, what's the point?

## Building Serverless Applications

There's no way around this fact. Almost all Serverless applications will have some Lambda in there somewhere for its compute element. Lambda is so prolific when building Serverless applications that most people often confuse Lambda for Serverless. If that's you, [here's an article](https://binaryheap.com/building-serverless-applications-with-aws-compute/) that highlights Serverless Compute is about more than Lambda.

With my backstory and the heavy usage of Lambda when building Serverless applications, it's no wonder I'm writing so much about Rust lately. Sorry, I promise the last Rust mention. (You'll see further down I didn't quite make good on this promise)

However, when building Serverless applications, the language choice matters less than understanding the value your Lambda must deliver.

## What Matters More Than Language Choice?

The two most important parts of building Serverless applications are this:

- People
- Customers

Let's break that down.

### Building Serverless Applications - People

The single most important thing that needs to be accounted for when building Serverless applications is [people](https://binaryheap.com/intersection-of-technology-and-people/). If I go back to my above point that software is about delivering value to customers, what's more important between these two choices?

- Learning a new tool to shave 250ms from a Web API that adds 6 months to the delivery.
- Getting to market first or almost first with a fantastic user experience.

The argument can be made that "Why can't I have both"? My argument back is that you don't need both. When shipping value to customers, being bug-free with great workflows paired with early-to-market delivery will win out over having the most technically superior application. And I use the phrase technically superior very loosely in this sense. I'll take a team that's shipping quality value every two weeks in JavaScript versus a team shipping blazing-fast Rust code that doesn't meet the need.

Don't let anyone tell you that you are less than another developer because of the tooling you choose or your ability to implement a bubble sort from scratch. There are problems at many levels of the computing stack and none are more important or valuable than another. Hone your skills on what you want to spend your time working on and be the best you can be at those skills.

#### Value over Tech

All of this is to say that the current skills and efficiencies are more important than trying to shave time or follow some tech influencer's quest to get people interested in a new and popular language or framework.

Spend the time you would have been learning a new tool to shave time off your Lambda execution focusing on spending time with the product team to understand the value and meaning of your Lambda code.

And lastly, lean into your cloud vendor. Stop trying to build a better mouse trap. Advances in technology are happening all the time. The speed of AWS' Lambda has been rapidly improving over the past couple of years with the launch of things like SnapStart and [LLRT](https://github.com/awslabs/llrt)

### Building Serverless Applications - Customers

With Serverless and when building Serverless applications, the priority of a build needs to be on shipping value. I could make the argument that this point is true for any software build, but this article is about Serverless, so I'm sticking with that theme.

Does a customer care about whether you build with Dotnet, TypeScript or Rust? Of course not. They care about the value you deliver them. And for this reason alone, building with Serverless is so powerful. I'm going to hammer this point. Focus on value, not on technology. Use the technology to ship your value.

#### Delivery Over Toolchain

Learning a new toolchain and spreading that around is going to cause more pain generally than by leveraging other approaches. For instance:

Does a requirement exist that API Latency is less than 300ms on greater than 95% of the requests? If that answer is yes, then this these non-function requirement is easily achieved with Lambda almost regardless of the language chosen.

But what if that number goes down to 200ms and the percentage of requests that can experience greater is something like 100ms? Would it be better to learn Rust or take your lower latency requirement pieces and put those in Docker launched in ECS?

I'd argue the latter so that I'm not mixing and matching languages for performance, only changing compute runtimes. Again, I could argue that another language solves that problem in Lambda all the time but at what human cost? At what delay time to ship value?

Don't be so quick to move on from a team favorite because of Lambda's performance profile. Remember, Lambda != Serverless. Other options exist without changing languages. And just because Lambda doesn't fit one requirement, doesn't mean Lambda doesn't fit any requirement. Value over technology. It's just code, so try not to get wrapped up in the perfect being the enemy of good.

#### The Product Team Needs to be more Hands-on

In any software building, there needs to be a solid relationship between product in engineering. A great product strategy can win in the market with a subpar technical implementation. Does Microsoft Windows versus Apple OS X ring any bells?

When building Serverless applications, the product team must reach a little deeper into the "how" than in other software models. This is because there are so many options to accelerate value and delivery that come with consumption and performance trade-offs that it can't just be an engineering decision.

And as an engineer, I feel it's my responsibility to bring those decision points to the forefront of the discussion. Is 250ms good enough? Is it reasonable to keep bumping up the cost of my relational database or is it time to pivot to DynamoDB for cost and consumption reasons? Things like API Gateway are amazing, but they come at a cost. Sometimes an Application Load Balancer due to its throughput and cost profile makes more sense.

Nothing should happen in a vacuum and in building Serverless applications, this point is amplified.

## Remember the Why

### Shipping is my Why

The point of software is to be fun or useful. It needs to serve a purpose. Building Serverless applications can provide patterns and building blocks that accelerate customer engagement and reduce time to market. Don't waste energy on trying to be perfect. 400ms might be good enough and that's 100% OK. Don't let anyone tell you it's not because only YOU understand what your customer expects and will pay you for.

### Community is my other Why

I love good-spirited debate. I enjoy hearing other's opinions and challenging my assumptions through their lens. But I try with each engagement to not get so wrapped up in "winning" that I forget that my why is to lift others and help people who are genuinely interested in getting better at this craft.

We all have a story. We all have biases, backgrounds and opinions. But at the end of the day, I believe that we are after the same thing. To share, learn and grow together in the support of shipping software to customers that is either fun or useful. And by doing that, taking care of whatever it is in our lives that matters. For me, that is always Elizabeth, Zachary, Pearson, Mako, Honu and Tasso.

Don't forget your whys because they will shape a lot of your hows.

## Wrapping Up

This topic has been in my mind for months and has been slowly pushing forward the more and more I've invested in learning that programming language represented by a crab. (See I didn't say it)

I've had people ask me if should they switch. What do I think about LLRT? Does SnapStart make Java and it comparable now? How do I feel about just running k8s vs Lambda to get the boosts I strive for?

Look, I love Rust, Go and other compiled languages over Python and JavaScript. I'm OK stating that publicly, but don't let my influence shape your reality if you don't feel the same way. I'm only offering alternative thoughts to spur discussion and perhaps help improve an ecosystem that I think warrants improving. Rust and Serverless.

But on the questions I get asked above, my thoughts can be summarized like this.

1.  Never be doing learning. Enjoy the journey. Some find learning easy, and some find it hard. Thanks, Danielle Heberling for your amazing share on LinkedIn about the relative word "simple". But I promise you that if you keep learning you'll continue getting better at your why. (whatever that is)
2.  There is no perfect language or framework. They are tools at the end of the day. I don't cut miter joints with my table saw for a reason. I could ... but why?
3.  Find your why, focus on value and delight customers and I know things will work out.

I'm so grateful for the engagement around these topics lately. If you haven't noticed, I BelieveInServerless and building Serverless applications. I try my best to offer perspectives that I think others will find both useful and helpful with a sprinkling of my personality.

Thanks for reading and happy building!
