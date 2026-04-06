---
title: Cognito Starter Kit with Rust and Lambda
author: "Benjamen Pyle"
description: "Welcome to the Cognito Starter Kit with a large helping of Rust seasoned with some CDK. I'm a big believer in Cognito and the power it gives builders to customize the various signup and authentication"
pubDatetime: 2024-01-27T00:00:00Z
tags:
  - aws
  - cdk
  - programming
  - rust
  - serverless
draft: false
---

Welcome to the Cognito Starter Kit with a large helping of Rust seasoned with some CDK. I'm a big believer in Cognito and the power it gives builders to customize the various signup and authentication workflows. With Cognito, you get a managed service that has flexible usage-based pricing, numerous hooks and configurations and the ability to use OAuth and OIDC in your workflows. Let's dig in on the Cognito starter kit.

## Components of a Cognito Starter Kit

I've written a good bit about Cognito in addition to customizing tokens and building authorizers. You can find those articles below:

-   [Customizing Access Tokens with Rust](https://binaryheap.com/customize-cognito-access-token-with-rust/)
-   [Customizing ID Tokens with Go](https://binaryheap.com/extending-and-customizing-the-jwt-from-cognito-via-aws-lambda-using-go/)
-   [API Gateway Lambda Authorizer with Go](https://binaryheap.com/custom-api-gateway-authorizer-with-golang/)

With this Cognito Start Kit, I'm going to walk through building the below components.

-   Cognito User Pool with Advanced Security Features
-   A pre-authentication token customization Lambda written in Rust
-   An API Gateway Lambda authorizer written in Rust that verifies the JWT supplied by Cognito

## Cognito User Pool

Defining a Cognito User Pool with AWS CDK is a straightforward effort. However, with the new Access Token customization features that were released in December 2023, the CDK L2 construct hasn't caught up yet. I'll walk through how to use the L1 to accomplish what is needed.

So which parts of the User Pool do we need to build? To customize the access token in addition to the ID token, the advanced security features need to be turned on. The Lambda pre-authentication hook needs to be enabled. This has a slight caveat that it's not yet supported by the normal L2 construct so I'll walk through that. Then, an often missed piece is to add a resource policy to the Lambda itself so that Cognito can invoke the Lambda as needed.

### Cognito Construct

For a quick point of clarity, when I say L1 construct, I mean the lowest-level construct that is generated from the CloudFormation resource specification. When I say L2, that's a higher-level construct with abstractions added for easier consumption. L1 constructs begin with `Cfn`. So let's look at the L1 User Pool construct.

```typescript
const cfnUserPool = new CfnUserPool(this, "CfnUserPool", {
    userPoolName: `ExampleUserPool`,
    userPoolAddOns: {
        advancedSecurityMode: AdvancedSecurityMode.AUDIT,
    },
    lambdaConfig: {
        // @ts-ignore
        preTokenGenerationConfig: {
            lambdaArn: props.function.functionArn,
            lambdaVersion: "V2_0",
        },
    },
    policies: {},
});
```

The main 2 things to point out are that I'm enabling the advanced security mode to be able to customize the access token. As a fair word of warning, doing this will incur costs even below the 50,000-user free tier for non-advanced setups.

The second thing is to assign the token customizing Lambda to the configuration. And then to set the `lambdaVerision` to "V2\_0" which enables that advanced payload.

Here's a small tip that I picked up from a GitHub discussion. There's nothing that says you can't convert that L1 INTO an L2 and then work with the higher-level API if you want to. Here's how I'm doing that for futher property settings. Pretty neat trick.

```typescript
this._pool = UserPool.fromUserPoolId(scope, "RefdUserPool", cfnUserPool.ref);
```

## Token Customization

The Cognito start kit includes a fully working Rust implementation of an access and ID token customizer all in one Lambda. One of the nice things about this workflow is that it frees me up from having to use Cognito attributes which can be super limiting. This freedom allows me to express my user profiles with whatever level of data that I desire. For this example, I'm going to use a DynamoDB table with a partition key.

### DynamoDB Table

Nothing fancy with this setup. A pay-per-request table with just a partition key that is encrypted by AWS.

```typescript
// dynamodb table
this._table = new dynamodb.Table(this, id, {
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
    },
    tableName: `SampleUserCustomized`,
    encryption: dynamodb.TableEncryption.AWS_MANAGED,
});
```

### Rust and Lambda Token Customizer Function

I've been [writing](https://binaryheap.com/rust-and-lambda/) more and more about the benefits of Rust and Lambda quite a bit lately and I plan to take advantage of them in this customizer. Additionally, I've leveraged the [Lambda Runtime](https://github.com/awslabs/aws-lambda-rust-runtime) project that includes data structures for the Lambda Events that I'll encounter while working with these payloads.

I'm going to leave the rest of the code in the repository for you to explore but I do want to walk through the logic and uniqueness of this handler.

As with any Lambda handler, I want to use long-lived APIs that were constructed outside of the function execution. I'm setting up an `aws_sdk_dynamodb::Client` to interact with my table to fetch the user profile when the request comes in.

Here's a quick peek at the record.

```json
{
    "id": "USER#ben",
    "user_id": "ben",
    "first_name": "Ben",
    "last_name": "Pyle",
    "interesting_value": "Golf",
    "entity_type": "User"
}
```

This is the data that'll be used to add claims to both of the tokens.

#### Token Handler Code

The handler code itself will take the response from the DynamoDB query and use the `User` to add claims to the tokens.

Once the token Hashmaps have been adjusted, I need to work with the two data structures that are used by the Cognito API to apply the claims to the tokens. `CognitoAccessTokenGenerationV2` and `CognitoIdTokenGenerationV2`

The last piece of the handler code is to build a response and then return that to the invoker.

```rust
async fn function_handler(
    client: &Client,
    table_name: &String,
    mut event: LambdaEvent<CognitoEventUserPoolsPreTokenGenV2>,
) -> Result<CognitoEventUserPoolsPreTokenGenV2, Error> {
    let mut access = HashMap::new();
    let mut id = HashMap::new();
    match event.payload.cognito_event_user_pools_header.user_name {
        Some(ref user_name) => {
            // fetch the user from DynamoDB
            let user = data::fetch_item(client, &table_name, user_name).await?;
            // insert interesting_value into the access token
            access.insert("interesting_value".to_string(), user.interesting_value);
            // insert first_name and last_name into the ID token
            id.insert("first_name".to_string(), user.first_name);
            id.insert("last_name".to_string(), user.last_name);
        }
        None => {
            event
                .payload
                .response
                .claims_and_scope_override_details
                .as_mut()
                .unwrap()
                .group_override_details
                .groups_to_override = vec![];
        }
    }

    // access token customize struct
    let access_token = CognitoAccessTokenGenerationV2 {
        claims_to_add_or_override: access,
        claims_to_suppress: vec![],
        scopes_to_add: vec![],
        scopes_to_suppress: vec![],
    };

    // ID token customize struct
    let id_token = CognitoIdTokenGenerationV2 {
        claims_to_add_or_override: id,
        claims_to_suppress: vec![],
    };

    let ovr = ClaimsAndScopeOverrideDetailsV2 {
        access_token_generation: Some(access_token),
        group_override_details: GroupConfiguration {
            ..Default::default()
        },
        id_token_generation: Some(id_token),
    };

    event.payload.response = CognitoEventUserPoolsPreTokenGenResponseV2 {
        claims_and_scope_override_details: Some(ovr),
    };

    Ok(event.payload)
}
```

#### Rust and Lambda Token Handler Thoughts

What I like most about these new payloads is that I can customize both the ID and access token at one time. For a quick refresher, adding some claims to the access token can speed up the authorization process by not having to fetch key pieces of data needed to perform those authorizations. By sprinkling in key claims to the ID token, the client or UI can alter the user's experience without needing to fetch those additional details.

Those are both upfront costs that I can save in user experience down the line later for 60 minutes or however long I choose to set the expiration on these two tokens.

The last thought I want to explore that you'll see in the repository is that my Rust skills are improving. I'm using the `?` operator in the handler code quite a bit to reduce the need to have nested `match` blocks. I'm doing that by implementing the `From` trait and converting the errors into a custom Error that I defined. This code is in the `models.rs` file.

### Rust and Lambda API Authorizer Function

API Gateway offers a few options for authorizers. There's IAM authorization, Cognito authorization and a custom Lambda authorization. Why would I be building a Rust and Lambda authorizer IF I can make use of native Cognito authorization? That's a really good question and here's the answer. With custom Lambda authorizers I get the ability to add context to my payloads that can be forwarded down to the lower API requests.

Take this example for instance. I'm building a multi-tenant application that uses the user's location or tenant in the queries to the database. I could fetch that data based on the token supplied OR I could parse that data out of the customized access token and then forward those elements to the API. Again, time savings. All of these hops and CPU cycles add up to user experience and if not for the users, what's the point!?

#### Authorizer Initialization Code

I tend to not show init code in articles about Rust and Lambda, but this is worthwhile. I had someone ask me the other day how to handle fetching the keyset needed to verify the signature of the JWT. I do this type of logic in the `main` function because I can reuse the output over and over while not having to hit the jwks URL again.

That code looks like this:

```rust
let keyset = jsonwebtokens_cognito::KeySet::new(region_id, user_pool_id).unwrap();
let _ = keyset.prefetch_jwks().await;
```

#### Authorizer Handler Code

The Cognito starter kit comes together nicely in this authorizer code. By using Cognito, customizing the tokens, doing the authorization and then forwarding context to resulting API calls, I get a fully serverless workflow with the performance of pairing Rust and Lambda.

I found this [crate](https://crates.io/crates/jsonwebtokens-cognito) while working on something else a few weeks back and it makes working with Cognito and JWT super simple.

The handler code is not complex. Let's walk through the steps real quick.

By default, I'm returning `Allow` to the authorizer. I intend to disprove that the request should be allowed. I start by building a verifier from the `client_id`supplied to the handler. This is sourced from an environment variable in the `main` function.

I second pull the token from the payload. I'm OK with `unwrap()` here because if the unwrap fails, the function should fail. API Gateway will always give me the payload I expect.

However, when I try and verify the token, if the value is something garbage that could come from the client, then I'm going to set `allowance` to `Deny`.

If the token is valid, I'm then going to pull claims from the `serde_json::Value` and attach them as context into the response.

```rust
async fn function_handler(
    client_id: &str,
    keyset: &jsonwebtokens_cognito::KeySet,
    event: LambdaEvent<ApiGatewayCustomAuthorizerRequest>,
) -> Result<ApiGatewayCustomAuthorizerResponse, claims::AuthorizerError> {
    let mut allowance = "Allow";
    let mut ctx = serde_json::Value::default();

    let verifier = keyset.new_access_token_verifier(&[client_id]).build()?;
    let token = event.payload.authorization_token.unwrap();
    let claims: Result<serde_json::Value, jsonwebtokens_cognito::Error> =
        keyset.try_verify(token.as_str(), &verifier);

    match claims {
        Ok(c) => ctx = dump_claims(&c)?,
        Err(_) => {
            allowance = "Deny";
        }
    }

    let response = new_response(allowance, ctx);
    Ok(response)
}
```

#### Adding Claims to the Context

I want to show this for completeness. Above I mentioned a function called `dump_claims`. Its sole purpose is to take the claims from the token and then build a small subset that can be passed into the request context for downstream API requests.

```rust
pub fn dump_claims(value: &serde_json::Value) -> Result<serde_json::Value, serde_json::Error> {
    let claim: Result<Claim, serde_json::Error> = serde_json::from_value(value.clone());
    tracing::debug!("(Claim_JSON): {}", value);
    tracing::debug!("(Claim_Struct): {:?}", claim);

    match claim {
        Ok(c) => {
            let pc = PrivateClaim {
                user_name: c.username,
                location_id: c.interesting_value,
            };
            tracing::debug!("(PrivateClaim): {:?}", pc);
            let pc_v = serde_json::to_value(pc)?;
            Ok(pc_v)
        }
        Err(e) => {
            tracing::error!("(Claim_Struct): {:?}", e);
            Err(e)
        }
    }
}
```

#### Rust and Lambda API Authorizer Thoughts

Just like with the Rust and Lambda customizer, I'm able to take advantage of the Rust language's performance and ergonomics to build simple functions that perform amazingly well. Here are a few sample runs when testing from the AWS Console. Those aren't fake and one of them is < 1ms. I'm not [kidding about Rust and Lambda's performance](https://binaryheap.com/rust-and-lambda-performance/).

![Rust Lambda Performance](/images/authorizer_runs.png)

Another thing that I often forget and I'll admit is a bias is to check the optimal memory, speed and cost tuning output. I naturally think, oh, this function needed 24MB of memory, let's give it 128MB. However, the optimal setting for Rust Lambda's is 256MB per my experience.

The [AWS Lambda Power Tuning State Machine](https://docs.aws.amazon.com/lambda/latest/operatorguide/profile-functions.html) agrees.

![Rust Lambda Power Tuning](/images/tuning-scaled.jpg)

## Putting it All Together

What does this look like when the Cognito Start Kit is put together? Let's take a look.

### Cognito

When the User Pool is configured with the pre-authentication Lambda with the V2 payload, it should look like this.

![Cognito Starter Kit V2](/images/cognito_v2.png)

### Customized Tokens

With the Rust and Lambda handler in place, when a user logs in and authenticates via this User Pool, I'm going to get the ID and access token with the claims added from the handler code reviewed above.

**ID Token**

![Cognito Start Kit ID Token](/images/id_token_customized.png)

Note the first\_name and last\_name claims that were added in the code.

And the same thing holds for the access token. Look in the image for the interesting\_value claim that should say Golf.

**Access Token**

![Cognito Start Kit ID Token](/images/acces_token_customized.png)

### Testing the API Authorizer

I didn't include a working API Gateway example in this Cognito starter kit repository but it would be easy to extend this by using a CloudFormation output and then including the authorizer in another project. I did run a few samples with an API Gateway I already had and here are what the screenshots look like for that.

If I supply a valid and non-expired token, here's the output that I'm going to receive.

![Rust Lambda Authorizer Allow](/images/allow.png)

Note the "Allow" in the Effect property.

And if I supply anything invalid, it'll look the same minus the "Effect" value.

![Rust Lambda Authorizer Allow](/images/deny.png)

Note the "Deny" in the Effect property.

## Wrapping Up

First off, here's a link [to the GitHub repository](https://github.com/benbpyle/rust-cognito-starter-kit) that is referenced in this article.

Second, at the end of building this Cognito Starter Kit with Rust and Lambda, I'm starting to feel more productive with Rust. I'm reaching for the docs and Google less and less. The patterns for using enums, errors and traits are starting to be easier to implement. And the borrower checker is starting to be more friend than my annoying door bouncer. Those are all good things in my opinion.

I'm also close to declaring VSCode as my primary editor over Rust Rover. I'm not all the way there yet, but close. I might write something on my Rust development setup at some point.

As for Cognito, it is a super powerful, robust and highly scalable managed service from AWS that gives a builder so much power out of the box. However, I hope I've shown you a nice Cognito starter kit that brings together the power of Rust and Lambda to jump-start your use cases. I've used the product for years and reached for it first as it's AWS native and has all of the features I'm looking for at a price that makes sense. Just remember, customizing access tokens and enabling the audit features do come at a cost. So use it wisely.

I hope this has been helpful and I'm looking forward to more Rust and Serverless content this year! Stay tuned!

Thanks for reading and happy building!
