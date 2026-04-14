---
title: "My Personal Serverless Rust Developer Experience.  It's Better Than You Think"
author: "Benjamen Pyle"
description: 'One of the things that can be difficult when starting with a new technology, framework or tool is where to get started. That "get started" can mean a great many things to many people. Over the past 6'
pubDatetime: 2024-02-10T00:00:00Z
tags:
  - aws
  - cdk
  - personal
  - programming
  - rust
  - serverless
draft: false
---

One of the things that can be difficult when starting with a new technology, framework or tool is where to get started. That "get started" can mean a great many things to many people. Over the past 6 months or so, I've been learning and deploying [Rust](https://binaryheap.com/rust-and-lambda/) into production in AWS. I've gone back and forth on my workflow and wanted to put together a Serverless Rust Developer Experience article. As you begin with Rust and Serverless, this should give you some good places to get started.

## Serverless Rust Developer Experience

### Where does it Start

Let's pretend for a moment that I receive a new feature request from my product owner. It'll start something like this.

"We need to build a capability that when a customer clicks the 'z' button, we calculate the value of the input fields and return them an answer. Can we do that?"

The answer is, of course, YES, I can make this happen. To lead into this article, I'm going to reach for Lambda, Rust and Serverless.

So I want to build a Lambda that handles a user web request. What kinds of tools and patterns do I personally use to accomplish this task? And then how solid is the Serverless Rust Developer Experience?

### Developer Experience

The topic of developer experience is highly subjective. However, I tend to group what it's like to perform the following activities during the delivery process.

- Writing the code
  - Which IDE
  - Project organization
