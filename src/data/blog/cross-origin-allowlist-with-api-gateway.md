---
title: Cross-Origin Allowlist with API Gateway
author: "Benjamen Pyle"
description: "Cross-Origin Resource Sharing is a topic that most developers don't generally like to talk about it. It is usually a higher-level item that \"is just in place\" when building and shipping APIs. However,"
pubDatetime: 2023-04-01T00:00:00Z
tags:
  - aws
  - cdk
  - golang
  - programming
  - serverless
draft: false
---

### Cross-Origin Allowlist with API Gateway

Cross-Origin Resource Sharing is a topic that most developers don't generally like to talk about it. It is usually a higher-level item that "is just in place" when building and shipping APIs. However, allowing `*` is not always the best approach. That is a touch outside of this article but I do want to walk through how to build a Allowlist of domains approach with API Gateway and Lambda.

So what is Cross-Origin Resource Sharing (CORS)? Mozilla defines it like below:

> Cross-Origin Resource Sharing (CORS) is an HTTP-header based mechanism that allows a server to indicate any origins (domain, scheme, or port) other than its own from which a browser should permit loading resources. CORS also relies on a mechanism by which browsers make a "preflight" request to the server hosting the cross-origin resource, in order to check that the server will permit the actual request. In that preflight, the browser sends headers that indicate the HTTP method and headers that will be used in the actual request. -- [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

As a developer, why does this matter? What does it mean to have a domain request a resource from another domain? If you are building an application in Angular, React, Vue etc and you have an API that is providing information operations via GraphQL or REST, you hopefully have some authorization and authentication in place to protect those resources. But additionally, limiting even before the resource request you are exposing is just a nice extra step of security that you can provide to limit the surface area of exposure.

And not to get too focused on the CORS aspect itself but your browser is going to make a Pre-Flight request via the OPTIONS verb to validate that the domain that's requesting to make the call is allowed to make that call. When the browser sends the request, it will include a Header with the \`Origin\` of the domain requesting and then in the response of that request, there should be an \`Access-Control-Allow-Origin\` response Header in addition to either a 200 (Success) or 400/500 (Failure) response returned.

#### API Gateway's Default

When enabling CORS on a resource via the AWS Console, you will only be allowed to enter 1 domain that you allow. It even defaults to the `*` which will allow all domains to access this resource. Notice the warning icon next to the input, that's precisely what it is saying.

![CORS API Gateway Default](/images/cors_default.png)

Going back to the above, using a "Allowlist" will allow just the right domains to be able to access the resources desired.

#### Constructing a Cross-Origin Allowlist with API Gateway

As with almost everything I'm doing these days with AWS IaC, let's take a look at some CDK with TypeScript. Feel free to checkout the [Github repository](#github-repos) to follow along.

The below example is going to build up the following:

-   Sample API Gateway
    -   One endpoint
        -   GET (MockIntegration)
        -   OPTIONS (LAMBA\_PROXY)
-   Go Lambda which handles the CORS requests and matches the domain against - SSM Parameter which defines the "Allowlist" the Allowlist
-   A Role for API Gateway to use when Executing the CORS Lambda

_All of this would work great if just as a standalone repository without an API Gateway so that other APIs could import this into their project. This is just demonstrating how to use it with a sample API Gateway_

#### Creating the Allowlist in Parameter Store

```typescript
export default class SystemManagerConstruct extends Construct {
    private readonly _parameter: StringParameter;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        // StringParameter that has the allowed origins
        //   Localhost stuff is good for local dev
        this._parameter = new StringParameter(scope, "CorsParameter", {
            parameterName: "/cors/ALLOWED_ORIGINS",
            stringValue: `["http://localhost:8000","http://localhost:19006","https://your.custom.domain"]`,
        });
    }
}

```

I'm using Paramater Store for this, but it could easily be a static field in the Lambda, a DynamoDB table, an environment variable or pretty much any other place that you want it. I just find that putting it somewhere outside of the environment allows a little more privacy and control over the field.

#### Constructing the CORS Lambda

Below is a pretty simple Lambda written in Go that handles

-   Fetching the Parameter
-   Parsing and Comparing the Origin vs the allowlist
-   Returning:
    -   500 - unable to parse or fetch
    -   400 - no match to the origin
    -   200 - all good and return

First the Infra

```typescript
constructor(scope: Construct, id: string, props: FuncProps) {
    super(scope, id);
    this._corsFunc = new GoFunction(scope, `CorsLambdaFunction`, {
        entry: path.join(__dirname, `../../../src/cors-function`),
        functionName: `cors`,
        timeout: Duration.seconds(10),
        environment: {
            IS_LOCAL: "false",
            LOG_LEVEL: "debug",
        },
    });


    // Make sure to allow the lambda access to the Parameter
    // Be very specific with your IAM Policies.
    //  -  Don't grant too much
    //  -  Limit to the right resources
    const ssmPolicy = new PolicyStatement({
        resources: [
            `arn:aws:ssm:${props.region}:${props.accountNumber}:parameter/cors/ALLOWED_ORIGINS`,
        ],
        actions: ["ssm:GetParameters", "ssm:GetParameter"],
        effect: Effect.ALLOW,
    });

    this._corsFunc.addToRolePolicy(ssmPolicy);

    // Just a tag to help with version tracking
    Tags.of(this._corsFunc).add("version", props.version);
}

```

Now a quick peek at the Lambda code that compares and returns. At the bottom of this article is the full [Github repository](#github-repos) that you can pull and checkout.

```go
// Make sure to return the right details
//  Origin
//  Allowed Methods
//  Allowed Headers
for _, v := range allowedOrigins {
    if v == val {
        return events.APIGatewayProxyResponse{
            StatusCode: 200,
            Headers: map[string]string{
                "Access-Control-Allow-Origin":      v,
                "Access-Control-Allow-Headers":     "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods":     "GET, PUT, PATCH, DELETE, POST, OPTIONS",
                "Access-Control-Allow-Credentials": "true",
            },
        }, nil
    }
}

```

#### Deployed Sample API

Once the infrastructure is deployed, there will be a sample API Gateway with the CORS function attached to the `/` path.

![ Cross-Origin Whitelist with API Gateway](/images/api_lambda_cors.png)

Notice that the `OPTIONS` request is a Lambda Proxy Integration. With the default CORS setup, the Console will create a MockIntegration. What this means is that for every request to your path, the verb with OPTIONS is going to run the Lambda that is deployed. Using this approach makes it useful for running across different APIs. It is more of a core infrastructure-type item.

And when paired with things like [Base Path Mapping](https://binaryheap.com/base-path-mapping-with-cdk/), the core infrastructure starts to construct some powerful building blocks for teams to work with.

### Wrapping Up

Creating a Cross-Origin Allowlist with API Gateway is useful for restricting the domains that are allowed to access API resources. By leveraging techniques used in building normal endpoints, a Lambda can be used to manage the allowlist and handle the return of the necessary headers.

#### Github Repos

The code above in this article is available at this [Github repository](https://github.com/benbpyle/api-gateway-cors-allowlist). Feel free to pull it down and deploy it. There's a Makefile included so that you can perform a few operations

```bash
build:
    cdk synth

deploy-local:
    make build
    cdk deploy

test-success:
    make build
    sam local invoke CorsLambdaFunction -t cdk.out/CorsAllowlist.template.json --env-vars environment.json --event src/cors-function/test-events/api-origin.json

test-failure:
    make build
    sam local invoke CorsLambdaFunction -t cdk.out/CorsAllowlist.template.json --env-vars environment.json --event src/cors-function/test-events/api-no-origin.json

```

If you choose to deploy the infra, you can test out the API with cURL or Postman to see it in action. Don't forget to include the `Origin` header!
