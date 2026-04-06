---
title: Amazon Q meets Taylor Swift
author: "Benjamen Pyle"
description: "Amid everything going on, I stayed up after Day 2 of re:Invent to get my hands on the new Amazon S Q Digital Assistant. For more on the release here is the announcement. While sitting in the Adam Seli"
pubDatetime: 2023-11-29T00:00:00Z
tags:
  - ai
  - aws
  - data
  - serverless
draft: false
---

Amid everything going on, I stayed up after Day 2 of re:Invent to get my hands on the new Amazon S Q Digital Assistant. For more on the release [here is the announcement](https://aws.amazon.com/about-aws/whats-new/2023/11/aws-amazon-q-preview/). While sitting in the Adam Selipsky Keynote yesterday, a use case instantly popped into my head. The below example has no CDK or SAM but is purely a simple walkthrough of the functionality. Let me tell you about a time that Amazon Q met Taylor Swift.

## Backstory

Buying Christmas presents this year so far has been a lot of fun. That fun extends particularly to my niece who is 13 years old. Now my niece is like a lot of 13-year-old girls, and is a "Swifty" I think it's called. I say "think" because I honestly don't know. When I was 13, I was burning out my cassettes, vinyl and CDs with Pearl Jam, Guns 'n Roses, Metallica and other bands that either sang rock ballads or angry thrashing tunes. To further compound things, my two boys have developed a love for loud and heavy rock, so Taylor is not something playing over our Alexas.

Fast forward to [re:Invent Day 2](https://binaryheap.com/aws-reinvent-day-2/) and the preview of Q drops. Instantly I thought, what if I taught Q about Taylor Swift? Then I could ask it questions so that I could better relate to my niece! So here we go, Amazon Q meets Taylor Swift.

## Q

Q is designed as a digital assistant that can learn based on data sources that you supply. And those sources are pretty extensive for such a young product.

![Q Sources](/images/q_sources.png)

### The Data

Like any good developer, I first sought to see if someone else had compiled songs, albums and lyrics. And boy do I love GitHub and the internet because someone had done just that. [This repository](https://github.com/shaynak/taylor-swift-lyrics) was just what I was looking for from a data perspective.

I'll get into a few more details about the data in a minute but this is the starting point.

### Creating the Application

Creating an application that allows Amazon Q to meet Taylor Swift is fairly straightforward.

The wizard walks you through the steps which are:

-   Create and Name
-   Enhance and Customize
-   Preview the web experience
-   Deploy the web experience

![Q Workflow](/images/q_workflow.png)

I haven't gone as far as deploying yet, so this article won't cover that, but the other parts are what I'm going to walk you through.

Creation looks a lot like many of the AWS services with perhaps a slightly more modern UI.

![Q Creation](/images/q_creation.png)

I stuck with the defaults and let Q build the roles and permissions in IAM. I'll take a deeper look at this once I'm back home.

### Selecting a Retriever and Connecting Data Sources

Data for Q is important. Why wouldn't it be? The nice thing about Q is that you train these apps based on the data you want it to understand and you get an isolated personal assistant that can have fine-grained permissions and then further customize to your needs.

Additionally, you can have multiple data sources. For this example, I'm using the `lyrics.csv` file in the repository with the only columns being Song, Album and Lyric.

![Q data sources](/images/q_datasources.png)

From there you can specify some parameters around the retrieval. This includes index provisioning, filter exclusions and other settings.

![Q data sources](/images/q_retriever.png)

The last part is setting up the sync which can be tuned on the data source. The sync crawls and indexes the data for use. You can schedule this or have it run on-demand. I found for this sample dataset it took about 5 minutes for things to be ready. I'll do my performance testing later, but for now, I'm not interested in times. I just want to relate to my niece!

### Amazon Q meets Taylor Swift

The digital assistant UI is so simple that it's awesome! You have a few customization points around the name, prompt display and whatnot, but you don't need much more than that.

![Q Customize](/images/q_customize.png)

#### Asking about Taylor

Keep in mind through all of this, I ideated and have a rough working sample in just a few hours after an 18-hour day of re:Invent. I wanted to try two different types of questions.

1.  A fact
2.  Can it detect feelings or sentiment

#### Ask a Fact

I'm sure every Swifty knows why Taylor named one of her albums Red. I felt like that would be a great starting point to text my niece and we could bond over. So I asked Q.

![Q Red](/images/q_red.png)

Look at that answer! And it highlights sources as well. Since I just had the one "file", it always points back to that source but the quality of the response is really good. I know more about this topic after having chatted with Q and wouldn't feel as clueless talking to my niece.

Let's try another one. I've always wondered why "1989"? I feel like it's her year of birth, but what does Q say?

![Q 1989](/images/q_1989.png)

Well, that didn't go so well. I quick Google yielded that Taylor was born in 1989 and did not attend high school in 1989. Oops!

At first glance, this seems like a bad thing. But, if you look at the answer and further analyze the "why" I think you'll come to the same conclusion as I did. Q couldn't know this answer as the album 1989 has lots of high school and romance themes, so it inferred that 1989 was about those times. The answer required more data about Taylor to answer this question.

So word of caution, trust but verify. And do your research upfront to know what questions you are going to ask of Q and what data it might need to support that. Then add another data source. Problem solved!

#### Detect Feelings or Sentiment

OK, so facts are out of the way. But how will Q do about finding me the saddest Taylor song? When Amazon Q met Taylor, could it make that determination?

![Q Saddest](/images/q_saddest.png)

Honestly, I have no idea if this is true. It's an opinion. But what is interesting is that Q was able to pull sadness from the songs in the catalog and rank them. That's pretty complex and for it to narrow down to one with so little data, I'm impressed.

#### Chat History

The last thing I want to touch on is the conversation history. I can many applications for this and I'm sure there is an API behind it but visually it works in the Console UI.

![Q Conversation](/images/q_conversation.png)

You can click on any of these and see the list of questions you asked Q and its replies. This level of auditing is nice and will be powerful. For regulated use cases it will even be necessary.

## Wrap Up

The Christmas holiday might be a little more fun now that I've got Q at my side. I plan to engage in some bonding with my niece armed with my powerful new digital assistant to see if can't bridge the 30 + years of life and drastically different tastes in music. I'll probably then share with her about the time that Amazon Q met Taylor Swift. However, that'll probably turn the conversation back to me having to "Shake it Off".

Q is an exciting piece of tech from AWS. The possibilities will only be constrained by what you as the builder decide to create with it! For more reading, [take a look at the Q docs](https://aws.amazon.com/q/aws/). And if you are an AWS Console fan, you'll probably notice Q popping up on the right-hand side of your console.

Oh and best of all? It's Serverless and I'd argue it meets the purest standards of that.

Thanks for reading and happy building!
