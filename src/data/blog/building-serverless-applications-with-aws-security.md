---
title: Building Serverless Applications with AWS – Security
author: "Benjamen Pyle"
description: "Building Serverless applications can feel a bit overwhelming when you are first getting started. Sure, Event-Driven Systems have been around for many years but this notion of using managed services to"
pubDatetime: 2023-08-12T00:00:00Z
tags:
  - aws
  - programming
  - serverless
draft: false
---

Building Serverless applications can feel a bit overwhelming when you are first getting started. Sure, Event-Driven Systems have been around for many years but this notion of using managed services to "assemble" solutions vs a more traditional "plugin" style architecture might throw you for a loop. Continuing in the series of Building Serverless Applications with AWS, let's have a look at the "Security" aspect.

## Series Topics

1.  [Data Storage Choices](https://binaryheap.com/building-serverless-applications-with-aws-data/)
2.  [Building the Application (Fargate/Containers vs Lambda)](https://binaryheap.com/building-serverless-applications-with-aws-compute/)
3.  [Handling Events](https://binaryheap.com/building-serverless-applications-with-aws-handling-events/)
4.  [Exposing the API (if there is one)](https://binaryheap.com/building-serverless-applications-with-aws-api/)
5.  Securing it all, including the API
6.  Debugging and Troubleshooting in Production

## Building Serverless Applications - Security

First and foremost, I'm not a security expert. I've spent the bulk of my career in application development and a great deal of time in pre-cloud deployments which meant relying on others to secure data, traffic and application details. I was always responsible for writing code that didn't get abused during a penetration test, as that was the level of the application that I was focused on. However, I think this makes me more than qualified to talk about how someone like me transitioned into building secure Serverless workloads because, in smaller companies, you don't always have the benefit of the additional staff. And the power and beauty of Serverless is that you can build really secure stuff by following AWS best practices when implementing your solutions. That's what I want to look at here. So let's dig in.

## Securing our Serverless API

In the previous article, we walked through building an API with API Gateway that was connected to some Serverless resources. In this article, I want to give you some guidance on how to secure that API, the compute resources and then the database as well. It's important to think about security in a Serverless world not just about one part. As the developer/architect, you are responsible for building something that is protected and appropriate. And with tools and patterns in the IaC space, it's easy enough to do.

Let's take our API and look at the below diagram and see the three parts I just mentioned above.

-   Securing the API
-   Limiting access of the compute platform you chose
-   Guarding the data with encryption

![Security Overview](/images/serverless_security.png)

## Securing API Gateway

When it comes to thinking about securing your API Gateway, my personal opinion is to take the Custom Authorizer Approach. You've got options though. You can use IAM or directly integrate with Cognito. You could also purely use API Keys which **I DO NOT** recommend at all.

The main reason I recommend using a custom authorizer is that it gives you control over what and how you authorize the user's request against your application's requirement. And by using a customer authorizer, you can also cache the results thus saving you time on future requests from the user. And lastly, you can pass context from the authorized user down to your compute so that you can use those details in queries and operations. Things like a customer id or user id so that you don't need to waste operations downstream trying to figure out who is making the request.

### Breaking down the Design

This type of authorizer looks like this:

![API Gateway Authorizer with Golang](/images/api-gateway-authorizer.png)

That's the exploded version of the diagram at the beginning of the article. So to wrap up on the API authorizer, remember these points.

1.  Authorizers can validate against any logic you choose. It is a Lambda function after all and has access to whatever you need to validate the user
2.  The results of the authorizer can be cached for some time so as not to make the same request over and over in a high-traffic situation.
3.  The contents of the authorized user can be passed down into the resources behind the API Gateway. This saves time for those resources to not have to look things up again.
4.  Authorizers are defined at the API level but applied at the VERB or Resource level

For an in-depth look at how to build a Custom Authorizer, with CDK and Golang, [here's an article I wrote a while back](https://binaryheap.com/custom-api-gateway-authorizer-with-golang/). There is also a working example in GitHub that you can clone and run yourself.

## Limiting Access of the Compute Platform

This tends to be a hot topic because, with IaC, you can be as permissive as you like very easily if your deployment account allows you to be. I can't state this strongly enough though. **Only allow access to the operations and resources your compute needs to do its job**. `*` in the `"resources": []` of your CDK or SAM template is **ALMOST** always bad. Notice I didn't say never, because as an architect I can never say never. But almost always feels about right.

I don't want to dive deeply into IAM. As a new Serverless developer, I don't think that's required for you to be effective. [A link to](https://aws.amazon.com/iam/) the AWS IAM documentation does seem appropriate. Now what I do feel is appropriate for you to know are the following things:

1.  Identity vs Resource-Based Policy
2.  Details of a Policy Statement
3.  Limiting access with resource ARN
4.  Understanding the actions of your Service

### Identity vs Resource-Based Policy

This might seem a bit weird at first, but your compute (which for this purpose means any AWS service operating in your architecture) by default can't access other components in your stack. So at the top of the article, the diagram shows a Fargate Container accessing a DynamoDB table. By default when you launch that container, it has no access to DynamoDB. The resource policy will be empty. Therefore you will need to grant permissions to the Fargate Task so that the container can assume those permissions when your service code does some operations against DynamoDB. This is an in-depth topic, but just know for now, that you need to grant what's required.

### Details of a Policy Statement

A Policy Statement is the heart of defining access for your resource. A simple one looks like this:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "Stament ID",
            "Effect": "Allow|Deny",
            "Action": ["service:someAction"],
            "Resource": "arn:the-thing-to-allow-access-to"
        }
    ]
}
```

To take it one step further, granting read access to a DynamoDB table like in the previous section might look like this

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ReadOnlyAPIActionsOnYourTable",
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:BatchGetItem",
                "dynamodb:Scan",
                "dynamodb:Query",
                "dynamodb:ConditionCheckItem"
            ],
            "Resource": "arn:aws:dynamodb:us-west-2:accountId:table/YourTable"
        }
    ]
}
```

-   Sid - just a statement id for the policy. Helps with naming
-   Effect - Allow or Deny. Allow is better as it's easier to me when understanding the explicit actions that are allowed when reading a policy document.
-   Action - The operations your resource would like to perform on another resource. These are specific to that resource. Go find your service in the AWS Docs and learn it. Always structured like `service:operation`. You can grant a `*` in the action as well. Use that sparingly unless you know what you are doing. Rarely every grant `*` on the whole thing. `dynamodb:Get*` is better than `dynamodb:*`
-   Resource - the thing you want to grant these permissions to. It can also be an array but again, limit to what you need. Rarely `*`. And when starting, I'd say **never** do that

## Guarding the data with encryption

And last but surely not least, Guarding Data with Encryption. First off, why does this matter? Well for certain industries, it's required for data to be encrypted at rest and not just in transit. But in general, it's just good practice. And I can tell you from operating systems with reasonable load, throughput and performance are not sacrificed significantly by doing this.

Applying a Key is actually simple. First, you need to define one with KMS and then when you are defining your resource, you can opt-in for encryption and specify that you are bringing a CMK. Customer Managed Key.

### Tip on Key Proliferation

A quick tip on keys. If you define a key per service, you could end with a lot of KMS keys. And you are going to be $1 / month for the key and then some pricing level based upon the number of requests to that key. Now you can't get around the requests part, but I can tell you that if you have a multi-account AWS setup and you have greater than 50 services with their keys, you are going to end up with several $1 / month charges. A better approach is to have a key per use and then go from there.

For instance, maybe a key for databases/filesystems and a key for messaging. This way you can just import the key into your IaC and go from there. Yes, you get more dependencies between your services on "core infrastructure", but you also save a nice chunk of money on not having so many keys. There is no one size fits all, but this is the approach I've become comfortable with. It also tends to reduce the likelihood that a key gets deleted and the data can never be decrypted. That would be bad.

The following items are candidates for encryption based on the things this summer series talks about.

-   DynamoDB Table/Stream
-   SQS
-   SNS
-   Kinesis
-   S3

All of these services will encrypt your data at rest even if it only rests for milliseconds, it's still encrypted. However, now remember, if you encrypt something, your resource will need to be able to decrypt if it's a reader. And it will need to encrypt if it's a writer. Those are actions on KMS and will often look like this:

```json
"kms:Decrypt",
"kms:DescribeKey",
"kms:Encrypt",
"kms:GenerateDataKey*",
"kms:ReEncrypt*",
```

**Forget these and you'll get errors**

## Wrapping Up

This is by no means an exhaustive look at security but it should be enough to get you started. By leveraging these 3 approaches to securing your workloads, you are on your way to building some really good and solid applications. For further and deeper reading, I highly recommend the below links. Some are outside the scope of this article and will apply to Identity Policies, Users, Roles and cross-account stuff, but still worth the reading.

-   [IAM Service Page](https://aws.amazon.com/iam/)
-   [IAM Deeper Resources](https://aws.amazon.com/iam/resources/?nc=sn&loc=4&iam-blogs.sort-by=item.additionalFields.createdDate&iam-blogs.sort-order=desc)
-   [IAM Best Practices](https://aws.amazon.com/iam/resources/best-practices/)
-   [AWS Well-Architected Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)

Next up I will be wrapping the series up with topics on Debugging and Troubleshooting in production. I will have some things in there that point to how to best instrument your Serverless components and also some scenarios I've seen that you will see too as you get going with Serverless. Stay tuned!

And as always, Happy Building!
