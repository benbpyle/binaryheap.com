---
title: AWS HealthLake Exports
author: "Benjamen Pyle"
description: "In my previous article I wrote about a Callback Pattern with AWS Step Functions built upon the backbone of HealthLake's export. As much as I went deep with code on the Callback portion, I felt that I"
pubDatetime: 2023-08-26T00:00:00Z
tags:
  - aws
  - cdk
  - data
  - serverless
draft: false
---

In my [previous article](https://binaryheap.com/aws-step-functions-callback-pattern/) I wrote about a Callback Pattern with AWS Step Functions built upon the backbone of HealthLake's export. As much as I went deep with code on the Callback portion, I felt that I didn't give the HealthLake side of the equation enough run. So this article is that adjustment. Managing exports with AWS HealthLake.

## What is HealthLake

> AWS HealthLake is a HIPAA-eligible service that provides FHIR APIs that help healthcare and life sciences companies securely store, transform, transact, and analyze health data in minutes to give a chronological view at the patient and population-level. - AWS

My words on that are that HealthLake is a FHIR-compliant database that gives a developer a robust set of APIs to build patient-centered applications. You can use HealthLake for building transactional applications, analyze large volumes of data, store structured and semi-structured information and build analytics and reports.

When building with HealthLake I find it fits in one of two places.

1.  As the transactional center for your Healthcare application. It is highly patient centered, very scalable and contains APIs for working with each resource. In addition, it provides SMART on FHIR capabilities that make it nice choice for building an application on top of.
2.  As the aggregation point for many external and internal systems in a LakeHouse style architecture for interopability and reporting. When you've got a distributed system with various datababases and you need your data reunited in one location. HealthLake does that. Or if you are pulling in data from various external sources, HealthLake can do that too. I wrote about doing this [with Serverless](https://binaryheap.com/event-driven-serverless-data-architecture/) a while back.

## AWS HealthLake Exports

Before [June 2023](https://aws.amazon.com/about-aws/whats-new/2023/06/amazon-healthlake-interoperability-related-onc-cms-patient-access-rules/), exports in AWS HeathLake were only supported in the console or through CLI commands. With the release of these new bulk APIs for managing exports, it allows the workflows like what I showed in the Callback article.

This capability unlocks many different use cases but the biggest two that I see coming to the front are:

1.  Building a CDC capability in HealthLake
2.  Exports of data incrementally to perform analytics or other data analysis.

Two more notes on the exports before I show what all goes into making it possible in your environment. The API provides a couple of nice options to control what you are going to export.

First, with a Patient centered export, you can supply that in the URL and HealthLake will export all records related to your patients in the Patient resource. So things attached as FHIR References, Subscribers and whatnot throughout your dataset.

Second, by using a Since parameter, HealthLake will export only those records changed `>=` that Since parameter.

For more reading on the export, [here's the documentation](https://docs.aws.amazon.com/healthlake/latest/devguide/export-datastore-rest.html)

## Executing the AWS HealthLake Export

Using exports with AWS HealthLake requires a touch of setup. In the following sections I'll explain what all needs to be configured and then we will look at how to execute the exports.

### Setting up the Export

The first step in preparing for our export is to build a role that has access to the HealthLake datastore in addition to the actions for running and describing the export. A snippet of CDK code that does this is below:

```typescript
const manageExportPolicy = new iam.PolicyDocument({
  statements: [
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [props.datastore.attrDatastoreArn],
      actions: [
        "healthlake:StartFHIRExportJobWithPost",
        "healthlake:DescribeFHIRExportJobWithGet",
        "healthlake:CancelFHIRExportJobWithDelete",
        "healthlake:StartFHIRExportJob",
      ],
    }),
    new iam.PolicyStatement({
      actions: [
        "s3:ListBucket",
        "s3:GetBucketPublicAccessBlock",
        "s3:GetEncryptionConfiguration",
      ],
      effect: iam.Effect.ALLOW,
      resources: [`${props.bucket.bucketArn}`],
    }),
    new iam.PolicyStatement({
      actions: ["s3:PutObject"],
      effect: iam.Effect.ALLOW,
      resources: [`${props.bucket.bucketArn}/*`],
    }),

    new iam.PolicyStatement({
      actions: ["kms:DescribeKey", "kms:GenerateDataKey*"],
      effect: iam.Effect.ALLOW,
      resources: [props.key.keyArn],
    }),
  ],
});

this._role = new iam.Role(scope, "HealthLakeExportRole", {
  roleName: "healthlake-cdc-export-role",
  assumedBy: new iam.PrincipalWithConditions(assumedBy, {
    StringEquals: {
      "aws:SourceAccount": props.accountId,
    },
    ArnEquals: {
      "aws:SourceArn": props.datastore.attrDatastoreArn,
    },
  }),
  inlinePolicies: {
    healthlakePolicy: manageExportPolicy,
  },
});
```

Good bit going on with the above, so let's talk about that for a second.

These new actions are specifically associatied with the AWS HealthLake exports.

```
actions: [
    "healthlake:StartFHIRExportJobWithPost",
    "healthlake:DescribeFHIRExportJobWithGet",
    "healthlake:CancelFHIRExportJobWithDelete",
    "healthlake:StartFHIRExportJob",
],
```

The other parts of the role are wrapped around S3 and KMS. This matters because the export is going to write its results into the S3 bucket/key of your choosing. And the role that this executes under is going to need permission to those things.

The last piece of the role is that I'm limiting access via a Trust Policy so that only the account I want and the datastore I choose for further restriction. It's just good practice.

### Running the Export

To demonstrate exports with AWS HealthLake I'm going to use a simple API call and show you the cURL requests. At the bottom of the article will be the link to the full repository I used in the Callback article, so you can refer to that as well.

```bash
curl --location 'https://healthlake.us-west-2.amazonaws.com/datastore/<datastoreid>/r4/$export?_since=2023-07-18T00%3A00%3A00.461Z'
--header 'Content-Type: application/fhir+json'
--header 'Prefer: respond-async'
--header 'X-Amz-Content-Sha256: beaead3198f7da1e70d03ab969765e0821b24fc913697e929e726aeaebf0eba3'
--header 'X-Amz-Date: 20230826T132701Z'
--data '{
    "JobName": "<whatever you want>",
    "OutputDataConfig": {
        "S3Configuration": {
            "S3Uri": "s3://<your-s3-bucket>",
            "KmsKeyId": "arn:aws:kms:us-west-2:<account-id>:key/<key-id>"
        }
    },
    "DataAccessRoleArn": "arn:aws:iam::<account-id>:role/healthlake-export-role"
}'
```

I left out the "Authorization" header for obvious reasons. But things to note that are meaningful.

- Header: `Prefer: respond-async`
- Header: `Content-Type: application/fhir+json`

The Payload you pass into the POST request is specific as well. You'll need to supply:

- S3Uri - this is the bucket/key that you want to dump the results. You used this when building your role
- KmsKeyId - this is the encryption key used for the S3 bucket and the role needs to have this as well
- DataAccessRoleArn - the role that's built in the above code.

When you run the request, the following output will be returned.

```json
{
  "datastoreId": "<your datastoreid>",
  "jobStatus": "SUBMITTED",
  "jobId": "<jobId>"
}
```

### Monitoring the Export

AWS HealthLake exports are async operations. You POST into the API and you get a JobId that you'll use to check on the progress of your job.

The API provides a GET request that allows you to describe the job you are interrogating.

```bash
curl --location 'https://healthlake.us-west-2.amazonaws.com/datastore/<datastoreid>/r4/export/<jobId>'
--header 'X-Amz-Date: 20230826T134903Z'
```

Remember from the previous article, you can only have 1 job running at a time but you can always go back and inspect older jobs. I can't find information around how long the job history hangs around but I generally am not looking back that far so I haven't noticed.

The response to the describe call is going to look like this:

```json
{
  "exportJobProperties": {
    "jobId": "<jobId>",
    "jobName": "2023-07-19 15:06:49 +0000 UTC",
    "jobStatus": "COMPLETED",
    "submitTime": "Aug 26, 2023 1:46:56 PM",
    "endTime": "Aug 26, 2023 1:48:25 PM",
    "datastoreId": "<datastoreId>",
    "outputDataConfig": {
      "s3Configuration": {
        "s3Uri": "s3://<bucket/key>/<datastoreId>-FHIR_EXPORT-<jobId>/",
        "kmsKeyId": "arn:aws:kms:us-west-2:<accountId>:key/<keyId>"
      }
    },
    "dataAccessRoleArn": "arn:aws:iam::<accountId>:role/healthlake-cdc-export-role"
  },
  "transactionTime": "2023-08-26T13:49:03.424Z",
  "request": "https://healthlake.us-west-2.amazonaws.com/datastore/<datastoreId>/r4/$export?_type&_since=2023-07-18T00:00:00.461Z&_outputFormat=application/fhir+ndjson",
  "requiresAccessToken": false,
  "output": [
    {
      "type": "ResourceType",
      "url": "s3://<bucket/key>/<datastoreId>-FHIR_EXPORT-<jobId>/ResourceType/ResourceType-1022280015944103279-3-0.ndjson"
    }
  ],
  "error": []
}
```

I'll break down that payload.

First off you see the "jobProperties" that highlight the things you passed in via the POST. It does include some additional information about the job itself. Runtime, status, job id, and job name.

The other pieces of information describe the actual request including the full URL.

Lastly, you get an "output" object. This is a list of the NDJSON files and their resource type along with their full URL to the file in S3. This is important because if you want to do something with these files, you can.

A quick note on NDJSON. The first time I looked into the output of the files, I was a bit shocked that it wasn't a single record in a file. I guess that shouldn't have shocked me but it did. NDJSON is "Newline Delimited JSON" meaning that you have multiple records in a file separated by `rn` or `n`

The output in S3 will look like the below:

![AWS HealthLake exports](/images/export_bucket.jpg)

## Wrapping Up

That completes the discussion on the [Callback](https://binaryheap.com/aws-step-functions-callback-pattern/) and the underlying HealthLake exports in AWS that supports it. I've become a tremendous fan of HealthLake and believe that it fits a space of serious challenge in HealthCare. Data aggregation and interopability.

By leveraging these new APIs from AWS, you can take advantage of an export capability that can support a variety of workloads. I hope you've got a better understanding of how it all comes together. If you want to dig into the full source for everything, [here is the GitHub repository](https://github.com/benbpyle/healthlake-export-manager)

Enjoy! And Happy Building!
