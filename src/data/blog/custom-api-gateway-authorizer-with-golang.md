---
title: Custom API Gateway Authorizer with Golang
author: "Benjamen Pyle"
description: One of the nice things about building with Serverless is that you can design things in a way that the pieces are composeable. This means that you can put logic cohesively with other like-minded logic
pubDatetime: 2023-04-29T00:00:00Z
tags:
  - aws
  - cdk
  - golang
  - infrastructure
  - programming
  - serverless
draft: false
---

One of the nice things about building with Serverless is that you can design things in a way that the pieces are composeable. This means that you can put logic cohesively with other like-minded logic and then keep things loosely coupled from other components so that things are easy to change without being too fragile. When building an API, you often need an Authorizer of sorts to validate the token that is being supplied. In this article, I'm going to walk through building a custom API Gateway Authorizer with Golang.

## API Gateway Authorizer with Golang

For reference, here is the architecture diagram for what I want to show you.

![API Gateway Authorizer with Golang](/images/api-gateway-authorizer.png)

What the above achieves is the following

- Defines an API Gateway for managing payloads to our resources
- Uses a Lamabda to handle Authorization
- Validates the token against a Cognito User Pool
- Leverages a cache with a custom set TTL to save compute
- Finally, if all is good, allows access to the Protected Resource will also be able to supply overrides into the Claim Context

There is a companion half to this article as well that I'll show you how to extend the JWT that we'll be working with by using Lambdas and DyanamoDB. If you are curious about that, [here's the article to show you how that's done](https://binaryheap.com/extending-and-customizing-the-jwt-from-cognito-via-aws-lambda-using-go/)

## Walking through the Code

### CDK Start with Cognito

To have a Cognito to validate against, we first need to build a Cognito instance as well as a Client to be able to log in.

Defining the UserPool looks like the below. Not much that needs additional explaining so let's move on to the Client.

```typescript
this._pool = new cognito.UserPool(this, "SamplePool", {
  userPoolName: "SamplePool",
  selfSignUpEnabled: false,
  signInAliases: {
    email: true,
    username: true,
    preferredUsername: true,
  },
  autoVerify: {
    email: false,
  },
  standardAttributes: {
    email: {
      required: true,
      mutable: true,
    },
  },
  customAttributes: {
    isAdmin: new cognito.StringAttribute({ mutable: true }),
  },
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireDigits: true,
    requireUppercase: true,
    requireSymbols: true,
  },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

Adding a Client to a UserPool is also straightforward. So many options, but mine below is pretty vanilla. With this client, you can then have a way to login in with the user and do other app development against it. As you'll see later on in the article, I'm just using Postman to pull all this together.

```typescript
this._pool.addClient("sample-client", {
  userPoolClientName: "sample-client",
  authFlows: {
    adminUserPassword: true,
    custom: true,
    userPassword: true,
    userSrp: false,
  },
  idTokenValidity: Duration.minutes(60),
  refreshTokenValidity: Duration.days(30),
  accessTokenValidity: Duration.minutes(60),
});
```

### Build the Authorizer

Now for the "custom" in building a custom API Gateway Authorizer with Golang. The Authorizer is nothing more than a Lambda function. So this could be an import from another stack if you desire. But for simplicity, I've included everything in this one set of infrastructure. If you want to take a deeper dive into CDK and GoFunction, [here's an article that helps you out](https://binaryheap.com/building-golang-lambda-functions/)

#### Function definition in CDK.

```typescript
export class AuthorizerFunction extends Construct {
  private readonly _func: GoFunction;

  constructor(scope: Construct, id: string, poolId: string) {
    super(scope, id);

    this._func = new GoFunction(this, "AuthorizerFunc", {
      entry: path.join(__dirname, `../../../src/authorizer`),
      functionName: "authorizer-func",
      timeout: Duration.seconds(30),
      environment: {
        USER_POOL_ID: poolId,
      },
    });
  }

  get function(): GoFunction {
    return this._func;
  }
}
```

As I mentioned above, a simple GoFunction implementation. The only interesting thing to note is the environment variable for the USER_POOL_ID. Let's take a look at why that matters.

#### Function implementation in Golang

For this example of building a custom API Gateway Authorizer with Golang, I'm going to validate the JWT and add some additional context. Your implementation could be much different which again is why I like this approach. You could have several different authorizers based on need and your Protected Resources do not know about what's happening above them in the call stack.

The first thing I want to show you is how to establish the keyset for the well-known Cognito endpoint. I'm doing this in the `init()` function because I know it'll run once when the Lambda initializes and then I'm "caching" the output in a variable that'll maintain itself across Lambda invocations. Not cold starts, but invocations.

```go
func init() {
    log.SetFormatter(&log.JSONFormatter{
        PrettyPrint: false,
    })

    log.SetLevel(log.DebugLevel)

    region := "us-west-2"
    poolId := os.Getenv("USER_POOL_ID")
    var err error

    jwksUrl := fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/%s/.well-known/jwks.json", region, poolId)
    keySet, err = jwk.Fetch(context.TODO(), jwksUrl)

    if err != nil {
        log.WithFields(log.Fields{
            "error": err,
            "url":   jwksUrl,
        }).Fatal("error getting keyset")
    }
}

```

The `jwksUrl` variable above is [documented](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html) in the AWS Developer guide. And I'm using the `"github.com/lestrrat-go/jwx/jwt"` to represent the `KeySet` that I'll be working with to validate the authenticity and the expiration of the token. Remember the `USER_POOL_ID` variable in the CDK above? This is where it comes into play. Building that well-known endpoint requires the UserPoolId

The next part of this process is to perform the validation. I'm not going to go into the specifics in this article of how this happens but essentially the library is going to:

- Verify the structure of the token
- Verify the signing key matches the algorithm the key used
- Verify the expiration and that the token hasn't expired

That's the nice thing about using a library :) And here's how to invoke it.

```go
bounds := len(event.AuthorizationToken)
token := event.AuthorizationToken[7:bounds]
parsedToken, err := jwt.Parse(
    []byte(token),
    jwt.WithKeySet(keySet),
    jwt.WithValidate(true),
)

```

The output of the `jwt.Parse` will return an `error` if any of the above fails. This means in that case, you can issue a denial. Like this:

```typescript
return events.APIGatewayCustomAuthorizerResponse{
    PrincipalID: "",
    PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
        Version: "2012-10-17",
        Statement: []events.IAMPolicyStatement{
            {
                Action:   []string{"execute-api:Invoke"},
                Effect:   "Deny", // Here is the rejection
                Resource: []string{"*"},
            },
        },
    },
    UsageIdentifierKey: "",
}, nil

