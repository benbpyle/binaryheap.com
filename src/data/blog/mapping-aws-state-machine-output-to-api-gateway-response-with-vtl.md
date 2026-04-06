---
title: Mapping AWS State Machine output to API Gateway response with VTL
author: "Benjamen Pyle"
description: Mapping AWS State Machine output to API Gateway response with VTL
pubDatetime: 2023-01-27T00:00:00Z
tags:
  - aws
  - programming
  - serverless
draft: false
---

This is a continuation of a previous article I wrote regarding zero code workflows creating [Cognito users with Step Functions](https://binaryheap.com/z6ua). Part of using State Machines with API Gateway is the dealing with the response and potentially VTL mapping

Goals of this article are to document some of the tips and things that I picked up along the way.

### Is Failure really Success?

I wanted to be able to have a state machine indicate that it processed successfully regardless of whether the Cognito user was created or it had to be rolled back. I made the decision both of those warranted a clean run of the state machine since it was being executed via API Gateway. But where I got stuck was how to return back to the client/caller that the workflow actually did fail and that the input was bad and that a status code of 400 BAD REQUEST was appropriate. This is where API Gateway VTL Mapping with State Machine responses really comes into play.

Success is show below

![Cognito user creation step function state machine](/images/Screenshot-2023-01-27-at-10.42.30-AM.png)

Success Flow

And now the failure

![State machine failure](/images/Screenshot-2023-01-27-at-10.41.56-AM-1.png)

So my concern now becomes, how do I let the client know

### Outputs from the State Machine

First off on the success, I'm returning the output like this

```json
{
  "response": {
    "statusCode": 200,
    "body": {
      "firstName": "Sample",
      "lastName": "User",
      "emailAddress": "sample@user.com",
      "userId": "1000125"
    }
  }
}
```

As you can see, it's a pretty full object that has the input supplied from the API Gateway request. Additionally, it contains what I really want which is the auto-generated User ID. I'm going to use that in my client

Second, the failure

```json
{
  "response": {
    "message": "error creating user",
    "statusCode": 400
  }
}

```

### API Gateway VTL Mapping State Machine Response?

With API Gateway you have the option to do incoming request mapping as well as outgoing response mapping. Articles I learned from when working on this

-   [API Gateway Data Mapping](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-data-transformations.html)
-   [Mapping Variables and Functions](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#util-template-reference)
-   [Overrides](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-override-request-response-parameters.html)
-   [VTL (Velocity Template Language)](https://velocity.apache.org/engine/2.0/vtl-reference.html)

The raw output from my State Machine actually has quite a bit more details about the execution such as billing time, execution id, inputs and outputs. For this example I'm interested in outputs but you could also use the execution id for debugging and tracing

With VTL I can select out the output like this

```
#set ($parsedPayload = $util.parseJson($input.path('$.output')))
```

Now I've got a variable called `$parsedPayload` which holds a JSON object that I can query via JSONPath

Through that mechanism combined with VTL I'm going to override the response status code to 400 BAD REQUEST when the state machine tells me too and when it's successfully I just return the output about the user

```
#if($parsedPayload.response.statusCode == 400)
#set($context.responseOverride.status = 400)
{
    "message": "$parsedPayload.response.message"
}
#else
{
    "firstName": "$parsedPayload.response.body.firstName",
    "lastName": "$parsedPayload.response.body.lastName",
    "emailAddress": "$parsedPayload.response.body.emailAddress",
    "userId": "$parsedPayload.response.body.userId"
}
#end
```

### Wrap Up

Continuing with the theme of pushing code and behavior into the infrastructure puts the ownership of operation on the Cloud Provider. In this case, AWS. By doing this, I only spend time writing code that I HAVE to write and spend less time worrying/managing the code/operations that AWS can run for me. Using API Gateway's VTL Mapping with State Machine responses helps achieve just that.

By using Step Functions, Intrinsic Functions, API Gateway with VTL and JSONPath you get a highly scalable and robust solution without having to write code
