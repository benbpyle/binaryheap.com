---
title: Unmarshalling a DynamoDB Map into a Go Struct
author: "Benjamen Pyle"
description: Unmarshalling a DynamoDB map into a Go struct
pubDatetime: 2023-02-01T00:00:00Z
tags:
  - aws
  - data
  - golang
  - programming
draft: false
---

Short post on unmarshalling a DynamoDB Map into something strongly typed like a Go struct. If you want to jump straight to some code, here are the Github gists

- [Data Model](https://gist.github.com/benbpyle/20c313b853fb745e07c428132386b8b5)
- [Go Code](https://gist.github.com/benbpyle/66be02d7e90147c3c8c2bba123dbfb25#file-user_role-go)

So what is "unmarshalling"? It's the act of taking one representation of data and converting it into another. For instance when we store data in DynamoDB one of the native data types is a "map". A map is really nothing more than a dictionary/key value type look up. Think of a dictionary as a data structure that has a key and a subsequent value. The key **must** be unique. Take this data for example

```json
{
  "Roles": {
    "1": {
      "name": "Role number 1",
      "id": 1
    },
    "2": {
      "name": "Role number 2",
      "id": 2
    }
  },
  "SK": "ROLE#1234",
  "PK": "USERPROFILE#1000130",
  "EntityType": "UserRole"
}
```

The Roles property is a map. It contains keys of `["1"]` and `["2"]`. Then each of those keys contain another map inside of it. These look alot like JSON objects and for all intents and purposes, it's OK to think of them like that.

So with this data, how to do we get it into something that looks like this

```go
type UserRole struct {
	EntityType string `dynamodbav:"EntityType"`
	Roles      []Role `dynamodbav:"Roles"`
}

type Role struct {
	Id   int
	Name string
}
```

The `UserRole` struct has en EntityType property as well as a Roles slice that holds Role structs. Each field also has attributes that describe them as things that are represented in DyanamoDB Attribute values with names that correspond to the column names. Feel free to read up more [here](https://docs.aws.amazon.com/sdk-for-go/api/service/dynamodb/dynamodbattribute/)

To get started with the unmarshalling the first step is to build a `UserRole` and unmarshall it.

```go
ur := &UserRole{}
_ = dynamodbattribute.UnmarshalMap(i, ur)
```

By default, this is going to really just unmarshal the fields that the Go library knows how to deal. So very similar to when working with JSON unmarshalling, the same can be done with DynamoDB

```go
func (ur *UserRole) UnmarshalDynamoDBAttributeValue(value *dynamodb.AttributeValue) error {
	for k, kv := range value.M {
		if k == "EntityType" {
			ur.EntityType = *kv.S
		} else if k == "Roles" {
			for _, nkv := range kv.M {
				r := &Role{}
				err := dynamodbattribute.UnmarshalMap(nkv.M, r)
				if err != nil {
					return err
				}
				ur.Roles = append(ur.Roles, *r)
			}
		}
	}
	return nil
}

```

Note that you can spin through the Key/Value pairs of the attribute value that is passed in. For each of the keys, you can determine what type of object is inside there. For instance the `EntityType` field is a string. So that's simple enough.

But with the `Roles` field, there is another map to deal with. So again, simply unmarshal that variable and take the custom step one layer further

```go
func (r *Role) UnmarshalDynamoDBAttributeValue(value *dynamodb.AttributeValue) error {
	for k, kv := range value.M {
		if k == "id" {
			v, _ := strconv.ParseInt(*kv.N, 10, 32)
			r.Id = int(v)
		} else if k == "name" {
			r.Name = *kv.S
		}
	}

	return nil
}

```

And there it is. An umarshalled custom type from a DynamoDB map. There isn't too much more too it but this super powerful as you can realize any type of data stored in DynamoDB into a Go struct with your custom code.

Hope this was helpful!
