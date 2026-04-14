---
title: The Neighborhood Domain will Quickly Improve your Modeling Skills
author: "Benjamen Pyle"
description: "Neighborhood domain modeling maps bounded contexts to familiar concepts like houses and HOAs, making microservice architecture easier to understand."
pubDatetime: 2024-05-25T00:00:00Z
tags:
  - architecture
  - aws
  - people
draft: false
---

Microservices are about domain decomposition. This decomposition allows code to be deployed that is more isolated, durable, resilient, and launched in a compute form factor designed for the requirements. In addition, the isolation allows for teams to move on their deployment schedules and cadences. These reasons are attractive, but they do come with domain complexity that often manifests itself as architectural complexity. And while I can't remove the architectural complexity, I do want to offer an approach to domain modeling that will feel more familiar. Introducing the neighborhood domain.

## Domain Modeling

Modeling a business domain is one of those tasks that everyone agrees is important but often gets overlooked when it comes time to implement a new software solution. Speaking from experience though, skipping this step will create confusion and miscommunications that can become both costly in time as requirements are written and also costly in rework when things aren't implemented in congruence with what the domain is. Software systems operate better when they look and sound like the businesses they model.

When doing this modeling work, an order of business that a domain modeler or architect must do is look at the macro picture of the business solution and begin to carve out boundaries. Boundaries in the domain world are often referred to as bounded contexts. A bounded context can be defined as a grouping of related microservices that operate to perform a set of functions on a user's behalf. Bounded contexts are made up of multiple aggregate roots that form a collective bond which solidifies the ubiquitous language that a group of people operate within.

That's a lot of words that can often be difficult to wrap your head around. When modeled, it often looks like this.

![Bounded Context](/images/Bounded_Context.png)

## A more Neighborhood Domain Way

The above diagram shows two bounded contexts representing a single solution. The example is basic, but the concepts apply to more complex examples as well.

An Orders bounded context deals with a user adding items to an order and submitting a payment. These boxes represent individual microservices that perform their operations and work in concert to deliver the intended functionality.

In a neighborhood domain, that same user also exists in the Users bounded context. The operations and behaviors in this domain deal with preferences, previous orders, and notifications that the user must manage. It's still the same user as in the orders domain, but just in a different context. It will also be a separate microservice that is deployed and built from a different codebase than the one that is in orders.

### Introducing the Neighborhood Domain

Take what I've written so far and the two bounded contexts described and let's think of them more as neighborhoods. A neighborhood domain will contain the same thing as a bounded context with multiple aggregate roots but let's describe it with concrete things we can all agree upon.

#### Neighborhood

Let's get a little bit more concrete as I introduce this. A neighborhood is a collection of microservices that are related to performing a set of user-expected operations. They work together to accomplish shared tasks. It's very much like a community. It's a boundary that all of the homes collectively reside in.

To make this a little bit more concrete, a neighborhood in AWS is managed by one of the following:

1.  Application Load Balancer
2.  Network Load Balancer
3.  API Gateway
4.  Route 53 Hosted Zone

The neighborhood is the top-level piece of a neighborhood domain.

#### House as a Microservice

If a neighborhood has no houses, is it a neighborhood? In the neighborhood domain, houses are the microservices. A house has entities that live in it and those entities perform operations and tasks.

What makes a house though a part of the community is to be associated with a neighborhood. The house could be implemented as a container hosted in EC2, ECS, or EKS. Or the house could be a series of Lambda Functions or even something like LightSail. If we carry this even further, houses need roads to connect them to other neighborhood properties. Those relate to API Gateway routes or Load Balancer rules.

#### Some Lagniappe

I've been talking so far about another way to think about bounded context and aggregate roots, but I've also been mixing in concrete items like AWS services to drive the points home. I want to give you a little something extra or "Lagniappe" that will further extend the harmony that is a multi-domain business solution.

In the USA, Home Owners Associations (HOA) have become common governing bodies to make sure that homes and their owners stay within a certain set of approved bylaws. These bylaws enforce the way neighbors keep their homes in the community up to standards.

I know what you are thinking right now ... where in the world is this going? I'll tell you.

Services often need to talk over APIs to other services. What's to prevent a service from being a "noisy neighbor" or a neighbor that doesn't honor the rules of the community?

Enter the service mesh. A service mesh operates as an HOA in a neighborhood to set some common guidelines about how services will talk to each other and protect the neighborhood from a house that's not operating under the bylaws.

## Bringing it All Together

The neighborhood domain is just another way to think about a 20 + year-old concept that was introduced by Eric Evans in his book [Domain Driven Design](https://www.amazon.com/Domain-Driven-Design-Tackling-Complexity-Software/dp/0321125215).

When looking at complex domains as neighborhoods, this is what the original diagram would look like.

![Neighborhood Domain](/images/Neighborhood.png)

Neighborhoods, houses, and HOAs are constructs that you can use to model the bounded contexts and aggregate roots that exist in your world.

## Wrapping Up

This was a much different article than what I normally write about. The genesis though was some work I was doing with a client recently and when trying to help them break up a large domain, the concept of neighborhoods showed up. Bounded contexts and aggregate roots are tough to explain, but neighborhoods, well everyone knows what those are. Getting people to rally around communities of homes operating together to serve a user's purpose makes the work of building a ubiquitous language that much simpler. And as an architect, building that language is much more important than many give it credit for.

I hope that this new way of thinking about domain modeling will give you another tool to build amazing software that delights your customers. Because remember, software needs to be either fun or useful. If neither, then why do it? And most importantly, software is a [team sport](https://binaryheap.com/serverless-and-agile/). And working as a team makes everything go better, faster and more efficient.

Thanks for reading and happy building!
