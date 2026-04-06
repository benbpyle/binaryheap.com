---
title: Customize a Cognito Access Token with Rust
author: "Benjamen Pyle"
description: Identity and Access Management is a critical part of any application. And having a solution that provides customization can also be super important. Take for instance the ability to customize a Cognit
pubDatetime: 2023-12-30T00:00:00Z
tags:
  - aws
  - programming
  - rust
  - serverless
draft: false
---

Identity and Access Management is a critical part of any application. And having a solution that provides customization can also be super important. Take for instance the ability to customize a Cognito Access token to extend functionality.

So many times developers and architects try and roll their own solution and while they do their best to meet OAuth and OIDC specifications, they just tend to fall short. Not to mention they end up with more maintenance and scaling issues than they planned. By leveraging a Serverless Identity Platform like Cognito, developers and architects gain a piece that takes care of the heavy lifting of identity and access for a user base of 1 to essentially as many as needed.

However, until very [recently](https://aws.amazon.com/about-aws/whats-new/2023/12/amazon-cognito-user-pools-customize-access-tokens/) a gap in functionality that honestly allowed some insecure usage existed. Developers were using ID tokens as Access tokens because only those tokens could be customized within a Cognito sign-in workflow. That is no longer the case, as Access tokens can now be customized. I want to take a look at how to customize a Cognito Access Token with Rust.

> AWS' Cognito allows you to implement frictionless customer identity and access management that scales
> 
> AWS

## Design

Cognito offers a variety of hooks to plug into. These hooks give me options to customize just about every part of the process from

-   Sign-up
-   Authentication (Pre and Post)
-   Custom Authentication
-   Messaging templates, locales and content

![Cognito Customization](/images/Screenshot-2023-02-04-at-10.00.08-AM.png)

For the sake of this article, I'm going to look at the Authentication PreToken Generation hook. The below diagram outlines what an authentication flow might look like.

The client attempts to authenticate with Cognito. As the client is authenticating, I can customize the JWT tokens that are created and then supply tokens to Resource Servers in my API that need to understand who is making these requests.

![Customize a Cognito Access Token  Rust](/images/Authentication.png)

## Customize a Cognito Access Token with Rust

Up until recently as I linked out to above, Cognito only allowed customization to the ID token. On the surface, this might seem OK, but it's a really big security miss. [Auth0](https://auth0.com/blog/id-token-access-token-what-is-the-difference/) has a nice article explaining why this is not such a good idea.

In a nutshell, the ID token is part of the OIDC specification and its purpose is to provide ID type information to the client. The user has been authenticated and the client can then use this information to customize the UI on the user's behalf. The `aud` claim should be present to indicate the intended client that would do this customization. The token CAN be used for passing to a resource server, but that's not its purpose.

Contrast that with the Access token whose purpose is to show that the user has been authorized to make the requests that they are making. Access tokens contain scopes that can be used to validate the client's access when making requests to the resource server. Additionally, and with more complexity, sender constraints can be applied to Access tokens thus further restricting their usage.

Think of it this way.

-   The ID token is for the client
-   The Access token is for the server(s)

### Version 1 and 2 Payloads

With the new capability to customize Access tokens, I need to pick which Token workflow I want to leverage with Cognito. To enable Access token customization, the Advanced Security Features option on the User Pool must be checked. [Here is](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-advanced-security.html#cognito-user-pool-settings-advanced-security.title) some more detail on exactly what this enables and what it all means.

As for payloads, the standard Version 1 request/response has the below shape. Note that there is no mention as to whether I'm able to adjust an ID token or an Access token. The `claimsOverrideDetails` is allowing me to shape the claims on the ID token. Let's contrast that with Version 2.

```json
{
    "request": {
        "userAttributes": { "string": "string" },
        "groupConfiguration": {
            "groupsToOverride": ["string", "string"],
            "iamRolesToOverride": ["string", "string"],
            "preferredRole": "string"
        },
        "clientMetadata": { "string": "string" }
    },
    "response": {
        "claimsOverrideDetails": {
            "claimsToAddOrOverride": { "string": "string" },
            "claimsToSuppress": ["string", "string"],
            "groupOverrideDetails": {
                "groupsToOverride": ["string", "string"],
                "iamRolesToOverride": ["string", "string"],
                "preferredRole": "string"
            }
        }
    }
}
```

Version 2 includes a new field in the request section which is defined as `scopes`. These are the actual scopes that the user has defined on their account. Additionally, in the response, there is a section for ID and Access token customization. I like this very much as I can now add shape to both tokens which benefits my Client and my Servers all with the same payload.

I also have the ability now to suppress scopes as well as add scopes on the Access token. On top of that, I can do the same to the Access token as in the ID token by suppressing claims that Cognito might be adding on by default.

```json
{
    "request": {
        "userAttributes": {
            "string": "string"
        },
        "scopes": ["string", "string"],
        "groupConfiguration": {
            "groupsToOverride": ["string", "string"],
            "iamRolesToOverride": ["string", "string"],
            "preferredRole": "string"
        },
        "clientMetadata": {
            "string": "string"
        }
    },
    "response": {
        "claimsAndScopeOverrideDetails": {
            "idTokenGeneration": {
                "claimsToAddOrOverride": {
                    "string": "string"
                },
                "claimsToSuppress": ["string", "string"]
            },
            "accessTokenGeneration": {
                "claimsToAddOrOverride": {
                    "string": "string"
                },
                "claimsToSuppress": ["string", "string"],
                "scopesToAdd": ["string", "string"],
                "scopesToSuppress": ["string", "string"]
            },
            "groupOverrideDetails": {
                "groupsToOverride": ["string", "string"],
                "iamRolesToOverride": ["string", "string"],
                "preferredRole": "string"
            }
        }
    }
}
```

### Customizing with Rust

Customizing a Cognito Access Token with Rust is a straightforward task. I wrote a more extensive [article](https://binaryheap.com/extending-and-customizing-the-jwt-from-cognito-via-aws-lambda-using-go/) on extending with Golang that is worth checking out to see a more in-depth workflow. I didn't want to recreate that article just to highlight Rust, so in this one, I wanted to focus a little more specifically on the new Access token capability.

If you are building Rust applications that are deployed in Lambdas, it's well worth your time to check out this [AWS project](https://github.com/awslabs/aws-lambda-rust-runtime). And nestled inside that repository is a Lambda Events [crate](https://docs.rs/aws_lambda_events/latest/aws_lambda_events/) that helps with the serde/deserde of different payloads to be encountered when running Lambdas.

For the use case of working with Version 2 payloads from Cognito, I'm making use of the following Lambda Event structs.

```rust
use aws_lambda_events::cognito::{
    ClaimsAndScopeOverrideDetailsV2, CognitoAccessTokenGenerationV2,
    CognitoEventUserPoolsPreTokenGenResponseV2, CognitoEventUserPoolsPreTokenGenV2,
    CognitoIdTokenGenerationV2, GroupConfiguration,
};
```

The above structs will allow me to work with the incoming and outgoing payload that the User Pool PreToken Generation requires.

I'm not going to be too fancy at the moment in this handler as I'm keeping things right in front to highlight the functions.

To customize the Access token's claims, I need to build a HashMap to supply into the `CognitoAccessTokenGenerationV2`. That struct then is part of an `Option<>` field called `access_token_generation` on the `ClaimsAndScopeOverrideDetailsV2`.

After that, I'm returning the customized payload to support the function's return type of `Result<CognitoEventUserPoolsPreTokenGenV2, Error>`.

Check the comments inline of the code for more details on the payload.

```rust
async fn function_handler(
    mut event: LambdaEvent<CognitoEventUserPoolsPreTokenGenV2>,
) -> Result<CognitoEventUserPoolsPreTokenGenV2, Error> {
    let mut m = HashMap::new();
    m.insert("newKey".to_string(), "newValue".to_string());

    // build the access token overrides
    // claims_to_add_or_override:  HashMap that allows for filling in
    //  values that should be customized as a part of the Access Token
    // claims_to_suppress:  List of claims that should be suppressed from
    //  the Access Token
    // scopes_to_add:  List of scopes that should be added to the Access Token
    // scopes_to_suppress:  List of scopes that should be suppressed from
    //  the Access Token
    let access_token = CognitoAccessTokenGenerationV2 {
        claims_to_add_or_override: m,
        claims_to_suppress: vec![],
        scopes_to_add: vec![],
        scopes_to_suppress: vec![],
    };

    let ovr = ClaimsAndScopeOverrideDetailsV2 {
        access_token_generation: Some(access_token),
        group_override_details: GroupConfiguration {
            ..Default::default()
        },
        id_token_generation: Some(CognitoIdTokenGenerationV2 {
            ..Default::default()
        }),
    };

    event.payload.response = CognitoEventUserPoolsPreTokenGenResponseV2 {
        claims_and_scope_override_details: Some(ovr),
    };

    Ok(event.payload)
}

```

### Customized Output

With the Lambda deployed and the PreToken Trigger assignment in the User Pool, logging into Cognito will yield an access token with the customized `newKey`. The `token_use` claim shows that I have successfully customized an Access token.

```bash
Token claims
------------
{
  "auth_time": 1703864589,
  "client_id": "<client-id>",
  "event_id": "d7da6e13-152c-4e8b-bae5-cbf78a280efd",
  "exp": 1703868189,
  "iat": 1703864589,
  "iss": "https://cognito-idp.us-west-2.amazonaws.com/<pool-id>",
  "jti": "53ce6d37-611f-430e-a2d8-04178d7e693f",
  "newKey": "newValue",
  "origin_jti": "f8d80a56-4aa6-4d1f-84a7-96934bbe85e3",
  "scope": "aws.cognito.signin.user.admin",
  "sub": "0bf9631d-4597-45a5-a606-6a0ea9f386ca",
  "token_use": "access",
  "username": "<user-name>"
}
```

## Wrapping Up

I am beyond excited about this new feature that allows me to customize the Access token. The most prominent two examples I can think of using this for are:

-   Scope adjustments
-   Support multi-tenancy by adding a tenant field in the claims.

By having just the right amount of data in the Access token, I can now avoid using the ID token incorrectly and additionally save myself the extra hop to request the ID token from the OIDC server when needing to gain access to the client's tenant. In my book, that's a win-win scenario.

By customizing a Cognito Access token with Rust, I gain all of the performance and safety benefits that Rust provides. But what does the performance mean? The below image shows a cold start customization. 1.47ms of processing time with a total of 25ms meaning that my cold start was just over 23ms. Amazing performance.

![Cold Start](/images/cs_rust.jpeg)

Lastly, as of this writing, the above Rust structs haven't been released to version 0.14.0 of the Lambda Events crate but they should be soon. Once they are out there, I'll provide an updated copy of this article with a working repository as usual.

Until then though, thanks for reading and Happy Building in the New Year!
