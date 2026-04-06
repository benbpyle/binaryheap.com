---
title: BatchGetItem with Golang
author: "Benjamen Pyle"
description: Achieving the fetch of multiple items from DynamoDB using the BatchGetItem operation with Golang
pubDatetime: 2023-02-25T00:00:00Z
tags:
  - aws
  - data
  - programming
  - serverless
draft: false
---

I haven't had to use the Batch API a great deal over the past few years. When thinking more on it, it's not that I have anything against the API, it is just that I never had a reason to work with it. However, over the past couple of months I saw that I'd used it twice in a project and with good success. My [Golang and DynamoDB](https://binaryheap.com/8ldd) content has been doing well so I figured there might be some appetite for this one. And with all that said, I wrote this article highlighting how to use DynamoDB's BatchGetItem with Golang.

## The Setup

For this post I want to use just a simple example which you can surely extend from there. The example itself could be solved with several different design models but in this case, let's say that I've got a list of Companies I want to retrieve all by their key. _You'd never do this if had millions of companies but for my use case and the way my data was modeled I'm going to have AT MOST 10_.

Here is a small example of that data

![DynamoDB Company Records
](/images/Screenshot-2023-02-25-at-8.57.56-AM-1024x127.png)

As seems like always with DynamoDB, there are multiple ways to go about solving this problem but [BatchGetItem](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchGetItem.html) will do just fine.

## Execution

So for executing BatchGetItem with Golang, you first want to take advantage of the [DynamoDB SDK](https://docs.aws.amazon.com/sdk-for-go/api/service/dynamodb/)

Let's take a look at some of the code to pull this together. [Github Gist of you want to see it in a full window](https://gist.github.com/benbpyle/4744318d476513e5452826d9a1430504)

```go
func (d *DynamoDBCompanyRepository) GetCompanies(ctx context.Context, companyIds []string) ([]models.Company, error) {
	var keys []map[string]*dynamodb.AttributeValue

	for _, c := range companyIds {
		key := models.GetCompanyKey(c)
		m := map[string]*dynamodb.AttributeValue{
			"PK": {
				S: aws.String(key),
			},
			"SK": {
				S: aws.String(key),
			},
		}
		keys = append(keys, m)
	}

	input := &dynamodb.BatchGetItemInput{
		RequestItems: map[string]*dynamodb.KeysAndAttributes{
			d.tableName: {
				Keys: keys,
			},
		},
	}

	log.WithFields(log.Fields{
		"input":         input,
	}).Debug("The query input")

	var companies []models.Company
	err := d.db.BatchGetItemPagesWithContext(
		ctx, input,
		func(page *dynamodb.BatchGetItemOutput, lastPage bool) bool {
			for _, v := range page.Responses {
				for _, v2 := range v {
					var c models.Company
					_ = dynamodbattribute.UnmarshalMap(v2, &c)
					companies = append(companies, c)
				}
			}

			return lastPage
		})

	if err != nil {
		return nil, err
	}

	return companies, nil
}

```

So breaking this down. The func takes a slice of Company IDs in addition to the context and returns a slice of marshalled Companies.

```go
func (d *DynamoDBCompanyRepository) GetCompanies(ctx context.Context, companyIds []string) ([]models.Company, error)
```

Next up, the keys for the query need to be specified. In the case of this example the PK and SK have the same key, so simply spinning through the slice and building those into a map of `*dynamodb.AttributeValue` pointers works.

```go
var keys []map[string]*dynamodb.AttributeValue

for _, c := range companyIds {
	key := models.GetCompanyKey(c)
	m := map[string]*dynamodb.AttributeValue{
		"PK": {
			S: aws.String(key),
		},
		"SK": {
			S: aws.String(key),
		},
	}
	keys = append(keys, m)
}

```

Side note, the `GetCompanyKey` is just a simple func that returns the key. Here it is

```go
func GetCompanyKey(id string) string {
	return fmt.Sprintf("COMPANY#%s", id)
}

```

Once the keys have be been packaged up, it's time to make the Query Input. That looks like this

```go
input := &dynamodb.BatchGetItemInput{
	RequestItems: map[string]*dynamodb.KeysAndAttributes{
		d.tableName: {
			Keys: keys,
		},
	},
}

```

There are many other options to explore, but I'm just using the Table name and the keys. Feel free to look at the full [documentation here.](https://docs.aws.amazon.com/sdk-for-go/api/service/dynamodb/#DynamoDB.BatchGetItem)

The last part of this is to loop through the pages returned and then deal with what each page has

```go
var companies []models.Company
err := d.db.BatchGetItemPagesWithContext(
	ctx, input,
	func(page *dynamodb.BatchGetItemOutput, lastPage bool) bool {
		for _, v := range page.Responses {
			for _, v2 := range v {
				var c models.Company
				_ = dynamodbattribute.UnmarshalMap(v2, &c)
				companies = append(companies, c)
			}
		}

		return lastPage
	})

if err != nil {
	return nil, err
}

return companies, nil

```

Have a look again at the [documentation](https://docs.aws.amazon.com/sdk-for-go/api/service/dynamodb/#DynamoDB.BatchGetItem) if you want more clarity on options but the general idea is that you loop through the pages and for each page loop you provide a function that handles the output. In the case above, the Companies just get Unmarshalled and added into a Slice. If you've got any [custom marshalling, this article might help](https://binaryheap.com/8ldd)

## Wrap Up

I hope you can see that using BatchGetItem with Golang is a straightforward and fairly simple way to fetch a limited set of items that you want in one contained set of calls. Again, caution you to some extent that there are other ways to do this and the model will largely drive your approach but in the example above I've seen this perform well in production.

Hope you found this helpful!
