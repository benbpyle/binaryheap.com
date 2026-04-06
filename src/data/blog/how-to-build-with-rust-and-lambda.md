---
title: How to Build with Rust and Lambda
author: "Benjamen Pyle"
description: "Rust and Lambda are new friends. Sure, there's a great deal of momentum lately around Rust but the language has been around for almost 20 years. It struggled to take off early on but has seen its adop"
pubDatetime: 2024-01-14T00:00:00Z
tags:
  - aws
  - programming
  - rust
  - serverless
draft: false
---

Rust and Lambda are new friends. Sure, there's a great deal of momentum lately around Rust but the language has been around for almost 20 years. It struggled to take off early on but has seen its adoption increase since the creation of the Rust Foundation in 2021

AWS among many others has adopted the language for mission-critical workloads that require blazing fast performance, type-safety and solid developer experience. AWS believes so much in the language that it has built components in some of its stalwart services like S3, Cloudfront, EC2 and Lambda including the microVM technology Firecracker.

I've been working with Rust for the better part of 6 months which gives me just enough experience to highlight the things I like and have struggled with when building Lambdas. I believe that if you can get over the hurdle of learning Rust, you'll gain some amazing benefits that outweigh the challenges of "getting started". Building Lambdas with Rust.

## Why Rust and Lambda

I've long argued that [Golang](https://binaryheap.com/choosing-go-when-building-lambdas/) is the perfect sweet spot for building Lambdas. First off, it's a simple language that provides a fantastic developer experience. It's compiled so it generates a nice platform-specific binary. The code is highly performant and does well on memory consumption. I believe that the nature of the Lambda execution environment hides the garbage collector so there aren't spikey-type executions.

So why make the jump to Rust? I have 3 main reasons for going to Rust in Lambda.

1.  Performance: There isn't anything faster. I completely understand that a great deal of Lambda Functions execution time is spent waiting, but when the code is not waiting it won't run faster than when coded in Rust.
2.  Cold Starts: For several years now I haven't been paying attention to cold starts. I'd argue that a natively compiled language like Go or Rust with a tiny binary size just doesn't struggle to get going. And with Rust, I've seen startup times in < 20ms when not initializing the AWS SDK. In times where I need the SDK, cold starts are < 150ms. I've also seen SDK used Lambdas have package sizes < 5MB and sometimes as small as 3MB.
3.  Tooling: I'll talk more about it below, but I love [Cargo Lambda](https://www.cargo-lambda.info/). I appreciate the fact that I can use SAM or CDK to build and deploy my code. And I've become a fan of using CodeWhisperer with VSCode to build my Rust Lambdas.
4.  Dependency Management: Crates are WAY better than Golang's Git-based dependency manager. I like the way that Rust has baked feature flags into the package manager. I believe it helps keep the final build size smaller and also limits the noise that over-fetching packages always cause.

## My Experience - Building Lambdas with Rust

Before I get into my experiences, know that my desire to be a Rustacean is purely to gain more knowledge and to give me another tool that squeezes the most out of my compute cycles. I firmly believe in what I've read at [The Frugal Architect](https://www.thefrugalarchitect.com/). Cost and sustainability are closely linked and as a builder, I have a a responsibility to build things that are cost-effective and therefore sustainably conscious.

### Choosing the Runtime

Perhaps a controversial hot take but I don't want or need a Rust runtime from AWS. What I want is the slimmest, meanest and badest version of Linux they can give me built on Graviton so much stuff is fast and performant. Think about it this way, if you are running Node or Python you need an interpreter. If you are running C# or Java, you need a CLR or JVM. Those versions matter. Rust requires none of those.

So give me Amazon Linux (al2). Would Rust adoption increase if AWS slapped a label on al2 and called it rust-al2? I have no idea but in my discussions with those building natively compiled Lambdas, no one has seemed to care. I think it's more in line with people moving to the language and thinking Amazon doesn't support Rust natively. Here me on this then. Rust is a first-class citizen and you don't need a runtime labeled "Rust".

### Building and Deploying

Building Rust and Lambda would be tough without good build and deployment tooling.

#### Local Testing and Build Packaging

