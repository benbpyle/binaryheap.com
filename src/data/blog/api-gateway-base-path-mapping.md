---
title: API Gateway Base Path Mapping
author: "Benjamen Pyle"
description: Using bath path mapping with AWS API Gateway and CDK
pubDatetime: 2023-01-16T00:00:00Z
tags:
  - aws
  - cdk
  - serverless
draft: false
---

AWS API Gateway is fantastic for sitting in front of AWS resources like load balancers and lambda functions and it's also really great for setting nice domain boundaries around you application code. Let's enhance the API Gateway experience a little more by levering Base Path Mapping

For instance, if you have boundary A with a set of REST operations and a boundary B with another set of REST operations you now end up with 2 API Gateways with their own FQDN to access those resources. But what if you want to have those separate, but also roll them up under a common domain name? This is where using API Gateway Custom Domains and Base Path mapping while turning off the default endpoints is so helpful. Article below is going to be pretty concise but also very specific to this problem and show how to use API Gateway Base Path Mapping with CDK

If you want to jump to the code, here is the [Github repos](https://github.com/benbpyle/cdk-api-gateway-base-path-mapping)

## API Gateway Base Path Mapping CDK Main Stack

For the example below, I'm going to use [CDK with TypeScript.](https://binaryheap.com/intro-to-cdk/) Below is the main app runner. This type `DomainOption` is where I'm storing the details about the Custom Domain Name. You could pull this from SSM, DynamoDB or somewhere else but in this example I'm just hard coding it in for simplicity.

```typescript
#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { MainStack } from "../lib/main-stack";

const app = new cdk.App();

const domainOption = {
  domainName: "sample.binaryheap.com",
  domainNameAliasHostedZoneId: "Z2OJLYMUO9EFXC",
  domainNameAliasTarget: "d-iclyfrt7oc.execute-api.us-west-2.amazonaws.com",
};

new MainStack(app, `MainStack`, {}, domainOption);
```

Below is the setup for the actual resources we need to create in order to have API Gateway Base Path Mapping. I like the create the gateway first and then add the additional Lambda resources into the gateway

```typescript
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { OneLambda } from "./one-lambda";
import { ApiGatewayConstruct } from "./api-gateway-construct";
import { DomainOptions } from "../types/options";
import { StackProps } from "aws-cdk-lib";

export class MainStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps,
    options: DomainOptions
  ) {
    super(scope, id, props);

    const api = new ApiGatewayConstruct(this, "ApiGateway", options);

    new OneLambda(this, "OneLambda", api.api);
  }
}
```

## API Gateway Construct

For a simple solution like this, I tend to just use Constructs vs NestStacks so that's what I'm doing below in this snippet of the file

```typescript
// definition of the RestAPI
this._api = new RestApi(this, "RestApi", {
  description: "Sample API",
  restApiName: "Sample API",
  disableExecuteApiEndpoint: true, // this important to do
  deployOptions: {
    stageName: `main`,
  },
});

let domainName = DomainName.fromDomainNameAttributes(this, "APIDomainName", {
  domainName: option.domainName,
  domainNameAliasTarget: option.domainNameAliasTarget,
  domainNameAliasHostedZoneId: option.domainNameAliasHostedZoneId,
});

// the magic of wrapping the API under the Custom Domain
new BasePathMapping(this, "ApiBasePathMapping", {
  domainName: domainName,
  restApi: this._api,
  // the properties below are optional
  basePath: "my-mapping",
  stage: this._api.deploymentStage,
});
```

Things to note in the above

- disableExecuteApiEndpoint -- this stops anyone using the FQDN created by API Gateway when it was created and forces more consistent access to the API Gateway resources
- basePath - this is what defines the path on the endpoint. For instance, the resources in this example are going to be `https://sample.binaryheap.com/my-mapping`
- state - defines which deployment stage are used. So you can actually have different path mappings based upon how your stages are defined for your API

## Deploying and Output of API Gateway Base Path Mapping

To deploy this, from the root of the project just run `cdk deploy npx ts-node bin/app.ts` That'll create everything that is inside the root stack.

_**note: I first**_ _**create the custom domain and DNS CNAME which you could do inside of this infra but since I'm usually sharing it across stacks, I will do it in another CDK project**_

Once deployed, the API gets created like below

![API Gateway Root level](/images/api_1-1024x213.jpg)

And the base path mapping looks like this

![API Gateway Base Path Mapping ](/images/api_2-1024x616.jpg)

And what's nice about this again is that you can access the endpoints like this

- https://sample.binaryheap.com/my-mapping
- AND NOT https://<api-id>.execute-api.us-west-2.amazonaws.com/main

## Wrap Up

Hopefully this gives you some more options when working and deploying API Gateway. Using API Gateway Base Path Mapping opens up a lot more architectural possibilities
