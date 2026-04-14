---
title: Infrastructure as Code
author: "Benjamen Pyle"
description: 'Infrastructure as Code is an emerging practice that encourages the writing of cloud infrastructure as code instead of clicking your way to deployment. I feel like "ClickOps" is where we all started ye'
pubDatetime: 2023-05-27T00:00:00Z
tags:
  - aws
  - cdk
  - infrastructure
  - observability
  - people
  - programming
draft: false
---

Infrastructure as Code is an emerging practice that encourages the writing of cloud infrastructure as code instead of clicking your way to deployment. I feel like "ClickOps" is where we all started years ago when there weren't any other options. The lessons learned from the inconsistency in human deployment were the genesis for the automation and power that comes from building your cloud stacks as code. Now, many start from IaC as the patterns and practices are well-defined. But instead of re-hashing those commentaries, I want to give you my opinions on why IaC decisions are more than about the tech. Infrastructure as Code is a shift of responsibilities that brings your teams closer together and will help establish a culture of accountability but it will come at a cost.

## A short trip down memory lane

"Back in the day", before my project started I had to make sure that there was server space for whatever I wanted to deploy. That meant if I knew I needed 2 web servers, a load balancer, an application server and then a database server, all of this must already exist or I'd need to work with the Operations team to make sure it could exist. That was not fun, especially if I was going to need more scale than what was currently available.

From there, I'd need to make sure that all of my architectural components were currently supported by the ops team. For instance, did I need a queuing system? I sure hope we had one in production or else I'd need to get the ops team trained on how to manage it.

Next, I'd need to make sure that the deployment process was nailed down. How were my binaries going to get into Dev, QA and Production? This process was often so much different depending upon which person in the team you were working with. Or even which technology you were using. I don't miss this part at all.

Lastly, there was observability and the escalation process. Boom! If something is broken or not performing in production, how did you get notified? Who did the monitoring of that code or asset or component? It was usually ops, who honestly knew NOTHING about what the "thing" actually did, but they were slotted in that role because engineering leadership felt that engineers were too important to do that work. Why connect a developer close to a customer? We all just have a "role" to play. Right? Honestly, as a developer, I'm not a role player, I'm an artisan who desires to gain feedback from customers and also relish in their delight in what I've created.

## Breaking it down

![IaC Breakdown](/images/iac.png)

This graphic indicates the parts that I just mentioned above. Of course, there is so much more to building and deploying a feature, but simplistically, this is how I see things.

## Exploring the Shift

Now the part that I want to explore for the balance of this article is how IaC impacts these 4 areas and how the shift of responsibility creates a stronger team bond and a culture of accountability.

### App Code

As a cloud-native developer, I feel like the shifts that happen here have been subtle in some ways and more drastic in others. Honestly, it depends so much on your architecture, but the changes can be almost nothing if your feature is bare metal VMs and bringing your tooling or it can be drastic if you shift to something like Serverless where someone else is managing 100% of your infrastructure and the components. One thing is for certain though, this is where a developer and team spend a large portion of their feature-building time. This is the "customer value".

### Infra Code

Now this is where things are going to start to feel different. I've talked a lot about [AWS CDK](https://binaryheap.com/intro-to-cdk/) on my blog and socials, but honestly, it could be any type of coding tool that manages to build infra. Again, this article isn't about the tooling, but about what choosing the pattern does to a team and developer.

When a team decides to adopt this pattern and lean into what it means, the developers on that team are signing up for learning the API of the tool they are choosing and its operational profile.

For instance, let's take a Queue and specifically an SQS in AWS. Things that have to be understood when designing and deploying:

- FIFO or standard
- Batch size when reading
- Long-polling? Short-pooling? What's the difference?
- Encryption? Custom KMS or AWS Managed KMS?
- IAM and who can read from the Queue? Who can post to the Queue?
- Failure? Does the message stay in the queue or go to a Dead-Letter-Queue?

Now a Lambda:

- Which runtime?
- How much memory should I allocate?
- What IAM policy should I build?
- What triggers the Lambda?
- VPC? Which one and why?
- Environment variables, tags, aliases, versions ...

This can continue to go on and on and on depending upon how many resources you are using in your feature. And for each of those resources, you'll need to make these decisions and choices.

#### Impacts

So how does this impact the team?

First: It will affect speed. And when I mean speed, I mean speed of delivery. Why? Because the team needs to take into account the way they want this infrastructure to run in production. What is the operational profile they are looking for? How will they handle failure and manage that failure? Because in the cloud, things will fail.

Second: Feature buy-in will increase. What do I mean by this? I mean that a team when they are thinking about the operational profile will produce something that is well understood by the entire team. Now I'm not saying that this won't happen if you don't use IaC, I just mean to say that this will happen when you choose to use IaC. And if it doesn't happen, your team will be bewildered in production and they'll quickly be forced to think about it.

Third: These choices will strongly tie into the observability piece. Understanding what options are configured will drive what behaviors are observed and when those observations are outside of the parameters of "acceptable"

### Observability

This is where I find that the shifts in responsibilities come into full view. In the "old" days, when something went bump in the night, an operations person got a page. This sort of makes sense IF the issue is related to something they built and they are managing like network, disk, memory and whatnot. But as you shift to IaC, the ops person, didn't build or rack any of the technology the code is being run upon. So what happens when they see that a Dead-letter-queue has a depth greater than 10 messages? Do they understand why that happened? Which code was reading from the primary queue and couldn't process those messages? Honestly, and with all due respect, they probably don't have a clue. So why page them?