I mentioned [Cargo Lambda](https://www.cargo-lambda.info/) above and I need to add more context as to why it's such a cool project.

First, it provides a nice way to handle local testing. If you are familiar with watching and rerunning code locally with Node or Python, Cargo Lambda will feel right at home. It can watch your codebase, recompile and make it ready to handle more test traffic.

Secondly, it gives the developer a way to test events. Yes, I know that SAM does the same thing and SAM can still be used. But Cargo Lambda works outside of SAM so if I was using CDK, I could still test with Cargo Lambda.

Third, Cargo is not only the way to get Crates into a Rust project, but it also is the preferred way to execute a build and package. Think Maven for Java. SAM and CDK both use Cargo Lambda to compile and package the Rust binary.

#### Deploying the Bundle

Rust and Lambda would be tough to pull off if there wasn't solid support for [IaC](https://binaryheap.com/intro-to-cdk/). Fortunately, as a builder, I can choose either SAM or CDK to promote my artifacts.

The main caveat at the moment is that Rust build support, which happens through Cargo Lambda, is only available when beta features are turned on. So something to pay attention to but not something that should deter.

Ultimately the bundle size is impressive. I've got 2 examples below. The first is a bundle produced with no AWS SDK dependencies and the second is a bundle with the EventBridge SDK. Remember, Crates gives me feature flags that allow for selective dependencies.

![Rust and Lambda no SDK](/images/rust_non_sdk.png)

![Rust and Lambda EB SD](/images/rust_eb_sdk.png)

### The Cold Start Issue

A driving factor for me in choosing a language to build my Lambdas used to be cold start performance. There has been so much written about cold starts that I'm not going to deep dive into it here. However, I will address that with small and native binaries, the cold start issue is non-existent.

The things I've found that influence these gains the most are:

1.  Binary size: The smaller the binary, the smaller the copy into the environment
2.  Natively compiled: Go and Rust are launched quickly and efficiently.

I've captured a sample of cold starts when [customizing a Cognito Access Token](https://binaryheap.com/customize-cognito-access-token-with-rust/). This code takes input, adds some values to the JWT claims and returns them to Cognito. I think most people would be happy with < 30ms performance as demonstrated.

![Rust and Lambda Cold Start](/images/rust_cold_start.png)

I will add that when including the AWS SDK, initialization will creep up to 150ms or so, but again, more than acceptable.

### Rust and Lambda Performance

Rust has been touted as having C and C++-like runtime performance. I'll leave you to do your research on that with whatever benchmarking site you want to explore. My anectodal notes are that of course it should have some on-par performance. It's a systems programming language. It has no garbage collector which means it won't suffer from the spikes of cleaning up after you.

My experiences so far with Rust have been that nothing runs as fast. Not C#, not Java and not Golang. The argument that needs to be made though is whether the learning curve and speed at which a builder can ship code makes those extra milliseconds worth it. It's my opinion that the answer is yes but it does take some investment. If I can ship software that performs better and costs less, then why not? I am after all doing this for customers.

I will make this point though. Building Lambdas with Rust would be a great deal more tedious without Cargo Lambda. Golang as I mentioned above is a nice sweet spot for speed and developer experience. The Rust compiler is slower than the Go compiler because of all that it does for the builder. And having the ability to "watch" a codebase and recompile quickly is very nice and boosts productivity. The images below highlight a couple of things.

1.  Raw Lambda performance with Rust just adding keys and returning an access token is amazing
2.  Layering in additional pieces like EventBridge publishing while is a touch slower, it's not by much.

**Customization of Token**  
![Rust and Lambda Customization](/images/rust_performance.png)

**Publishing EventBridge Event**  
![Rust and Lambda EB Event](/images/rust_eb_performance.png)

### AWS SDK and Ecosystem

I was excited to see during re:Invent this year that the Rust AWS SDK went GA. This was a big step forward for more people adopting Rust and Lambda. No one likes to be running "experimental" software in production if they don't have to. In addition to that, there are a few Crates that make things even more easy.

The [Lambda Rust Runtime](https://github.com/awslabs/aws-lambda-rust-runtime) project bridges that gap between SDK support and enhanced developer experience. Now this code IS flagged as experimental as it is subject to change. Didn't I just say above that I don't like experimental software in production? For something like a critical SDK into AWS, yes. But for something that is mostly data structures and working with different Lambda events, I don't have an issue. I'm comfortable with recommending builders look into this repository. I've also been fortunate to contribute to it and believe that the libraries included will make builder's lives easier. End of the day, if the experimental piece is a hold-up, a Lambda with Rust will be fine without it.

### Gotchas and Not Everything is a Rose

I'd be writing too slanted of a piece if I didn't address a couple of the things that I don't particularly like about working with Rust and Lambda.

#### Observability

Being a big fan of Observability, observing Rust code isn't so easy. The path that I've ended up going down is using Open Telemetry. This is a Cloud Native Foundation set of standards around tracing, metrics and logging. Many Observability vendors have support for OTel but it's been a challenge to get working the way I want it to.

In addition, the tracing and subscribing pattern used in Rust is extremely powerful but can be tough to understand and learn. The documentation is good enough but it lacks quality examples.

#### Content Content Content

When learning something new, it's always great to have content from those that have gone before. Golang has some pretty good content written around Lambda and AWS. Some great articles and videos have been shared. Rust is still so new that it doesn't quite have that same content. It's why I am investing so heavily in putting things together with Rust in '24. I believe in Serverless and I believe in Rust and want to do what I can to share patterns and examples beyond the Hello World to get people going.

As I mentioned with Observability, other parts of using Rust with Lambda are undocumented. I've read more repositories lately than articles and while I'm determined and have some time, I know not everyone has that luxury.

## Wrapping Up

I'm bullish on Serverless and also bullish on Rust. I believe that if I can build things that serve people what they want faster, cheaper and safer, why wouldn't I invest in the skills I need to be order to achieve that outcome? I know that I've said before Go is that sweet spot but I believe that to be true right now. I don't know that I'll make that argument in 6 months.

My aim this year is to help develop content that gets developers up and going with Rust and Lambda. The language is blazingly fast, it's extremely safe with its type system and borrow checker and the syntax (once learned) is easy enough to work with. Throw in tools like Cargo Lambda and the Rust Lambda Runtime project and as a builder, I have what I need to be highly productive.

The future is Rusty!

Thanks for reading and Happy Building!
