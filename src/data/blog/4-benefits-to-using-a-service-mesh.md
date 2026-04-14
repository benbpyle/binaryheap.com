---
title: 4 Benefits to using a Service Mesh
author: "Benjamen Pyle"
description: "I've been spending a great deal of time lately working with Service Meshes and after having a few of the same conversations over and over (in a good way), I wanted to codify some of the reasons why th"
pubDatetime: 2025-04-20T00:00:00Z
tags:
  - architecture
  - aws
  - containers
  - kubernetes
  - observability
  - programming
draft: false
---

I've been spending a great deal of time lately working with Service Meshes and after having a few of the same conversations over and over (in a good way), I wanted to codify some of the reasons why they exist and when I think as a developer they come in useful. I've [written before](https://binaryheap.com/evaluating-2-pouplar-service-meshes/) about comparing Istio and Linkerd where I touch upon the concepts of a mesh but in this article, I want to go a little deeper and break my thoughts up into categories of problems that they help solve. With that stated, let's dive into what problems a service mesh solves and when you should be putting one in your architecture.

- [Defining a Service Mesh](#defining-a-service-mesh)
- [Why a Service Mesh](#why-a-service-mesh)
  - [Resiliency](#resiliency)
  - [Traffic Management/Shaping](#traffic-management-shaping)
  - [Observability](#observability)
  - [Security](#security)
- [Final Thoughts](#final-thoughts)

## Defining a Service Mesh

Before jumping in, I want to define a service mesh so there's something to point back to along the way. I'm a big fan of the way Linkerd succinctly states it.

> A [service mesh](https://binaryheap.com/linkerd-service-mesh-aws-eks/) is a tool for adding security, reliability, and observability features to cloud native applications by transparently inserting this functionality at the platform layer rather than the application layer. -- Linkerd

I could almost end the article right here because it lists 3 of the 4 main things that a mesh does in an architecture. The big draw to focus on is that I can get all of these benefits at the platform level vs doing it in the application level. From experience, this is a huge draw for architects and CTOs that want these benefits but find the challenge of having teams implement these capabilities highly difficult to coordinate and do correctly. Even with libraries, frameworks, and other tools, having this functionality sitting on top of custom service code makes it transparent to the developer and immediately available to the platform team. And if done right, still puts the developer in control, but with configuration instead of application code.

## Why a Service Mesh

A service mesh isn't a silver bullet. Truthfully nothing is in tech and while I have my favorite approaches and tools, I'm always careful to not try and solve things the way I've always done them. But to narrow down when I do look to bring a service mesh into my solution, here are some of the pieces of criteria that I evaluate.

- Does my system have distributed APIs that are deployed as small and independent parts that work together to solve a user's problem? Specifically am I working with APIs and HTTP or TCP requests.
- Is there a strong desire in service resiliency coupled with an obsession around observability of the service interactions?
- Are the developers platform and non-functionally focused or is there a platform team that has a focus to working as a safety net for the teams they support?
- Does the team favor a configuration style approach over investing doing similar practices in their application level code?

The last bullet point is tricky, because with all of the benefits of service mesh, the same could be accomplished by adding it into my application code. But by adding it directly into code, I'm tightly coupling my desired outcomes into my product value implementation. There's a lot of code I must produce that doesn't directly add bottom line value into my product. That's because a mesh or the resiliency that it provides solves many of the non-functional "ilities" that often come late in a software build.

The other thing to keep in mind is that in a polyglot type environment where different frameworks and languages are used to solve different feature problems, reusable libraries must be available for each of these combinations. It's not to say that this impossible but it really does become impractical the larger the solution gets. Not to mention, many of these operations are easy to discuss but can be tough to execute well.

With all of that said, here's the reasons that I lean into a mesh when I have the need and enjoy the benefits that it will provide me.

### Resiliency

It's hard to not put these in order of usage or importance to me, so I'll try and remain unbiased as I navigate through my breakdowns. However, many people come to a service mesh to bring more resiliency into their solutions. When I talk about resiliency, I mean how well does my application handle failure and latency.

Software systems are always going to encounter failure. That failure might be due to network packet loss (which happens), a bad deployment leaving a service in a bad state, an application error that is unfixed, and many other scenarios. The fact is, everything fails at one point or another and failure can create all kinds of bad outcomes.

Specifically, a mesh can help with resiliency by providing the following capabilities. All of these are usually very configurable.

- Retries: the ability to have specific requests to specific services retry in case of issues that are not persistent. Think about a faulty HTTP request that if just retried would be 100% OK. This failure effectively goes away for the end user.
- Timeouts; hanging onto a connection longer than it should will cause traffic and load to build up and can be harmful to your application. Most HTTP clients in programming languages allow the developer to set a timeout on their request. So many times, this is just left at the default. Maybe that works and maybe it doesn't. But combining timeout management with retries is powerful.
- Circuit Breaking: this is something that not a lot of developers think about but it's actually a really cool concept. Think about having a closed circuit where traffic is flowing and behaving as expected. Now, imagine some failure happens, and the circuit is open, thus limiting traffic from reaching its destination. Now further build upon that and make it configurable. How many times does code just call hosts that are in a failure state only to continue piling up load and making things worse. Circuit breaking is a pattern for shedding load and protecting the ecosystem.
- Rate Limiting: sometimes I have a component that can only handle so much traffic. Maybe it has a dependency on something that is limited downstream. Maybe I can only run a limited number of instances. Regardless of why, limiting the traffic that the service can handle without it having to fail over to prove it's exhausted is a wonderful feature.

### Traffic Management/Shaping

If you've ever used Nginx or even an AWS Application Load Balancer, you've got some familiarity with traffic shaping. If you haven't used software like those two, think of being a train tracker switch operator that can move requests (trains) from one track to another all with configuration.

Shaping traffic can be as simple as this:

- Take all requests that have this `path` and this `header` and route it to this `service`.

That's a very basic version of what can be done with a mesh. However, it can get more complex such as:

- Take all requests with this `path` and this `header` and weight 35% to a subset of a service and route another 65% to another subset of the service.

I can also route top-level paths to different service.s. I can return direct or static responses. Paths can be prefixes, exacts, or regexes. And at that point, the rabbit hole can get deep.

The best way I can describe shaping traffic is with the Nginx reference. I've got the power to move traffic around in a highly configurable way that can also take into account load balancing and make use of the other pieces of my mesh. Resiliency, observability, and security.

### Observability

I've seen cloud native systems skip this core piece more times than I'd like. Small aside here, but if you are working in a cloud native and distributed system without observability, stop adding features right now and go get this solved.

Observability is the super power that allows me to visibility inspect the healthy and wellness of my services and the health of their interactions with other services. By using a service mesh, I'll gain the ability to see metrics like:

- Throughput
- Latency
- Is my circuit open/configured
- Topology
- And others

In the case of Istio, [Kiali](https://kiali.io) is the tool of choice. Linkerd also has a [dashboard](https://linkerd.io/2-edge/features/dashboard/) as well that exposes this information.

I cannot stress enough how much power observability gives you as a developer or platform engineer. And with a mesh, I can include its capabilities into my overall observability strategy to gain a very complete picture of my application's health and performance.

### Security

This is a topic that most developers don't usually dive into first, but a service mesh's ability to create more secure systems is a strong argument for introducing one into your application.

What I mean by security is two fold.

It means that I can protect traffic that is between my application services. Most of the time, intra-system calls happen over non-TLS channels. With a service mesh, if the requirement exists to have that traffic encrypted from end to end the proxy which is implementing the mesh will terminate the encrypted traffic and forward it onto application container. This keeps the application code from not knowing or caring about the traffic having been encrypted, and only focusing on its operations.

The second part of security is preventing the traffic from ever occurring. A service mesh can do just that. It means that I can set up a zero-trust environment where service to service communication must be vetted and approved before I allow it. As an added bonus, I can do this on egress of my mesh as well to external services.

Again, I can do these things without having to put anything different into my code.

## Final Thoughts

I'm at the point in my journey where if I have containerized workloads that communicate with each other, I'm almost always going to reach for a service mesh to enhance my applications capabilities. There are many options out on the market which will have varying degrees of configurability, complexity, and implementations, but with anything, find the one you feel most comfortable with and invest some time into learning how it works.

If you are considering a service mesh in your next project, here's the list of the contenders I'd recommend you looking into and in no order.

**For Kubernetes**

- Istio
- Linkerd
- Kuma
- Consul

**AWS Specific**

- ServiceConnect
- VPC Lattice - _not a service mesh press but has capabilities that will accomplish most of the above_

My parting words are, plan for resilience and observe by default. These are things that a service mesh will help you with and improve your user experience.

Thanks for reading and happy building!
