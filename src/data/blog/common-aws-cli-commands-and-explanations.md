---
title: Common AWS CLI commands and explanations
author: "Benjamen Pyle"
description: How to use some common AWS CLI Commands
pubDatetime: 2023-02-19T00:00:00Z
tags:
  - aws
  - cli
  - programming
  - uncategorized
draft: false
---

I tend to lose track of some of the commands or things I run often and by the time I think to script or alias something, I've long sense forgotten it. Then I end up running `history | grep -i <some phrase`\> hoping that it's in my history. The point of this article is just to document and capture some the common AWS CLI commands that I use pretty often.

## SNS

Simple Notification Service is something is a backbone for a lot of the Apps I build. Granted I'm spending more and more time with EventBridge but I've got so much code that leverages this product, it makes sense to include it.

Below contains

-   Listing all topics
-   Creating a topic
-   Subscribing an SQS to a topic
-   Listing subscriptions
-   Posting a message to a topic

```
# List topics
aws sns list-topics
# Create topic
aws sns create-topic --name test-topic
# Subscribe
aws sns subscribe --topic-arn arn:aws:sns:us-west-2:123456789012:the-topic --protocol sqs --notification-endpoint http://some-queu-url
# List subscriptions
aws sns list-subscriptions
# Post a message to a Topic
aws sns publish --topic-arn arn:aws:sns:us-west-2:123456789012:topic --message "{\"event\":{\"type\":\"TeamUpdate\",\"id\":1,\"name\":\"New Team Name\"}}"
```

## SQS

Simple Queue Service was the first thing that AWS built back I think in 2006. That should tell you that the whole "Event Driven Architecture" that they've been pushing really goes back a while. Queues are the backbone of distributed software so this one makes sense.

-   Creating a queue

```
# Create a queue
aws sqs create-queue --queue-name test_queue
```

## S3

Simple Storage Service (S3) powers so many thing that it is hard to have a list of commands without this service.

```
# Sync files with a remote bucket
aws s3 sync . s3://[bucket-to-sync]/

# Delete empty bucket
aws s3 rb s3://[bucket-to-delete] --force  

# Copy local directory files to S3 Bucket
aws s3 cp directory  s3://[bucket-to-copy-to] --recursive

# Sync one bucket with another,changing ownership,and encrypting with default S3 encryption (ensure that destination account user has proper permissions in source S3 bucket policy)
aws s3 sync s3://some-bucket/ s3://another-bucket/ --acl bucket-owner-full-control --metadata-directive REPLACE  --sse
```

## Cloudformation

The engine that builds Infrastructure from Code.

-   Running a stack with IAM Capabilites
-   Validating the structure of a IaC file
-   Deleting a stack
-   Describing the events that have occurred while running a stack

```
# Run cloudformation with IAM capabilities and using a Template from S3
aws cloudformation create-stack --stack-name the-stack --template-url https://s3-us-west-2.amazonaws.com/stack.yml --parameters file://parameters.json --capabilities CAPABILITY_NAMED_IAM

# Validate Stack
aws cloudformation validate-template --template-body file://stack.yml

# Delete Stack
aws cloudformation delete-stack --stack-name  the-stack

# Describe Stack
aws cloudformation describe-stack-events --stack-name the-stack

```

## CodeCommit

AWS' managed Git repositories

-   Creates a PR with a title specifying the Repository and the Source Branch

```
# Create a pull request
aws codecommit create-pull-request --title "Merge in some improvements" --targets repositoryName=the-repos,sourceReference=the-branch
```

## Cognito/User Pools

AWS' Identity and access management and User Directory service. It's serverless and provides an OAuth2 and OIDC compliant implementation of those standards

-   Updates the user attributes
-   Confirms the user and sets their password
-   Signing up a new user
-   Confirming signup of the new user

```
aws cognito-idp admin-update-user-attributes --user-pool-id us-the-pool --username ben --user-attributes Name="name",Value="Ben Pyle" 
# THIS IS GOLD

aws cognito-idp admin-set-user-password --user-pool-id the-pool --username UUID --password <PASSWORD> --permanent 

aws cognito-idp sign-up \
    --client-id the-id \
    --username "the-user-name" \
    --password <password> \
    --user-attributes "Name"="email","Value"="benbpyle@gmail.com" "Name"="phone_number","Value"="+18175577109" "Name"="name","Value"="Ben Pyle" \
    --region us-west-2 \
    --profile default
aws cognito-idp admin-confirm-sign-up \
    --user-pool-id the-pool \
    --username "the-user-name" \
    --region us-west-2 \
    --profile default
aws cognito-idp admin-update-user-attributes \
    --user-pool-id the-pool \
    --username "the-user-name" \
    --user-attributes Name=email_verified,Value=true \
    --region us-west-2 \
    --profile default
```

## Kinesis

Large scale Stream. Can be used to move data, transform data for analytics among many other things

-   Creating a new stream
-   Describing a stream
-   Watching a stream -- this will connect to the stream you specify and act a Consumer so you can see the data as it comes off the flow

```
# create stream
aws kinesis create-stream --stream-name <value> --shard-count <value>
# describe stream
aws kinesis describe-stream --stream-name <value>
# watch stream - against .aws/credentials
streamname=stream-name; aws kinesis describe-stream --stream-name $streamname --output text | grep SHARDS | awk '{print $2}' | while read shard; do aws kinesis get-shard-iterator --stream-name $streamname --shard-id $shard --shard-iterator-type LATEST --output text | while read iterator; do while output=`aws kinesis get-records --shard-iterator $iterator --output text`; do iterator=`echo "$output" | head -n1 | awk '{print $2}'`; echo "$output" | gsed 1d | grep RECORDS | while read record; do echo $record | awk '{print $3}' | base64 -D; done; done; done; done

```

## Wrapping Up

Hopefully you find some value in these. Like I said at the beginning these are just things I run often with the options I run them. You can find so much more [here](https://docs.aws.amazon.com/cli/index.html) but I really just wanted to capture a few more specifics.

Enjoy!