If you think back to the previous section, let's take a lambda reading from an SQS, the developer that built that infrastructure understands what code will be failing. And hopefully, they are instrumenting that code to help point out why. I'm a big fan of using [Datadog](https://binaryheap.com/observing-with-aws-lambda-datadog-and-go/) for doing this type of instrumentation. Regardless of whether you are running containers, functions or even your web servers, when using IaC, the team should also be instrumenting their code for observability.

#### The Impacts

The main things that I've seen in my experiences here are centered around:

- Customer focus
- Accountability
- Time to respond

Let's break those down just a little bit. When the team is observing how things are performing, they often will take a customer view of those operations. That customer view will help drive improvements to promote better efficiency or can include new workflows that get driven back into the product. This will also set up a mindset of continual improvement. Again, this isn't unique to IaC but I find that it happens more frequently when using IaC.

Why does accountability matter? Well because it comes with an increased sense of ownership in outcomes. And a team that owns their outcomes is a mighty force for good. When a team is building to watch and observe they will be intimately aware of its performance in production and that impact on the feature. I do want to caution you, this is a mature team that builds observability into its process. I often see this happen on iterations two or three of a feature. But once the team does it once, they won't want to deploy a feature without it.

Time to respond is the last major impact that I see when shifting to Iac and taking on observability. With IaC, building alarms and metrics are much simpler I see teams with them responding to issues much quicker. That might mean using Slack to auto-spin up channels, or perhaps SMS or another means of real-time communication. Many times issues can be caught ahead of time by canary alarms that start sounding as things start to look worse before they get even worse. It all depends upon what triggers the alarm, the severity and what the remediation is. But again, a team that owns its outcomes and that is customer-focused will know what to do here.

### CI/CD

And last but not least, teams that adopt IaC start to adopt the management of their build and deploy pipelines. There are so many tools that make this more possible but the takeaway from this process is that there isn't a DevOps engineer in some other team that is off building some custom scripts that look completely different from the rest of the builds on the other teams.

Part of why I think this matters is because the team that is building the feature will know best how to compile that feature. Or they should. How does a building engineer understand exactly what needs to be there for a developer? Sure, package management and environments have come a long way, but as an artisan, I want to make sure my binaries are the way I want them so that they can be deployed for me to observe and watch customers delight in them.

#### The Impacts

The main impact here is that the team is responsible for managing their build, the health of their build and the things needed to deploy the application. These things could be parameters, secrets, database migrations and any other host of things. But when a team owns that, they then own the realization of all of the parts we've discussed above.

## Broader Culture Impacts

Ok. So I've just walked you through how I see IaC transforming the responsibilities of the development team. And now what I'd like to do is shift up a level and from a leadership standpoint, what is happening to the Dev and Ops teams. The premise is that IaC will make us faster and the Ops team now has more time on its hands so perhaps we need less of them? And now that the developers understand how their code runs in production and owns the process, we should be able to go faster?

Honestly, neither of those things is true.

### Development Team Impact

First off, if you think about a sprint, what happens?

- Plan
- Do
- Inspect
- Adapt

That's the rhythm. But when you introduce the 3 new blocks on top of the App Code block it looks like this:

![Sprint](/images/sprint.png)

You still have your "sprint" but now in the sprint you need to do 3 more activities. So guess what? You won't do as much of the first and will be doing more of 2, 3 and 4. Of course, as the feature matures, you do less of 2, 3 and 4, but they are still there. And that IaC still needs to have good hygiene. It's code. It atrophies and ages. Thus, it needs to be maintained.

I argue though and have seen an increase in the things we've talked about like ownership, customer focus and time to respond among many other attributes that outweigh pure speed. If speed is your only dimension that drives success, you surely won't be successful because you won't be paying enough attention to quality, customer value and sustainability of team resources.

### Ops Team Impact

Now to the ops team. Should we get rid of them? Of course not! Their time is repurposed. What ends up happening is that the Ops team will transition into what is popularly known as Platform Engineering. Or as we call it at [Curantis](https://curantissolutions.com), Cloud Operations. This team now works on building tooling that aids the delivery teams to go faster, safer and with standards.

They will spend their time working on pipeline health, and standards around resource tagging and cost, in addition to stamping out standards for key cross-cutting concerns. These things range from best practices with:

- Encryption
- Runtimes
- Container standards
- IaC best practices
- Common libraries for packaging corporate best practices.
- Participating in design sessions on new features

I often find that the Platform team works closely with the architecture team to help make sure the Engineering team has what it needs to deliver the customer value they are being asked for.

## Wrap Up

Infrastructure as Code is a great pattern to adopt when you are looking to move your engineering team forward as it relates to building a culture of accountability, ownership, and customer value while balancing urgency and time to respond to issues. It isn't perfect and it's not a one size fits all. It also isn't easy.

I hope you've seen that as a leader, one must view this move as not a way to shrink a footprint but more to enhance your delivery. The teams will slow down some. They will need to learn new things. But they will also start to break down the silos of the departments.

What I want to leave you with is this thought. If your organization exists to bring value to your customers, shouldn't everyone in your charge have the same goals in mind? Shiping software to delight your users.
