---
title: Writing a Technical Blog Article
author: "Benjamen Pyle"
description: "I've had a few people ask me about my writing process and how I produced the articles and code that I do here on my blog. At first, I thought, no way anyone cares what it takes for me to produce the a"
pubDatetime: 2023-11-25T00:00:00Z
tags:
  - personal
  - writing
draft: false
---

I've had a few people ask me about my writing process and how I produced the articles and code that I do here on my blog. At first, I thought, no way anyone cares what it takes for me to produce the articles that I do. But as I stepped back and thought about it, looking back on my 1 year of solid writing I have developed a method to my creating. Hopefully, this proves useful and whether you are a veteran writer or just getting started, there could be something in here for you. Let's dive in and take a look at writing a technical blog article.

## Writing Background

I've mentioned this a few times, and those who know me in real life know this, but I always wanted to be a writer as a kid. I've always found writing to be the ultimate creative escape. What I produce is only constrained by what I create and imagine. For me, that can be freeing and that can also be terrifying. I'll pour through some of the two halves to that coin as we go along, but I want you to understand that I experience both. Not so much equally, and now that I've got almost 100K words written on this blog, I fear less than I am excited to create. But I can tell you that the fear of not producing something as good as the last thing I wrote is real and drives me forward.

I'm going to break things down into the following 3 sections.

1.  Ideation and organization
2.  Creating content (and sometimes code)
3.  Tooling

Let's get to it.

## Ideation and Organization

Coming up with something to write can be tricky at times and here's how I approach it.

### Article Forumla

First, keep things simple. I know my formula at the moment and I try to stay inside of that formula. The articles I usually produce are:

- Tutorials
- Architecture Opinions
- Leadership and Human-Focused

Inside each of those categories, I have different types of articles that might take me 2 - 5 hours to produce. Or there might be articles that take me 1 - 4 weeks to produce. The duration is usually wrapped around the technology that I'm using to build the sample repository. For example, anything Rust at the moment is going to take me more than 1 week to pull together. I'm just not that efficient at Rust and the AWS SDK yet.

Note of encouragement. I DID NOT realize this formula until about halfway through my first year of consistently building content. So for me, let's call it 25 articles. I also want to encourage you to be flexible in what you produce. Again, I'm writing because I enjoy it. But a word of warning, if you bounce around too much too quickly, you might not develop the consistent and steady readers you hope to gain. End of the day, I enjoy writing what I write and I have found a wonderful community and growing readership so this all lines up for me.

### Ideation

Now that I've established categories of articles I can pull from, I like to think about at least 2 or 3 candidates at a time. I store all of my articles in Markdown in GitHub (which I'll get to later) and keep those candidates with some placeholder text until I feel good about what I want to produce.

#### Content Types

As for the content itself, I usually pull from these areas:

If it's a tutorial:

- I might have some version of it working on at my job.
- As an AWS Community Builder, I'm exposed to so much beyond just what I work on day to day. So I might pull from those experiences.
- Occasionally I see something written or said, that I want to put a slightly different spin on and use the original as inspiration.

Architecture opinions generally come from 3 places

- I've encountered something at work that I want to explore further
- I've read something by another author that I have a different opinion on and want to offer that up.
- Lastly, the world of Cloud Computing and AWS in particular is so big that the more I write and the more I learn, the more opinions I generate. So I put them down.

Leadership and Human-Focused topics are where I like to offer my specific uniqueness to the world of tech blogging. Here's why. There are so many blogs, articles and opinions on the internet about things like Golang, Rust, AWS, Cloud, Serverless etc. But I am not just a builder and a creator, I'm also at the moment a CTO which means that I don't make decisions one byte at a time. I make decisions with humans at the forefront of my thought process and then I move into the bytes.

So when I'm writing leadership pieces, I'm probably at my most vulnerable but I also see those as the ones where I'm least likely to fail. It's strange I know. Most of my readers are not CTOs and are generally there for the tech content but I like to think that my tech content is better because it's interspersed with these leadership pieces.

### Organization

I keep this part super simple. I like to think of what problem or thesis I'm trying to support or offer. Then I work backward from there always validating that what I want to get across is accomplished by the end.

My format is pretty consistent too.

- Introduction
- Set up the problem and show an architecture or a thesis
- Walk through the concepts in a structured yet conversational order
- Wrap up with some points that drive home the article, link to a GitHub repository if included and leave the reader with some things to ponder going forward

Once I've nailed down my topic and my format, it's time to get writing.

## Creating Content

My brain doesn't work like everyone else's, I know that. I have always been gifted with a memory and the ability to shelve and pull from parts of my brain almost like background processing so to speak. So while creating content, I've almost written the article in my head before I ever put words to the editor. Remember above that I'm thinking about multiple articles at a time, that's how I like to write them as well. Some days the background processing happens rapidly and other days, well it takes more time.

The next part of the process takes 1 of 2 paths. When I'm doing coding articles I always start with working code first. If there however is no coding sample, then I just get into the content.

### Coding Articles

