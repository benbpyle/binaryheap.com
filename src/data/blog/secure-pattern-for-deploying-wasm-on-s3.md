---
title: Secure Pattern for Deploying WASM on S3
author: "Benjamen Pyle"
description: "Picking up where I left off from the last article, I'd built a simple WASM project with Rust and walked through how to generate a publishable distribution. In this edition, which is probably the penul"
pubDatetime: 2024-05-11T00:00:00Z
tags:
  - aws
  - cdk
  - programming
  - rust
  - serverless
  - typescript
draft: false
---

Picking up where I left off from the last article, I'd built a simple WASM project with Rust and walked through how to generate a publishable distribution. In this edition, which is probably the penultimate in the series, I need to get a path towards CloudFront and S3. I want to stay true to the Serverless objective and those two services are perfect for shipping web-delivered code. So let's dive into Deploying WASM on S3.

## Series Articles

This is as I mentioned the second article in a series about Serverless WASM with Rust. If you missed the first, below is the link to jump in and read that first. Don't worry, this will still be here.

1.  [Getting started with Serverless Web Assembly (WASM) with Rust](https://binaryheap.com/serverless-wasm-with-rust-article-1/)

Let's take a look at the architecture I will be building for the rest of this piece.

## Architecture

The main stars for deploying WASM on [S3](https://aws.amazon.com/s3/) are [CloudFront](https://aws.amazon.com/cloudfront/) and of course S3. Those two services will do the heavy lifting with our compiled WASM distribution.

[![Deploying WASM on S3](/images/3_image.png)](/images/wasm-cloudfront.png)

What's cool about using WASM is that it's just some HTML, JavaScript, and an executable WASM file. That means that it's just like running normal HTML, CSS, and JavaScript which makes S3 the perfect storage vehicle for this code. And using CloudFront with it is a [match made in heaven](https://aws.amazon.com/blogs/networking-and-content-delivery/amazon-s3-amazon-cloudfront-a-match-made-in-the-cloud/)

## Deploying WASM on S3

### Output of Trunk

Going back to building the WASM package, I used a tool called [Trunk](https://trunkrs.dev/) to build and bundle the Rust code. When I run the command `trunk build` I'm presented with the following images. The first is what the build looks like from the console and the second is the contents of the `dist` directory that is created and populated.

[![Trunk Build](/images/1_image-3.png)](/images/trunk_build.png)

[![Trunk Dist](/images/1_image-2.png)](/images/dist.png)

With a `dist` directory ready, I need to figure out a way to get that up into S3. Let's explore how to make that happen.

### S3 for Static Website

My default these days is to use [CDK](https://binaryheap.com/intro-to-cdk/) to build infrastructure and that's what I'm going to use here. Specifically, CDK with TypeScript.

To start deploying WASM on S3, I need to set up a bucket that is geared towards being a static website. What this does for me is restrict access and set some other sensible and secure defaults.

The code to accomplish that looks like this:

```typescript
const bucket = new Bucket(this, 'Bucket', {
    accessControl: BucketAccessControl.PRIVATE,
});

new BucketDeployment(this, 'BucketDeployment', {
    destinationBucket: bucket,
    sources: [Source.asset('./dist')]
})
```

What's going on above is that I'm creating a new bucket by "newing" a Bucket construct. And then from that bucket, I'm creating another construct called BucketDeployment and sending two things in.

1.  The bucket I just created.
2.  The directory that holds the output of my `trunk build` command.

With the S3 deployment part created in my deploying WASM on S3, it's now time to move to CloudFront.

### Establishing the CloudFront Distribution

There's no magic in any of this. Sure CDK makes it easy to build and package infrastructure but sometimes, things just are right in front of me.

Creating a CloudFront distribution in front of my S3 bucket gives me the ability to ship my `./dist` output to all of the edge locations that AWS provides and when a user requests access, it'll grab from that edge cache first before reaching out to the S3 origin. Using this technique when deploying WASM on S3 works just like any other static website.

```typescript
const originAccessIdentity = new OriginAccessIdentity(this, 'OriginAccessIdentity');
bucket.grantRead(originAccessIdentity);

new Distribution(this, 'Distribution', {
    defaultRootObject: 'index.html',
    defaultBehavior: {
    origin: new S3Origin(bucket, { originAccessIdentity }),
    },
})
```

Here's what is happening in this code:

1.  Create an origin identity.
2.  Give the newly created bucket read access to the identity.
3.  Create a new distribution and assign `index.html` as the default root object.

### Putting it Together

Running `cdk deploy` in the working directory will push the code and complete the last step in deploying WASM to S3.

All put together:

```bash
trunk build
cdk deploy
```

The S3 bucket will then show the HTML, JS, and WASM files.

[![S3 Files](/images/2_image-1.png)](/images/s3_objects.png)

If I then browse to Cloudfront, I can pick up the URL for the distribution so that I can see if the WASM renders in the browser.

![CloudFront](/images/1_image.jpeg)

### Final Check

Now that we are coming to the end of this article on deploying WASM on S3, we can take a look at the browser to see where we are.

[![](/images/tour_players-1024x227.png)](/images/tour_players.png)

It's nothing fancy but it's a start for where I'm going to go next with it.

## Wrapping Up

Two articles into this now-planned 3 article series I've shown you how to build a simple WASM application with Rust and then demonstrated a solution for deploying WASM on S3. Moving into the finale, I'll put together the following finishing touches.

1.  More styled UI
2.  API build in Rust
3.  Connect the WASM to the Rust API.

Once these pieces are in place, I'll have a Serverless WASM implementation with Rust.

I'm still not 100% sure about the use cases here, but I believe by exploring the topics above and building out more useful functionality, I'll be able to assess whether this is something worth exploring more. WASM isn't just for the web, it can also run on Lambda and other compute options which might be worth checking out as well.

And as always, here is the [source code that I'm working from on GitHub.](https://github.com/benbpyle/serverless-wasm-demo)

Thanks for reading and happy building!