```

Notice I'm not returning an error. This is simply going to deny access. A 403 response is not an error so why return one?

And in the case of everything being solid, just return the allow.

```typescript
return events.APIGatewayCustomAuthorizerResponse{
    PrincipalID: "",
    PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
        Version: "2012-10-17",
        Statement: []events.IAMPolicyStatement{
            {
                Action:   []string{"execute-api:Invoke"},
                Effect:   "Allow", // Return Allow
                Resource: []string{"*"},
            },
        },
    },
    Context:            DumpClaims(parsedToken),
    UsageIdentifierKey: "",
}, nil

```

I also want to highlight that `DumpClaims` function. What does that do?

One of the cool things about Lambda Authorizers is that you can extend what gets sent along as "context" to downstream parties. What if you wanted to carry parts of the token down to the intended destination? The request will send along the details that are public to the JWT, but private claims, or things you extended aren't going to be passed along. Maybe a customerId? Maybe some roles?

```go
func DumpClaims(token jwt.Token) map[string]interface{} {
    m := make(map[string]interface{})

    m["customKey"] = "SomeValueHere"

    return m
}

```

For this article, it's simple, I'm just adding a `customKey` into the context. I'll show you how that shows up shortly.

### CDK The Protected Resource

Half the fun of building a custom API Gateway Authorizer with Golang is over. That just means the other half is about to start! What do we do now that we've got an authorizer in place? Put a Protected Resource behind it of course!

```typescript
constructor(scope: Construct, id: string, func: IFunction) {
    super(scope, id);

    const authorizer = new TokenAuthorizer(this, "TokenAuthorizer", {
        authorizerName: "BearTokenAuthorizer",
        handler: func,
        resultsCacheTtl: Duration.minutes(5),
    });

    this._api = new RestApi(this, "RestApi", {
        description: "Sample API",
        restApiName: "Sample API",
        deployOptions: {
            stageName: `main`,
        },
        defaultMethodOptions: {
            authorizer: authorizer,
        },
    });
}

```

That is the API Gateway CDK code. Notice in the `defaultMethodOptions` that I'm adding an "authorizer". It's just a `IFunction`. Which again could be an import or in our case, it's the Authorizer we just built.

Now with an API, we can create a Resource.

```typescript
constructor(scope: Construct, id: string, api: RestApi) {
    super(scope, id);

    this._func = new GoFunction(this, `ProtectedResource`, {
        entry: path.join(__dirname, `../../../src/protected-resource`),
        functionName: `protected-resource-func`,
        timeout: Duration.seconds(30),
    });

    api.root.addMethod(
        "GET",
        new LambdaIntegration(this._func, {
            proxy: true,
        })
    );
}

