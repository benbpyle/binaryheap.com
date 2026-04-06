---
title: CDK ASL Definition Extractor
author: "Benjamen Pyle"
description: "I've been working a good bit lately to push testing down when using Step Functions and building some patterns with AWS State Machines Locally. In that same spirit, I'm wanting to be able to create the"
pubDatetime: 2023-04-11T00:00:00Z
tags:
  - aws
  - cdk
  - programming
  - serverless
  - typescript
draft: false
---

I've been working a good bit lately to push testing down when using Step Functions and building some patterns with [AWS State Machines Locally](https://docs.aws.amazon.com/step-functions/latest/dg/sfn-local.html). In that same spirit, I'm wanting to be able to create the State Machine in my local container and that comes from the ASL. However, when using CDK and the builder libraries you don't have an ASL file to work from. So I built this program which I'm calling CDK ASL Definition Extractor which extracts the Definitions from a CDK synth'd CloudFormation file.

I've written a good bit about CDK so if you are looking for some [intro](https://binaryheap.com/intro-to-cdk/) this article is a good place to start. But if you've moved passed that and are looking to further build upon some more advanced patterns, I'll have a follow-up article on how to use the Local Step Functions container in conjunction with this program.

### CDK ASL Definition Extractor Usage

If you just want to jump straight to the README or the NPM package you can do that here:

-   [GitHub Repository](https://github.com/benbpyle/cdk-state-machine-extractor)
-   [NPM](https://www.npmjs.com/package/cdk-asl-definition-extractor)

This is a simple command line utility that takes the CDK Template output and parses through to extract out the `AWS::StepFunctions::StateMachine` resources and then outputs them to the STDOUT so that you can do something with that definition.

#### For usage

**Preview Options**

```bash
❯ cdk-asl-definition-extractor -h
Usage: cdk-asl-definition-extractor [options]

Extract AWS State Machine definitions from CDK generated ASL

Options:
  -V, --version            output the version number
  -f, --file-name   CloudFormation JSON File
  -h, --help               display help for command

```

**Extract ASL**

```bash
cdk-asl-definition-extractor  -f 

```

**The Output**

```json
    [
        {
            "identifier": "",
            "definition": ""
        }
    ]

```

### Wrap Up

Plenty more to come on this and I'll be working to extend/expand its capabilities.
