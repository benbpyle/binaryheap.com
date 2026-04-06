---
title: Evaluating 2 Popular Service Meshes
author: "Benjamen Pyle"
description: The decision to add a Service Mesh to an application comes down to how your application communicates between itself. If for instance your design is heavily asynchronous and relies on events and me
pubDatetime: 2024-10-20T00:00:00Z
tags:
  - architecture
  - kubernetes
draft: false
---

The decision to add a Service Mesh to an application comes down to how  
your application communicates between itself. If for instance your  
design is heavily asynchronous and relies on events and messages, then a  
service mesh isn't going to make a lot of sense. If however, you've  
built an application that is heavily reliant on APIs between itself,  
then a service mesh is a great piece of technology that can make this  
communication simpler, safer, more consistent, and observable. I want to  
explore to very popular implementations in the Kubernetes ecosystem  
which are [Istio](https://istio.io) and [Linkerd](https://linkerd.io/).

-   [Why a Service Mesh?](#why-a-service-mesh)
-   [Common Implementation Details](#common-implementation-details)
-   [Linkerd vs Istio](#linkerd-vs-istio)
    -   [Linkerd](#linkerd)
    -   [Drawbacks](#drawbacks)
        -   [External Service Configuration](#external-service-configuration)
        -   [Rate Limiting](#rate-limiting)
    -   [Istio](#istio)
        -   [Drawbacks](#drawbacks-1)
    -   [Concluding Thoughts](#concluding-thoughts)
-   [Wrapping Up](#wrapping-up)

# Why a Service Mesh?

Before jumping into the comparison between these two great products,  
let's back up one step and define what a service mesh is. I believe  
Linkerd defines it well.

> A service mesh is a tool for adding security, reliability, and  
> observability features to cloud native applications by transparently  
> inserting this functionality at the platform layer rather than the  
> application layer. -- Linkerd

What does that mean though? In plain English, if an application needs to  
make an HTTP, gRPC, or TCP request to another application, it's the  
responsibility of the client to interact safely with the API that it is  
requesting. Meaning, that if a timeout should be set on the request,  
it's on the client. If the service being requested fails, it's on the  
client to perform the retry. And if the client isn't allowed to  
communicate with the service, then that might even fall outside into  
networking to limit this traffic.

Now imagine your client needs to communicate with 3 or more APIs to  
perform an operation. This could get tricky and create support and  
troubleshooting challenges. A service mesh looks to insert itself into  
this request pipeline to make it a provider problem and not an  
application problem anymore. It also gives governance and control at the  
macro level so that all requests across your application get treated similarly.  
The larger your application gets, the more helpful  
this technology will become.

# Common Implementation Details

With a why established, how does a service mesh accomplish those  
above-described benefits and features? A service mesh is implemented as  
a "sidecar" to the actual application service code that you wish to  
deploy. This sidecar functions as a proxy which handles all incoming and  
outgoing requests and then applies the configuration rules defined for  
that proxy. The diagram below is from the Cloud Native Computing  
Foundation and is a picture of the Linkerd implementation, but Istio  
functions similarly.

![Service Mesh](/images/mesh.png)

What happens when each of your pods is deployed is that the service mesh  
proxy gets launched right next to your application code. The service  
mesh will alter the container's IP Tables to route all traffic in and  
out through this proxy. Therefore, seamlessly intercepting the  
communication with your code and allowing you to gain the benefits  
without making a modification to your application.

With the traffic controlled, the service mesh sidecar can then can be  
configured with the available options as per the implementation.

# Linkerd vs Istio

Being that this is more of an intro to service mesh by highlighting  
opinions on these two products, I'm not going to give a side by side  
comparison. However, I am going to offer my opinions and thoughts on  
when I might pick one vs the other. I do have some strong yet loosely  
held opinions on the products, but my general feeling is that I'm a fan  
of both and would recommend either for someone looking to add a service  
mesh to their architecture.

## Linkerd

Launched in 2015, it is considered the first of the service meshes. In  
2021, it graduated the Cloud Native Computing Foundation and is deployed  
in many large customers making it a battle-tested and reliable option.  
Some notable customers include X-Box, HEB, Adidas, Microsoft,  
Chase, and GEICO.

Many of the service mesh options on the market share their base from the  
[Envoy proxy](https://www.envoyproxy.io/) which was originally created by Lyft. Linkerd however is not  
one of them. They recently went through a full rewrite and choose Rust  
as their language to build the next generation version on. Now remove my  
love from Rust aside, this was done on purpose to provide a highly  
performant and low memory usage implementation. Even though the Envoy  
proxy is written in C++, what you'll find with the Linkerd Rust proxy is  
that it's slimmer in features and scope than anything built upon Envoy.  
And that's on purpose.

Linkerd prides itself as being simple to set up and simple to configure  
and that it just "works". In my experience, I affirm this belief in  
their product. Setting up Linkerd is as simple as running a couple of  
commands against your Kubernetes cluster and annotating your Pod  
resource with Linkerd enabled.

```yaml
apiVersion: v1
kind: Pod
metadata:
    name: nginx-pod
    annotations:
        linkerd.io/inject: enabled # Enable injection
    spec:
        containers:
        - name: nginx
          image: nginx:latest
          ports:
              - containerPort: 80
```

The second point that sets Linkerd apart is performance. By being simple  
and singular focused on providing just a proxy, the product leverages  
Rust appropriately and can perform more proxy requests with less  
resources. This is surely a bonus because as your scale grows, so does  
resource consumption and node requirements to satisfy your pods. Pods  
need memory and compute, and when implementing a service mesh, you must  
include these sidecar requirements into your overall pod requirements.

## Drawbacks

Nothing is a silver bullet and will solve all your problems for less.  
That rarely ever works out. Before I get into what I find is missing  
from Linkerd, let me say this. If your system is built from the ground  
up on Kubernetes and all of your traffic is contained within your  
cluster or clusters, then these might not apply to you. But if you have  
external dependencies or perhaps have irresponsible consumers inside or  
outside your cluster, take note of these points.

### External Service Configuration

When working with code or APIs outside your cluster, Linkerd (at  
present) does not provide the option to configure timeouts and retries  
for managing connections. This might not seem like a big deal, but  
timeout and retry management are essential to building reliable systems.  
For contrast, inside the cluster, these settings work amazing and just  
as expected. This becomes even more critical if the code you are  
communicating with is outside your control.

The workarounds at this point would be to build some of this into your  
application code and its HttpClient. Not ideal, but it is a way to get  
around this limitation.

The Linkerd community is aware of this gap, and they are currently  
working on providing support through a new Egress feature. I'd expect to  
see something in the 2.17 or 2.18 version which is just 1 or 2 revisions  
from where things sit today at 2.16.

### Rate Limiting

This is another missing feature from Linkerd. The idea of rate limiting  
is that you can protect your service code by being able to shed load in  
an event that you have a runaway consumer or load that is greater than  
what your system is designed to handle. This is more of a remediation  
feature that you would enact should something start to get out awry.

Linkerd does support the feature of circuit breaking that will reduce  
traffic to an unhealthy pod should that pod get into a troublesome  
state. This isn't the same thing as rate limiting, but it is a feature  
that will help protect the pod fleet should things get overwhelmed.

## Istio

Istio on the other hand was launch just two years behind Linkerd in 2017, and  
it also graduated the CNCF in 2023. Istio was born out of work by  
Google and others and is built upon the Envoy proxy.

Istio can be thought of as the full-featured service mesh. It includes  
everything that Linkerd does and then more. However, these features come  
with a reputation of being complex and harder to manage. Istio, like  
Linkerd, has an impressive list of customer case studies. It is being  
used at Airbnb, FICO, Atlassian, Ebay, Salesforce, Splunk and Google.  
That list demonstrates that both meshes have been used at higher scale  
than most anything that you are building unless you are riding on a SaaS  
rocket ship on track to join the ranks of some of the larger businesses  
in the market.

The things I like about Istio are specifically in that it's easy to get  
started, and it contains every feature and option that I can think of  
needing. For instance, if you need external service configuration which  
is missing from Linkerd, it's already built in. External service  
management is configured just like a normal VirtualService resource  
which is Istio's way of configuring things like timeouts, retries, and  
rate limiting.

I didn't mention this when talking about Linkerd, but it and Istio  
support the concept of route-based control. This feature shines in Istio  
due to the additional features, but in both meshes, this is a great  
lever to pull should you need to define route-specific controls. But  
where this goes even further with Linkerd is that you can establish  
VirtualServices for any of the services your code requires and can have  
even more control over the reliability settings when working with other  
services.

Think of Istio has having all the knobs you require to fine tune your  
specific needs in an implementation.

### Drawbacks

All of this control and fine tuning of settings does come at a cost.  
That cost shows up in two places.

First off, Istio is more complex and requires more Kubernetes resources  
to make things come together. That can be offset with the fact that if  
you don't need all the features, you won't have all of that  
configuration. But it must be said that nothing comes for free, and that  
additional configuration might feel like overhead. My opinion though is  
that once you nail the patterns down, you won't notice the additional  
YAML you need to produce.

The second cost is in runtime and compute. Istio is a much heavier  
[service mesh implementation when compared to Linkerd](https://binaryheap.com/linkerd-service-mesh-aws-eks/). This will show up  
as more resources are required in your pods to support the sidecar. This  
shows up even further the larger your mesh gets as those routes and  
proxy rules will be loaded into the sidecar's memory. All of this can be  
mitigated of course by paying attention to metrics and adjusting your  
pod's resource limits. But again, it's a cost to monitor.

## Concluding Thoughts

If I was building an application from scratch or had all my application  
inside of Kubernetes, Linkerd is my choice for a service mesh. Its  
simplicity and speed win me out as compared the feature-richness of  
Istio. And Istio is more feature rich. I didn't touch on Ingress and  
Egress or API Gateways, but Istio supports and has resources for those  
as well. Whereas Linkerd simply integrates with those other components  
of a cluster.

Running an application in Kubernetes is like anything else. I tend to  
prefer fewer dependencies and having just the right amount to get the  
job done. And Linkerd fits that bill. I find in most solutions; rate  
limiting isn't such a huge deal for me, and you can manage load shedding  
many times in the ingress controller. If I need to shed load between my  
services, I'm doing something wrong as there are other approaches to  
managing this problem.

Now I do want to mention that AKS and GKE (Azure and Google's Cloud  
Kubernetes) are leaning into managed Istio which I must do some more  
research on. If the management of Istio was taken by my cloud provider,  
this might swing my opinion a little, but probably not enough to  
move me off of Linkerd.

Bottom line though, you can't go wrong with either of these solutions.  
If you need a service mesh, I'd start with these two and make my  
selections from here. In future articles I might review some  
other options like Consul, Kong, and Cillium.

# Wrapping Up

I hope you've found this to be helpful if you are starting to look at  
implementing a service mesh into your application. I'm not a Kubernetes  
expert by any means, but what I'm trying to accomplish is to [bring you a  
developer's viewpoint](https://binaryheap.com/take-local-k8s-for-a-spin/) on making the best use of this amazing piece of  
technology which is Kubernetes.

There's a great deal to learn about the ecosystem, but I can attest from  
experience, including a service mesh into your application will increase  
reliability, security, observability, and resiliency. And with either of  
these products, you don't have to start all-in. You can just inject them  
into your pods and let them proxy requests. From there, you can begin  
adding timeouts, retries, mTLS, and many of the other features they  
provide.

Thanks for reading and happy building!