- Build and debug process
- Testing locally with close-to-real scenarios
- Deploying the bundle which could be with Docker, binaries and bundled code
- Observability falls here too but I addressed that [here](https://binaryheap.com/open-telemetry-and-lambda/)

### Writing the Code

There are two important things that I've had to settle on in this area. I'm one of those developers that settles in ONCE I get comfortable. But if I'm not comfortable, I'm always looking for that nice comfortable spot.

#### Which IDE

I'm on the record of loving the VSCode experience with Rust. And I do think that it's amazing that a "non-IDE" can feel so much like an IDE. However, I've recently pivoted off of that stance. I know it's still in EAP, but Rust Rover gives me all of the things that I get from VSCode plus an easier integration with [LLDB](https://lldb.llvm.org/).

Back to the whole comfort thing. When I find a theme or a look that I like, I tend to use it everywhere. One Dark is the theme that applies across all of my Jet Brains IDEs, VSCode and iTerm.

![Rust Rover Developer Experience](/images/rust_rover.png)

I'm a strong believer in knowing your tools so find what works and try and stick with it so that you become a master of its features.

#### Project Organization

When crafting a solid Serverless Rust Developer Experience, the layout of the project matters to me. What I've come to settle on is using [Cargo's workspaces](https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html) to isolate my Lambda source code while also allowing for shared code in separate project crates. Cargo supports binary and library projects so this fits nicely in with that setup.

When working with Cargo, Cargo Lambda and CDK I like to break my Lambda projects like this:

- Directory for each Lambda function
- Directory that holds the shared code library
- Directory for `infra` which is the CDK code
- One final for test events

![Project Setup](/images/project_org.png)

A sample Cargo.toml that accomplishes this at the root project level might look like this.

```
[workspace]
members = [
    "lambda-one",
    "lambda-two"
]
```

### Build and Debug Process

Without a solid build and debug experience, achieving a quality Serverless Rust Developer Experience would be next to impossible. For the next two sections of my setup, I leverage [Cargo Lambda](https://www.cargo-lambda.info/) pretty hard. Cargo Lambda is a project that brings a subcommand into the Cargo ecosystem for building and testing Lambdas locally. I could also use it for deploying, but I stick to CDK for that.

#### Building

To build either one or many Lambda functions, I simply issue this command in the root of the project directory.

```
cargo lambda build
```

One of the nice things about Cargo Lambda is that it supports cross-compilation. If I want to build for Graviton, I can run.

```
cargo lambda build --arm64
```

And finally, if I want to package for release.

```
cargo lambda build --arm64 --release
```

#### Debugging

Now what would the Serverless Rust Developer Experience be without local debugging?

I take two different approaches to debugging code locally.

Path one is to use tracing statements to emit logs so that I can view whatever it is that I want. I find this useful in most cases because I find that I don't always use an interactive debugger unless something is going wrong.

```
async fn function_handler(event: LambdaEvent<SqsEvent>) -> Result<(), Error> {
    // Extract some useful information from the request
    info!("(Event)={:?}", event.payload);
    Ok(())
}
```

Path two is to leverage the interactive debugger. Rust has support for LLDB which integrates nicely into Rust Rover. From there, I can attach Rust Rover to the `cargo lambda watch` that I have running and I get interactive debugging.

![Serverless Rust Developer Experience Debugging](/images/debugger.png)

With Lambda development I started to get used to not having solid interactive debugging but the experience is improving and has been for quite some time. I don't always run the interactive debugger, but when I need it, I'm glad I have it.

### Testing Locally

I've said it so many times recently, Cargo Lambda is the way to go when building Lambda with Rust. The Serverless Rust Developer Experience is greatly enhanced by this subcommand.

I use the local tooling quite a bit in the following way.

The first thing is to fire up the watcher. If you are familiar with nodemon or something similar, watching code is going to seem familiar. I honestly don't do this with compiled languages much. I'm not sure why not, but since Cargo Lambda uses it as part of the process, I'm happy to follow along.

![Starting the watcher](/images/watcher.png)

With the watcher running, I'm going to run a sample event through my code.

![Sample event](/images/invoke.png)

And then side-by-side they look like this.

![Side-by-side](/images/put_it_together.png)

Cargo Lambda supports using templated events, custom event files or even passing data as an ASCII string. I've got a lot of options for how I want to exercise my code locally with various event payloads.

### Deploying the Bundle

I shared this [tweet](https://twitter.com/benjamenpyle/status/1753815458430538151) a bit ago and I am 100% settled on CDK for building and shipping Rust Lambdas. Cargo Lambda also has a nice CDK Construct that wraps some of the cross-compilation pieces as well as how to source the project files.

This is a simple example, but my TypeScript code just creates a new Function. The RustFunction construct inherits from the LambdaFunction which allows me to set things like environment variables or the architecture runtime.

```
new RustFunction(scope, 'LambdaOne', {
    manifestPath: './lambda-one'
})
```

While Cargo Lambda does have a way to deploy your stack, which I like, I find that using CDK for local to cloud deploys seamlessly. And then that same code can be used as part of a bigger CDK Pipeline if that's what I require.

## Additional Thoughts

A Serverless Rust Developer Experience can take on many shapes and is often a personal thing. However, the below will be pretty consistent throughout.

- Writing code
- Building code
- Testing code
- Deploying code

Other things to consider that I didn't mention.

AI code assistants have become super popular lately. I'm an AWS first person, so I tend to stay in their ecosystem. I'm OK with that bias too. With that said, CodeWhisperer has been a dream for me to work with. It does well in VSCode and with Rust Rover.

The Serverless Application Model (SAM) is another approach to developing Lambdas in Rust. It also provides a solid developer experience. Be advised, that you do need to enable beta features as it uses Cargo Lambda behind the scenes as well. I tend to find too much overlap between Cargo Lambda and SAM, but if you like SAM better than CDK, you'll be just fine.

Finally, I didn't mention source code control. That topic is very personal to people. I don't tend to use my IDE for managing Git. I like to use something external that gives me a "best-in-breed" solution. That tool for me is [Fork](https://git-fork.com/). I've shared this tool before, but never in an article. If you are like me and enjoy something visual and easy to work with, Fork fits those requirements.

## Wrapping Up

Getting started with something new can sometimes be hard, scary or even just confusing. My aim with this article was to show you how I build and ship production-grade Lambdas with Rust. The Serverless Rust Developer Experience is world-class at this point and it will only keep improving. This isn't the only way by any means but will give you a solid starting point that you can experiment and build your patterns.

As you start new projects, if you take into account the things I've shared above, you'll be in a better starting spot than I was when I got going some months back. And as you learn and get better with Rust and Lambda, I'd love to see how we can all make this even better.

As always, thanks for reading and happy building!
