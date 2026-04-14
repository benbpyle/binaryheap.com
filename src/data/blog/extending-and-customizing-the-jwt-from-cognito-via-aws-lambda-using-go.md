---
title: Extending and Customizing the JWT from Cognito via AWS Lambda using Go
author: "Benjamen Pyle"
description: Cognito JWT customization using Go Lambda triggers lets you add private claims to ID tokens through the PreTokenGeneration user pool trigger.
pubDatetime: 2023-02-04T00:00:00Z
tags:
  - aws
  - cdk
  - cognito
  - golang
  - identity
  - programming
  - serverless
draft: false
---

I've been working a lot lately with Cognito and User Pools in AWS as I've been wanting to migrate and existing app into a serverless Identity and Access provider. The promise of Cognito is this "Implement secure, frictionless customer identity and access management that scales" - AWS

Honestly there are so many identity providers out there. This article won't go into the alternatives and other options out there but will specifically touch upon something that I know was a big question for me when I started with Cognito which was, "how can I customize the private claims in a token?". So let's discuss that a little further

As usual, if you want to skip straight to code, feel free to jump over to the [repository here](https://github.com/benbpyle/cognito-token-customizer)

### The Setup/Problem

One thing I really like about Cognito is that it's serverless which means I don't have to think about running infrastructure, scaling out access or dealing with any underlying software. I'm really working at an API level and interacting with it from an Application and not as much at an administration and support level. Having come from running and scaling servers on something that deals with critical infrastructure in an application like login and credentials this is really appealing. Another nice thing is that it natively supports JWTs which are super nice for handling user's credentials as they flow through the App. You get all of the normal tokens when you sign in as well

- Access
- ID
- Refresh

I'm not going to get into using Amplify or any of the other libraries just yet but there are plenty of additional capabilities you can bolt onto this solution.

Now the issue. Below is an example of the way a token comes across without customizations on it. I'm using the ID token here, because those are our options when working with the token generation triggers. ID tokens work just fine for Authorization and they are nice because they can carry private claims to be used in the app. Think of things that you might want to have at the application level that you don't have to fetch from another endpoint. Things like

- User name/details
- First/Last name
- Perhaps the current logged in "location"
- Maybe even the list of roles if your user permissions are simple enough
- Other details that make future API calls easier

![JWT pre-customization](/images/uncustomized-1024x667.jpg)

The above is the raw token.

### Customizing

So what are the options

User Pool Triggers!

![Cognito trigger settings](/images/Screenshot-2023-02-04-at-10.00.08-AM-1024x613.png)

These are the options at our disposal when customizing the different workflows. If you click on one of those 4 radio buttons, the trigger options below expand. In the case for this article I'm using the Authentication grouping and we are working on the Token Generation Trigger

![Cognito pre authentication trigger](/images/Screenshot-2023-02-04-at-10.02.19-AM-1024x588.png)

So what does that code look like? As with most of my articles I'm going to show you how to do this with Go. Still my favorite language for building software right now and especially for building Lambdas.

First lets look at the CDK code that sets this up. The Lambda first

```typescript
interface TokenCustomizerProps {
  table: ITable;
}

export class TokenCustomizerFunction extends Construct {
  private readonly _func: GoFunction;

  get func(): GoFunction {
    return this._func;
  }

  constructor(scope: Construct, id: string, props: TokenCustomizerProps) {
    super(scope, id);
    this._func = new GoFunction(this, `TokenCustomizerFunction`, {
      entry: path.join(__dirname, `../src/token-customizer`),
      functionName: `token-customizer`,
      timeout: Duration.seconds(10),
      environment: {
        LOG_LEVEL: "debug",
        TABLE_NAME: props.table.tableName,
      },
    });

    // add permissions and event sources
    props.table.grantReadWriteData(this._func);
  }
}
```

The code above is defining the Function that'll support the customizing. I like to add Getters as well for exposing the infrastructure that I can use later on.

Now that there is a Func, it can be used in the User Pool setup

```typescript
const userPool = new UserPool(this, "SampleUserPool", {
  lambdaTriggers: {
    // attaching the lambda
    preTokenGeneration: props.tokenCustomizer,
  },
  userPoolName: "SamplePool",
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
  passwordPolicy: {
    minLength: 12,
    requireLowercase: true,
    requireDigits: true,
    requireUppercase: true,
    requireSymbols: true,
  },
  accountRecovery: AccountRecovery.EMAIL_ONLY,
  removalPolicy: RemovalPolicy.DESTROY,
});
```

This line is what takes care of the attachment `preTokenGeneration: props.tokenCustomizer`\`

Extremely simple to do with CDK.

Now onto doing the customizing. The first thing that took me a bit to figure out was the event that is going to be supplied into the Lambda. I find this to be the thing I google the most when I start with a new event.

Here is a sample event in the project that you can run locally as well

```json
{
  "version": "1",
  "triggerSource": "TokenGeneration_Authentication",
  "region": "us-west-2",
  "userPoolId": "sample-id",
  "userName": "benbpyle",
  "callerContext": {
    "awsSdkVersion": "aws-sdk-unknown-unknown",
    "clientId": "fake-client-id"
  },
  "request": {
    "userAttributes": {
      "sub": "fake-sub",
      "email_verified": "true",
      "cognito:user_status": "CONFIRMED",
      "cognito:email_alias": "fake-email@email.com",
      "name": "cognito:default_val",
      "phone_number_verified": "true",
      "phone_number": "+999-999-9999",
      "email": "fake-email@email.com"
    },
    "groupConfiguration": {
      "groupsToOverride": [],
      "iamRolesToOverride": [],
      "preferredRole": null
    }
  },
  "response": {
    "claimsOverrideDetails": null
  }
}
```

Key thing to note in it

- The `userName` key. That's the field that will be used for looking up additional details in DynamoDB

Now let's look at the Lambda code

```go
func handler(ctx context.Context, e events.CognitoEventUserPoolsPreTokenGen) (events.CognitoEventUserPoolsPreTokenGen, error) {
	log.WithFields(log.Fields{
		"event": e,
	}).Debug("logging out the debug event")

	u, err := svc.GetUser(ctx, e.UserName)
	cod := events.ClaimsOverrideDetails{}
	if err == nil && u != nil {
		cod.ClaimsToAddOrOverride = u.mapToMap()
	} else if err != nil {
		log.WithFields(log.Fields{"error": err}).Error("Error querying dynamodb")
	} else {
		log.Info("No error and nothing found")
	}

	resp := events.CognitoEventUserPoolsPreTokenGenResponse{
		ClaimsOverrideDetails: cod,
	}

	e.Response = resp
	return e, nil
}

```

Breaking this code down

- First is the marshalling of the event shown above
- Notice how I'm using the `e.UserName` to lookup the user
- Then your ability to add private claims comes from the struct `cod := events.ClaimsOverrideDetails{}`
- Then I finalize it with `resp := events.CognitoEventUserPoolsPreTokenGenResponse{ClaimsOverrideDetails: cod}`

The `ClaimsToAddOrOverride` is just a `map[string]string`. You can add anything you want into these claims. In the case of this example I'm adding in the following

```go
func (u *User) mapToMap() map[string]string {
	m := make(map[string]string)

	m["firstName"] = u.FirstName
	m["lastName"] = u.LastName

	return m
}

```

Store whatever you like in the `SampleUsers` DynamoDB table. When you query that data out by userName then you can customize the token with the details you desire. Once that's done and you log back into Cognito, your token will look like this

![JWT post-customization](/images/customized-1024x667.jpg)

### Wrapping Up

As you can see from the above, you've got a lot of control and power over what happens in your User's workflow with Cognito. By extending the ID token with private claims, you have the ability to attach different data that can benefit your downstream services that help them be more loosely coupled and less dependent upon other systems but also can give context so that their requests into other services can be more contextualized as well. It really depends upon your use case

Hope this was helpful and enjoy!
