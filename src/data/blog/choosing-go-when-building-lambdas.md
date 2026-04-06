---
title: Choosing Go when Building Lambdas
author: "Benjamen Pyle"
description: "So you've decided to build your first or your 500th Lambda function with AWS. Congratulations! That in and of itself is a great decision that will set you up on a solid foundation for operational exce"
pubDatetime: 2023-04-22T00:00:00Z
tags:
  - aws
  - golang
  - programming
  - serverless
draft: false
---

So you've decided to build your first or your 500th Lambda function with AWS. Congratulations! That in and of itself is a great decision that will set you up on a solid foundation for operational excellence, ease of maintenance, flexibility to extend and a whole host of other positives that come along with Serverless. Now, what language are you going to develop this new Lambda in? I've been a tremendous proponent for choosing [Go](https://go.dev) when building Lambdas and I'd like to walk you through why.

## Choosing a Lambda Runtime

When you begin building your first Lambda, that run-time decision has to be one of the first things you decide. Currently, AWS supports a host of different options that can be explored on the [AWS Runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) Lambda page. One of the best things about building with Lambdas is that since your scope of the problem is isolated to almost a "nano" level, you can free yourself up from being locked into just one set of technologies.

What I mean by that is that certain languages and frameworks are better suited to solve certain problems and you can explore those solutions with that set of capabilities while continuing to build other functionality in another completely different set of technologies and frameworks. And if you found out that say this Lambda is not performing up to how you expected for whatever reason, the time and energy investment should have been low enough that porting to something else isn't the end of the world. I've seen that happen several times throughout my Serverless building.

Each language and framework will have an impact on the profile of your function. Things such as:

-   Cold Starts - time for the Lambda to be deployed and run initially
-   Cost - Price per GB sec. Essentially memory allocated and time component
-   Memory - How much memory does your function need to be allocated to run well
-   Bundle size - The bigger the bundle the longer to deploy and the longer it to start

## Choosing Go when Building Lambdas

First off, this is purely a list of reasons based on my experience and opinions. I've deployed Lambdas in Go, Node, .NET Core, Java, Python and Rust honestly you can have success with any language you choose. But below are the reasons that I first reach for the gopher when building my functions.

### Developer Experience

I get it, this is subjective but again this is an opinion piece. For me, the built-in Go tools and the breadth of the standard library are just enough for me. So many little details are taken care of.

#### Testing

I don't need to pick Mocha, Jest, jUnit, nUnit or some other outside library for running my Go unit tests. It is built into the stack

```go
package sample
import "testing"

func Test_Should_Do_Something(t *testing.T) {
    if someCondition {
        t.Fail()
    }
}

```

Then being able to run `go test` and that's it.

#### Standard Library

Like it or not, the API world runs on [JSON](https://www.json.org/json-en.html). And Go has native support with a built-in library for dealing with JSON. Its `encoding` package is comprehensive and all of the `Marshalling` and `Unmarshalling` of objects on and off the wire seems to work the same way

```go
package sample
import "encoding/json"

// unmarhsall
i := SomeStruct{}
err := json.Unmarshal(bytes, &i)

// marshall
i := SomeStruct{}
out, err := json.Marshal(&i)

```

This native functionality will come in handy as you parse inputs and format outputs when working with SQS, Step Functions, DynamoDB and other services in the AWS ecosystem.

#### Building Go

Go's build process is quick. Why does that matter when developing functions? Feedback. Sure, IDEs and VSCode are great at identifying issues but if you don't have compile-time issues and just want to start running your code, speed matters. Build and test a few dozen times a day and the savings you gain will allow you to do just a few more cycles than you could have otherwise.

This is understated in modern languages in my opinion and Go from the start set out to build a language that compiled quickly. This also plays into local development and build and deploy when using CDK or SAM if you've got say 10 or 15 functions in an API. Having that it compiles quickly before launching the API locally to test is saving you valuable time that you can be spending on code.

#### Code Formatting

[Go fmt](https://go.dev/blog/gofmt) I could almost leave this alone by stating that. But to expound a little bit, I've seen formatting of codebases either be something that is vehemently argued or something is just left to whomever so the codebase never gets formatted. With Go fmt you have a community-supported way of formatting your code so that it always looks the same, regardless of where it comes from. Your IDE has support and the command line has a tool for it so you don't have to think about it. This is a bigger deal than you think.

#### Clean yet verbose syntax

Go has a familiar looking syntax. You'll notice things like `{}`, `()` in addition to all the usual looping and control constructs. Comments look like C and C++. The language can be a touch verbose at times but once you get used to it, it makes a ton of sense. Specifically when it comes to error management. Go lacks inheritance but it makes up for it with a robust Interface design as well as favoring to leverage composition for structs which again, once you get wrapped around the patterns make for some clean and powerful code.

The ability to return multiple values. This might seem strange at first but I find it more obvious as to what the `func` is doing instead of building a Class that holds my return object. Take this code:

```csharp
public class SomeClass {
    public String theString;
    public Integer theInteger
}

function SomeFunction() SomeClass {
    return new SomeClass() {
        theString: "ABC",
        theInteger 123
    };
}

```

To me, this isn't nearly as readable as this code

```go
func SomeFunction() (string, int) {
    return "ABC", 123
}

```

It is explicit what the function returns and saves me from havening to build a separate "data carrier" to return my output. Or worse yet, would be to have some kind of "ref" that the inbound value gets changed and mutates some state that is hidden from the client.

#### CDK Support

If you aren't familiar with CDK, [here](https://binaryheap.com/intro-to-cdk/) is a good intro article to get you started.

Building infrastructure as code has so many benefits and using CDK makes that almost enjoyable. Fortunately, Go support for CDK is built right now. You can declare a function that will get built for the correct Lambda architecture by using the GoFunction construct.

```typescript
new GoFunction(this, "TheFunc", {
    entry: path.join(__dirname, "some-path"),
    functionName: "func-name",
});

```

Have a look at the [documentation](https://docs.aws.amazon.com/cdk/api/v2/docs/@aws-cdk_aws-lambda-go-alpha.GoFunction.html) for more CDK options.

The above are just a handful of reasons I love working with Go even outside of Lambdas.

### Operational Experience

#### Bundle Size

Let's go back to bundle size. This matters for a couple of reasons.

1.  Deployment time. The smaller the bundle the quicker to build and deploy. If your bundle is 540MB vs say 13MB that's a lot less time to push your archive up to the Lambda environment
2.  Cold Start. Again, smaller the bundle and fewer dependencies will go a long way to launching your runtime. Go launches super quickly with everything compiled into the binary so you get nice and speedy Cold Starts.

Below is an instance of a Lambda that has a few things going on including dependencies on the AWS SDK for working with DynamoDB and Parameter store yet the bundle size is only 13MB. I like that!

![Bundle Size](/images/func_size.png)

#### Cold Starts

This is such a hot topic in the Serverless world. I've been deploying Lambdas for going on 6 years now in production and I can say that in the beginning, using .NET Core I would get 2 - 4 second cold starts. For async-type operations, this is not the end of the world. But if your event is attached to an API Gateway, do users want to wait that long for your first response? Probably not.

Fast forward years ahead and honestly every language has seen improvements and with the introduction of SnapStart, Java is enjoyable now for these types of use cases. I still prefer to use Go though as the below graph shows 4 days worth of Cold Start latencies on an API Endpoint. The average is just a touch over 500ms which to me is 100% acceptable as the full lifecycle with API Gateway will be under 1 second which meets my personal goal of having things return from an API Endpoint in less than that 1-second threshold.

![Threshold](/images/cold_starts.png)

I attribute this to the nature of Go in that the bundle is small, the dependencies are compiled in and launching the application is just "snappy". I'll be one of the first to jump on the SnapStart train when Go support is provided but for now, I'm happy enough with this.

#### Runtime Complexity

This is super subjective and I debated putting it in but another thing that I love about Lambdas but also don't like is Layers. Layers are a great way to share logic across functions that have a similar purpose. But on the flip side, I find that they can hide things from me and can be a little bit tricky to test.

By using Go, I have my dependencies compiled in so I find that reusable code is shared via a package dependency that I can test locally when I'm doing my building. Again, this is not the biggest thing in the world, but it does feel a little more familiar to me when building functions.

#### Observability

This isn't unique to Go but here is an article I wrote on using [Go with Datadog](https://binaryheap.com/observing-with-aws-lambda-datadog-and-go/) that shows how clean and simple it is to get observability baked right into your functions

### Wrap Up

Coding and Deploying Lambdas is a rewarding journey of not having to focus on things that don't bring value to your customers and end users. By focusing on what matters, you can innovate and iterate on your ideas and not spend time working on things like operational infrastructure or trying to figure out how to build features in perhaps not the most ideal tech stack.

Lambdas and functions give you the smallest level of isolation so that you can focus on that problem and pick the best technology to implement a set of features. By default, I grab for Go for the reasons I showed you above. I know it's not the most popular runtime when choosing how to deploy your Lambda but I hope that this article gives you some things to think about the next time you start a new Function and perhaps choose Go when building your Lambda.