These types of articles are the most intense to write for reasons that are probably pretty obvious.

Small aside, I've been a developer since the mid-90s and consuming tutorials and SDKs has changed so much since then. I can remember getting textbooks and reference books on C, C++, MFC, Linux and everything I could get my hands on as this was the best way to learn and troubleshoot issues. Fast forward through the years and I learned like everyone else to pick up tips and tricks via the internet. Many articles, forums and bulletin boards have catered to this style of learning.

Coming back to the article, one of the things that has personally bothered me about such content is that they often feel incomplete. Sure, if the article is about a specific function or behavior, I understand it not having a working sample. But for what I'm doing, I want readers to leave with a repository that they can clone and interact with. I also want the example to showcase beyond the basics. For instance, if I'm doing something with IAM and AWS, you can expect my service roles aren't going to be `*`. This doesn't show the reader the proper setup that they can take and build upon. And I feel that it's lazy on my part as the writer.

#### Creating the Repository

That fully working example can take me anywhere from 4 hours to 4 or 5 days depending upon the complexity. If the article is about AWS, I always make sure that I'm using IaC (Infrastructure as Code). Additionally, I'll provide instructions in the README on how to set up the example, any dependencies and then how to run it. This might include scripts or data files that need to exist.

### Crafting the Body

With the repository built or concept flushed out if I don't have code, I do my best to get the body of the article done in one sitting. I consistently shoot for at least 1,000 words and no more than 2,500 and with the days before mapping out in my head and the work done on the repository, I can usually make this happen in a few hours.

This might be an interesting approach, but I don't read the article while I'm writing it. I will fix issues that I see grammatically or with spelling, but I don't read the content. I naturally let the words flow from brain to fingers streaming sentences together. I don't like my writing to be super technical and again, with only 2,000-ish words, I don't have to keep checking chapter by chapter for consistency of the characters.

The last part that I like to include when creating is to include pictures. I find that architecture diagrams, images and other screenshots help do two things.

1.  It breaks up the writing and gives the reader some natural breaks
2.  It helps with SEO

#### Reviewing the Work

Once I'm at the bottom of my consciously streamed article, I will go back and reread it from top to bottom. I'll get into tools and whatnot below, but I write everything in Markdown and I read the article raw and not formatted. I also leverage Grammarly which was a tip by [my friend Allen Helton](https://www.readysetcloud.io/authors/allen.helton/) so as I'm reading I fix any mistakes that the tool picks up or that I find while proofing.

I'm not meticulous about what I find looking for the perfect structure. I want the article to flow and read well. I also like a more disarming approach to how I use words so I don't fret over formality and whatnot. I focus on, did the article read well and did I address the topic I wanted to address by undertaking the piece. Simple as that.

> But I am not just a builder and a creator, I'm also at the moment a CTO which means that I don't make decisions one byte at a time. I make decisions with humans at the forefront of my thought process and then I move into the bytes.

## Tooling

As a programmer, tools matter. Most of us are creatures of habit and hold steadfast to the things we swear by. My opinions on writing tools are this. I want things that help my writing flow and embrace my natural pragmatic approach to things. I don't need or want fancy. I favor function and knowing how to get words out of my head and into the blog.

### Editor

Simple. VSCode. I like writing content in Markdown as it gives me a level of control over the formatting without giving me too many options. I also like that I can live-preview the article in VSCode so that I can see how things are taking shape while writing.

### Spelling and Grammar

I use Grammarly as I mentioned above. I tend to balance fixing things as they pop up when I see the red squiggly and at the end as I sweep through reading the article for final publishing.

### Blogging Software / Hosting

I use a version of WordPress that is hosted on AWS Lightsail. I keep the site updated with patches by using the Bitnami image and then I keep my plugins super lean on Wordpress. All in on hosting I pay around $7.50 a month. Super cheap.

#### Plugins

I tend to rely on 2 main plugins.

One is a Markdown importer so that I can import my work from VSCode cleanly into WordPress.

The second is Yoast. This plugin helps tremendously with SEO and content optimization. I have a paid copy of the plugin and it's been a valuable partner to me. My current traffic from search is around 35% which is up from about 5% when I first started blogging. SEO isn't easy but with some help, it's also not hard. I highly recommend Yoast.

## Bringing it all back together

So in 2023, I set out to write an article a week for the entire year. I made that happen somehow. Knowing what I know now, that was a more ambitious goal than I realized in '22. However, the above process was refined from all of those Saturday mornings that I spent before the family was awake to produce content.

Going into '24, I'm going to slow things down a little bit. I won't say more quality, as I think I put out some quality content now. But I will venture outside of my day-to-day a little bit. I'd like to explore FIS, Greengrass and other AWS Services that I don't use every day. I'd also like to continue learning and using Rust which will make for some interesting content. And lastly, as a DataDog Ambassador, I want to produce more articles around their ecosystem as well. So I know it'll just take me more time.

I hope this has been helpful and a fun read. Writing for me is fun and it's creative. It's about teaching, learning and getting better all at the same time.

Thanks for reading and happy building!