```

For our example, I'm using a Lambda Proxy Integration and defining it at the "root" level. So we can expect a GET request on the "/" path.

The actual handler for this endpoint is again a simple demonstration.

```go
func handler(ctx context.Context, event events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {

    success := &Response{
        Message:   "Congrats! A Payload",
        CustomKey: event.RequestContext.Authorizer["customKey"].(string),
    }

    b, _ := json.Marshal(success)
    return &events.APIGatewayProxyResponse{
        Body:       string(b),
        StatusCode: 200,
        Headers: map[string]string{
            "Content-Type": "application/json",
        },
    }, nil

}

```

Notice the use of the `customKey` and the `event.RequestContext.Authorizer["customKey"].(string)`. This event.RequestContext.Authorizer holds a \`map\[string\]interface{} that you can use to your advantage.

Use cases are endless, but I use it a lot for customer details and user roles and profile data that I've extended.

## Putting it All Together

Let's put together the output of a custom API Gateway Authorizer with Golang. For that, here's the scenario for testing this all together.

### First Thing

In a bootstrapped account:

```bash
cdk deploy

```

### Create a Cognito User

Once the infrastructure is deployed, you should have

- 2 Lambdas
  - Authorizer
  - ProtectedResource
- API Gateway
  - One endpoint to the ProtectedResource with the Authoirzer attached
  - An Authorizer
  - A Deployed Stage
- A Cognito UserPool

Here is what your UserPool should look like

![UserPool](/images/user_pool.jpg). Notice the User Pool ID (I've cleared mine for reasons). You'll want to copy that ID as it'll matter later.

Now the Client List ![ClientList](/images/client_list.jpg)

The ClientID in that table will be important too. Again, mine's cleared out, but take note of yours.

Last, create a user and mark them as verified.

![CreatedUser](/images/users.jpg)

Mark down their password as we are going to use the Password Flow to login in a minute

### Tour the API Gateway

For our main Protected Resource, this is how it gets created

![Protected Resource](/images/protected_resource.jpg)

The Authorization field points at the BearerTokenAuthorizer we defined way up at the beginning of this article.

And then that Authorizer is defined on the API Gateway as such. Keep in mind, if you use [Base Path Mapping](https://binaryheap.com/base-path-mapping-with-cdk/) as defined in this article, and are sharing the Authorizer, you'll need to attach it for each of your API Gateways.

![Authorizer API Gateway](/images/authorizer.jpg)

### Executing the Request

We are finally ready to run this thing.

But first, let's snag a token. Remember I said to capture the ClientID in the UserPool? Now's the time to bring that out.

![Get Token Request](/images/get_token.jpg)

The output of this is going to be your three tokens.

- Access Token
- ID Token
- Refresh Token

Feel free to use either the ID or the Access in the next request.

Making the request is simple.

#### Failure Request

First, let's see what happens with a Bad Token

Postman request

![Bad request](/images/resource_failure.jpg)

And your Logs in CloudWatch should look like this

![Failure Cloudwatch](/images/authorizer_failure.jpg)

#### Successful Request

Now for success!

Postman request

![Good request](/images/success_call.jpg)

And your Logs in CloudWatch should look like this

![Failure Cloudwatch](/images/resource_success.jpg)

You've done it!

### Testing this Locally with Sample Events

I'd be remiss if I didn't include that you can also do some local testing of the authorizer. This can happen in 2 ways

1.  Some Unit tests
2.  Using a test event file

#### Running the Local File

If you execute `cdk synth` locally on this stack, you'll end up with a `MainStack.template.json` in the `cdk.out` directory. You can run the test file included in the repos like this

```bash
sam local invoke AuthorizerFunc -t cdk.out/MainStack.template.json --event src/authorizer/test-events/e-1.json --env-vars environment.json --skip-pull-image

```

## Wrapping Up

That was a long article with a lot of details but this pattern is so helpful when building secure and scalable APIs with Serverless technologies. By adding a custom API Gateway Authorizer with Golang, you can capture this authorization logic high up the stack this saving downstream resources from having to deal with this repetitive code. In addition, but leveraging the context of the event to your downstream Lambda, you can make use of the PrivateClaims that you might have customized.

If you want to see all of this for yourself so you can run it locally, [visit my GitHub repository](https://github.com/benbpyle/cdk-api-gateway-authorizer)

As always, thanks for reading and hope this helps you build some more cool Serverless Apps!
