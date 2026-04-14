---
title: Creating an AWS Cognito User with an Auto-Incrementing ID using AWS Step Functions
author: "Benjamen Pyle"
description: Creating a Cognito User with AWS Step Functions native SDK integrations
pubDatetime: 2023-01-25T00:00:00Z
tags:
  - aws
  - cdk
  - programming
  - serverless
draft: false
---

So there are a couple of interesting topics in here.

1.  I've been really leaning into code-less workflows with AWS Step Functions and this State Machine has nothing but native SDK integrations which include
    - DynamoDB (Put, Delete, Get)
    - Cognito/User Pools (AdminCreateUser)
2.  I've run into some legacy code that requires a Username to be a bigint and I don't want to use an RDBMS so I'm using DynamoDB to generate one for me while also being "race condition" proof

As always, if you want to jump straight to the code, here is the [Github repository](https://github.com/benbpyle/cdk-user-creation-auto-id)

## The Output (Final State Machine)

![Cognito create user state machine](/images/Screenshot-2023-01-25-at-4.34.07-PM-1024x888.png)

What I'd like to do is walk through the State Machine touching upon the parts of each step and stitch this together into the diagram above.

### Find Last Id

First off, this idea took inspiration from the article over at [Bite-sized Serverless.](https://bitesizedserverless.com/bite/reliable-auto-increments-in-dynamodb/)

In my scenario, I need to be able to create a user with a BigInt as the username. Sounds strange and I'd love to be able to use a UUID, KSUID or ULID but in the system that I'm building this for, we have some legacy parts that force the BigInt value.

In order to not have to rely on an RDBMS and leverage DynamoDB instead, I'm working off of using a row in the table to hold the "LastId" that cant be updated and used to build these users. We could fail into a race condition where two process are trying to update the record at the same time, but by using Optimistic locking I'm going to avoid that issue and just force a retry of the process. DynamoDB does a really good job of this and I've used this pattern in a lot of other places at scale with great success.

The table itself uses the patterns that I learned about from Alex DeBrie on [Single Table Design](https://www.alexdebrie.com/posts/dynamodb-single-table/)

Using a simple `PK` and `SK` structure I'm overloading the table by putting multiple Entities in it. One such entity is the `USERMETADATA` entity that holds the `LastId` that was used in the user profile

Since I'm sticking to Native Integrations, I'm using the DynamoDB API to execute a `getItem` on the table of my choosing. That API call looks like this

```json
{
  "TableName": "Users",
  "ConsistentRead": true,
  "Key": {
    "PK": {
      "S": "USERMETADATA"
    },
    "SK": {
      "S": "USERMETADATA"
    }
  }
}
```

The sole purpose of this `getItem` is to fetch the `LastId` from the table so it can be used when building the Username and profile. The code below is the function that builds this transition

```typescript
buildFindLastId = (t: ITable): CallAwsService => {
  return new CallAwsService(this, "FindLastId", {
    action: "getItem",
    iamResources: [t.tableArn],
    parameters: {
      TableName: t.tableName,
      ConsistentRead: true,
      Key: {
        PK: {
          S: "USERMETADATA",
        },
        SK: {
          S: "USERMETADATA",
        },
      },
    },
    service: "dynamodb",
    resultSelector: {
      "previousUserId.$": "$.Item.LastId.N",
      "userId.$":
        "States.Format('{}', States.MathAdd(States.StringToJson($.Item.LastId.N), 1))",
    },
    resultPath: "$.context",
  });
};
```

### Creating the DynamoDB User

Once the ID is fetched an it has been incremented by 1 (_note the intrinsic functions usage_ `States.MathAdd`, `States.StringToJson` and `States.Format`) I can begin to put together the Transaction that will write the record into DynamoDB.

A couple of things to note

1.  `attribute_not_exists` on the PK field. If that attribute value is already in place, the transaction will fail
2.  The update of the `USERMETADATA` and the creation of the new user happen in a transaction so that it's an all or nothing. If something fails for either of the conditions I'm catching it goes back to the LastId step to try again

```typescript
buildCreateDynamoDBUser = (t: ITable): CallAwsService => {
  return new CallAwsService(this, "CreateDynamoDBUser", {
    action: "transactWriteItems",
    iamResources: [t.tableArn],
    parameters: {
      TransactItems: [
        {
          Put: {
            Item: {
              PK: {
                "S.$": "States.Format('USERPROFILE#{}', $.context.userId)",
              },
              SK: {
                "S.$": "States.Format('USERPROFILE#{}', $.context.userId)",
              },
              FirstName: {
                "S.$": "$.firstName",
              },
              LastName: {
                "S.$": "$.lastName",
              },
              EmailAddress: {
                "S.$": "$.emailAddress",
              },
              PhoneNumber: {
                "S.$": "$.phoneNumber",
              },
            },
            ConditionExpression: "attribute_not_exists(PK)",
            TableName: t.tableName,
          },
        },
        {
          Update: {
            ConditionExpression: "LastId = :previousUserId",
            UpdateExpression: "SET LastId = :newUserId",
            ExpressionAttributeValues: {
              ":previousUserId": {
                "N.$": "$.context.previousUserId",
              },
              ":newUserId": {
                "N.$": "$.context.userId",
              },
            },
            Key: {
              PK: {
                S: "USERMETADATA",
              },
              SK: {
                S: "USERMETADATA",
              },
            },
            TableName: t.tableName,
          },
        },
      ],
    },
    service: "dynamodb",
    resultPath: JsonPath.DISCARD,
  });
};
```

So I think I might guess what you are thinking. That's a lot of code and Javascript/Typescript to make that API call happen. And I'd argue actually it's far less code than trying to do this with a Lambda. And it's cheaper as well because I'm not wasting the step of starting up a Lambda and incurring the execution cost to only run an API call. Not to mention, I'm not paying for nor waiting for a Cold Start to happen. Sure, they aren't much these days, but they aren't nothing either.

As you can see those, I'm updating the `USERMETADATA` and also creating a `USERPROFILE` for the new Username that was built and passed in

Additionally, in the case of failure, it rolls right back to FindLastId to trigger the workflow all over again. Like I said above, this pattern works great for dealing with Optimistic locking and doesn't incur the overhead that happens in other scenarios. Additionally, the volume that this will experience the retry will be totally fine in terms of likelihood of happening in addition to the < .25 sec delay if the workflow does have to start over

### Creating the Cognito User

The moment of truth has come. I've got the latest ID, created a new user in a table that will be used to support a User Profile in addition to storing claims that will be customized from the User Pool (that article will come soon) and now it's time to create the user in Cognito

```typescript
buildCreateCognitoUser = (u: IUserPool): CallAwsService => {
  return new CallAwsService(this, "CreateCognitoUser", {
    action: "adminCreateUser",
    iamResources: [u.userPoolArn],
    parameters: {
      UserPoolId: u.userPoolId,
      "Username.$": "$.context.userId",
      UserAttributes: [
        {
          Name: "email",
          "Value.$": "$.emailAddress",
        },
        {
          Name: "email_verified",
          Value: "true",
        },
      ],
    },
    service: "cognitoidentityprovider",
  });
};
```

This part is really simple. Take the input from above and call the Cognito `adminCreateUser` API call and you will magically get a new user that is email verified that requires a force password change. Additionally like I mentioned, you'll be able to customize those [JWT Claims from the data in the table.](https://binaryheap.com/w6t7)

What I like about this too, is that if the User Already exists, I'm going to rollback the user creation and act like this never happened.

```typescript
buildStateMachine = (scope: Construct, t: ITable, u: IUserPool): stepfunctions.IChainable => {
    const pass = new stepfunctions.Pass(scope, 'Pass');
    const fail = new stepfunctions.Fail(scope, 'Fail');
    let rollbackUser = this.buildRollbackUser(t);
    let createCognitoUser = this.buildCreateCognitoUser(u)
    let createDbUser = this.buildCreateDynamoDBUser(t);
    let findLastId = this.buildFindLastId(t);

    createCognitoUser.addCatch(rollbackUser, {
        errors: [
            "CognitoIdentityProvider.UsernameExistsException"
        ],
        resultPath: "$.error"
    })

    createDbUser.addCatch(findLastId, {
        errors: [
            "DynamoDB.ConditionalCheckFailedException",
            "DynamoDb.TransactionCanceledException"
        ],
        resultPath: "$.error"
    })

    // correctLastId.next(findLastId);
    rollbackUser.next(fail);

    return findLastId
        .next(createDbUser)
        .next(createCognitoUser)
        .next(pass);

```

That above is the actual State Machine workflow code using the fluent CDK API. Notice that on the `createCognitoUser` `IChainable` I'm handling the `CognitoIdentityProvider.UsernameExistsException` which then rolls into the "rollback". You could of course check for whatever errors you want here.

And in the rollback, I'm simply cleaning up.

```typescript
buildRollbackUser = (t: ITable): CallAwsService => {
  return new CallAwsService(this, "RollbackUser", {
    action: "deleteItem",
    iamResources: [t.tableArn],
    parameters: {
      TableName: t.tableName,
      Key: {
        PK: {
          "S.$": "States.Format('USERPROFILE#{}', $.context.userId)",
        },
        SK: {
          "S.$": "States.Format('USERPROFILE#{}', $.context.userId)",
        },
      },
    },

    resultPath: "$.results",
    service: "dynamodb",
  });
};
```

## Wrapping Up

I really love these State Machines that have zero code outside of the orchestration. Having been in tech for a long time, I've seen these types of things come and go but what I really love about AWS Step Functions is this

1.  It scales ... seriously it does
2.  The code to build it is done through a language I'm comfortable with. Not some DSL
3.  I find that these types of solutions are easy to debug and reason about
4.  The less code I write, the less errors I make. Simple as that

So the next time you need to piece some AWS Serverless things together, have a look at the #zerocode approach. I think you might like it
