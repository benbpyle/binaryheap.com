---
title: Building Golang Lambda Functions
author: "Benjamen Pyle"
description: "Golang Lambda functions with CDK explored through entry points, runtime selection, environment variables, and linker flags to reduce binary size."
pubDatetime: 2023-04-26T00:00:00Z
tags:
  - aws
  - cdk
  - golang
  - programming
  - serverless
draft: false
---

Using CDK for building Golang Lambda functions is a super simple process and easy enough to work with. It is [well documented](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-lambda-go-alpha-readme.html) and is a subclass of the `Function` class defined in `aws-cdk-lib/aws-lambda`. Unsure about CDK or what it can do for you? [Have a read here](https://binaryheap.com/intro-to-cdk/) to get started and see what all the fuss is about.

I've written quite a few articles lately that have CDK with TypeScript examples highlighting the build of Golang-based Lambdas. But it dawned on me that I hadn't shown some of the additional capabilities that the `Construct` exposes. I want to walk through the following set of options.

- Entry point
- Runtime selected
- Timeout
- Function Name
- Lambda Environment Definition
- Building Arguments including Build Flags

An example to walk through for the remainder of this article.

```typescript
new GoFunction(scope, "ExampleFuncHandler", {
  entry: path.join(__dirname, "./example-func"),
  functionName: "example-func",
  timeout: Duration.seconds(30),
  bundling: {
    goBuildFlags: ['-ldflags "-s -w"'],
  },
  environment: {
    LOG_LEVEL: "INFO",
    TABLE_NAME: "ExampleTable",
  },
});
```

### Entry Point

```
entry: path.join(__dirname, "./example-func");

```

The entry property on the `GoFunction` tells the construct where to find your `main.go` or "entry" point.

### Runtime

Deploying your Golang Lambda functions after the build provides a couple of options when choosing that runtime environment. Personally, the choice comes down to this:

- Do you want to run default?
- Do you want to have the ability to run [Lambda Extensions](https://docs.aws.amazon.com/lambda/latest/dg/lambda-extensions.html)?

If the answer to either of those is yes, then just stick with the default runtime that the Construct selects. That is going to be the AL2 (Amazon Linux 2). If you were to pick this from the console, it will be in the Custom Runtime options. Keep in mind, that when using AL2, you will need to keep your binary named `bootstrap`.

### Function Name

```typescript
functionName: "example-func",

```

This one is straightforward. My only advice here is to name things with a similar prefix when they fit into a common "application" or grouping.

### Timeout

```typescript
timeout: Duration.seconds(30),

```

Also straightforward. But when building Golang Lambda functions, pay mind to the timeout. This is the `Duration` that you want your function to wait for a response in your code. Don't go too low but also don't go too high. And in your code, always return when you know that you can.

### Lambda Environment Definition

```typescript
environment: {
    LOG_LEVEL: "INFO",
    TABLE_NAME: "ExampleTable",
},

```

Do your best to include parameters that might change in environment variables. If you've got sensitive type information, favor SSM or Secrets Manager but for things like table names or log levels, variables are perfect. With CDK, you can fill these in with functions to fetch log levels or properties on Table constructs for table names.

A simple Log Level function might look like this

```typescript
export const getLogLevel = (stage: StageEnvironment): string => {
  switch (stage) {
    case StageEnvironment.DEV:
    case StageEnvironment.QA:
      return "debug";
  }

  return "error";
};
```

### Build Arguments

One of the things I have missed documenting in all of my articles is this part of the GoFunction construct. When building Golang Lambda functions, you can choose to use your local Golang install or force the build to happen in a Docker container. I tend to not build in Docker due to speed in local builds on my Mac (that's a documented slow thing).

I do however want to recommend using the `goBuildFlags` to trim the size of your executable. You do that like this:

```typescript
bundling: {
    goBuildFlags: ['-ldflags "-s -w"'],
},

```

With Golang, 'ldflags' stand for Linker Flags and that instructs the Golang build tool how to put the binary together. The two flags that I'd recommend are the `-s` and `-w`. Per Golang:

```bash
> go tool link
-s    disable symbol table
-w    disable DWARF generation

```

These two options should shrink your executable by 20 - 25% which has some impact on the following.

- Smaller the binary, the quicker the launch and cold start
- Smaller the binary, the less to copy out to S3 during the CI/CD process

### Wrap Up Building Golang Lambda Functions

CDK has changed the way I build and deploy solutions in AWS. And it's played a big part in my full-on adoption of Golang as my primary language for building Serverless apps. I hope that you picked up a couple of tips. The `ldflags` is the piece that I don't see documented many places and it's an easy drop-in to make some gains in your deploys.
