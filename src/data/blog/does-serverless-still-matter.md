---
title: Does Serverless Still Matter?
author: "Benjamen Pyle"
description: "No. Short, simple, and direct. The answer to the question is that serverless at this point and time doesn't matter. Now I'm not saying that it's never mattered. But what I am saying is that it's just"
pubDatetime: 2024-06-02T00:00:00Z
tags:
  - people
  - serverless
draft: false
---

No. Short, simple, and direct. The answer to the question is that serverless at this point and time doesn't matter. Now I'm not saying that it's never mattered. But what I am saying is that it's just a tool in a developer's toolchain. It's not some sweeping "movement" that it was and I firmly believe that this is all OK. I don't see this as doom and gloom. It's more about WOW, that happened, now what's next. With that, let's look at how we got here and where I think we go from here.

## The Serverless Arc

There are always people coming in and out of a community or technology ecosystem. Serverless is no different. And while some might say serverless is new and unproven, they'd be mistaken. Google began shipping pay-as-you-go compute in the late 2000s but it wasn't until AWS released Lambda in 2014 that the serverless banner was hung in the cloud. That gives the services and patterns more than 10 years of real-world production deployments. There's been time to learn, fail, and harden so that its use cases can be clearly defined and exploited. Additionally, as computing continues to improve, the lines have gotten blurry when having to decide to choose always-on vs event-driven serverless computing. The performance of serverless compute is almost on par with those in the full time workload camp. Anyone who says differently hasn't been paying attention. Serverless has been deployed successfully in some of the most demanding of cloud-native businesses.

Let's pretend for a minute that you need even more convincing, then [here's a great whitepaper](https://www.gomomento.com/resources/downloadable-resources/a-guide-to-unlocking-serverless-at-enterprise-scale) that drives these points home even further. Spoiler, you might recognize the author.

Serverless has a story and with all stories, there is a beginning, middle, and end.

### The Early Days

My perspective doesn't come from the excitement of launching new products and services in one of the big vendors but from that of a cloud builder and community member. Sure, I haven't always been as active as I am now, but I am an early adopter who approaches things with a healthy dose of skepticism. I don't want to make bets on things that end up having to be replaced because the tech was abandoned. I feel like serverless was born during a time when service buses were dying and the birth of microservices and containers was happening as well. I lived through the container wars and container orchestration discussions and remember how easy it was for serverless to slide under the radar. It wasn't until 2015 that I actually got my hands on Lambda and then in 2016 when I put something in production powered by this thing called serverless compute. If you've heard me say serverless is more than just compute. That's true now, but it wasn't always that way.

From a community and builder standpoint, AWS didn't make quite the push that I remember. I believe that early practitioners and precursors to the Developer Advocate explosion were building patterns and materials to onslaught the market with what their engineering teams had produced. Again, this isn't backed by specific inside knowledge, only my perception and what I imagined would have happened. Serverless to me had gotten lost in the shuffle while the architecture and developer community leaned into container-based distributed APIs.

The early days though just like any set of early days were filled with hope, promise, and a chance at changing the status quo.

### Mid-Life

At this point in the serverless arc, things really started to pick up. If I was going to put a time on things, I'd say mid-life started in late 2016 and we are currently living in these same times. From my vantage point, there was a massive energy that was released from AWS and others to saturate the market with quality materials, samples, and patterns so that any builder looking to jump on the train had an easy on-ramp. The serverless energy was almost like the early days of the iPhone. You almost couldn't help but buy into the hype. Because honestly, it was hype. There were limited runtimes, not nearly as many connection points that exist now, DynamoDB modeling was proven in-house but not so much in industry, and Lambda itself suffered massive spin-up times. Some of these issues limited a builder to using Lambda in only asynchronous type workflows. I know it's hard to believe, but there was no EventBridge or Step Functions either. Seriously, early times had a bunch of hype mixed in with a great deal of promise.

It was that promise that fueled a movement. A movement that AWS and others invested heavily in by encouraging community and online discord to the point of it being everywhere. I've been doing this since the mid-nineties and I've never seen a push and rally behind something quite like this. Docker, Ruby on Rails, Java, .NET, and the current version of AI are the only things that I remember in my career that have come this close.

If I take a step back and look at why serverless is so interesting to me, it's because it's not like Docker, RoR, or Java. Those were open source projects that had tremendous support from community members. We all know how passionate open source contributors can be. And yes, I remember Java started with Sun but it did get released as open source. It also was heavily supported by people who wanted to work in Free and Open Source technologies. At the time, Java == Linux and Linux wasn't Microsoft. So why am I digressing here? Because serverless has nothing to do with open source. I get it, AWS Firecracker which powers Lambda is open source, but serverless in and of itself is not a technology. It's a description or an umbrella that a capability lives under. When I look at these facts, I find the whole thing so interesting. The communities that stood up around serverless were quasi-corporate sponsored communities and that hadn't happened before in my memory. Not at the scale and the force that serverless did it.

Zeroing back in on the present, I do believe that we are at the tail end of the mid-life arc for serverless. For clarity, I don't think serverless is done by any stretch. Capabilities still need to be added, integrations built, continued work on observability, and generally more undifferentiated heavy lifting to take care of. But it feels to me like we've entered into a new space. The ones that launched this "run code without worrying about infrastructure" movement have gotten distracted by the next disruptor. In all fairness, this happens in any industry and with any technology. Innovation is like breathing. But what I don't like about what I see with the serverless ecosystem is this. If the iPhone is analogous to an appliance at this point and it can only take quality-of-life updates, then I believe that serverless is getting close to that point. I don't think it has to reach that point but with a lack of innovation from the big providers, the movement will begin to lose steam. Enter the end-of-life phase.

### End of Life

Everything gets here. Software, animals, people. We are born, we live, we die. As I mentioned above, serverless will eventually get to the point that it's like the iPhone. It will receive quality-of-life updates and those that market and sell will continue to make each release cycle sound like the next best thing is here. ElastiCache and OpenSearch Serverless sound familiar? But truthfully, builders can smell and feel what's not all the way real. This isn't a bad thing honestly at its core. All of the serverless code and applications in production can't just "go away". AWS, Google, and Microsoft will continue to run these workloads for us and the software systems we've built will continue to live on. Code spends more time in maintenance than in any other phase of its life.

However, what will happen is that the energy, content, and communities will also slowly spin down and we will leave the era of "run code without thinking about servers" and move into the world of what's next. If current trends follow, it'll be the world of AI and the creation of code without servers as well. So we went from running and not caring about the infrastructure to now generating code that we don't care what infrastructure created it. If we enter the end-of-life phase and you don't realize the impact that serverless has had, you truly haven't been paying attention.

The point of acknowledging this though is important. Serverless won't end because it wasn't impactful, meaningful, or real. All things go out of style especially something that was corporate-backed. They will move on to what's next because that's how you innovate, make money, and generate more value. Serverless was important.

## What's the Point?

Now that we've taken that detour through what I believe is the arc of serverless, how can I possibly say that serverless doesn't matter? If you look me up online, you'll see that I'm an AWS Community Builder focused on serverless, I'm an active writer and code producer who is very often serverless, and I'm a Champion in the [Believe in Serverless community](https://www.believeinserverless.com/). I can believe in the arc I shared above and believe in serverless itself. Those things aren't at odds. And here's why.

### The Phoenix

If I was casting a vision for the future, here's what I think. Serverless the big corporate-sponsored version is on the slide towards the end of life era. But just like the Phoenix from mythology, serverless has a chance to be reborn and rise from its ashes. You can see that happening actually now. Kind of weird that death and life are happening at the same time, but they are. The most amazing thing that AWS, Google, and Microsoft have given to the world is the gift of obscene amounts of compute and wonderfully built infrastructure. That infrastructure provides us as builders compute power beyond our wildest dreams. But not beyond the visions of new leaders in the serverless product space.

New products are being created seemingly overnight. Products like [Momento](https://www.gomomento.com/) are not building serverless cache, they are re-imagining caching and application performance while solving the problems with a serverless mindset. [Serverless Postgres](https://neon.tech/) is now a thing. And companies that have traditionally been installed are now embracing serverless. Just look at [InfluxDB](https://www.influxdata.com/) which is now offering a serverless version.

Serverless is going to be reborn because the promises it makes are sound and good for developers and businesses. Businesses that are buying products built with serverless and good for businesses that are building serverless offerings. If I had to look forward 5 years ahead, I see a world where more companies like this are spinning up and filling the gaps that AWS, Google, and Microsoft are leaving by being so heavily invested in AI. And by the time those giants spin back around, maybe they can buy their way back in, or maybe they won't want to, but we as builders will have moved on as well. Not without serverless, but without big corporate serverless.

### Value over Dogma

I mentioned it above, but other successful "movements" in tech were fostered and cared for by passionate open source contributors. Serverless doesn't share those roots as like I've mentioned, was born out of companies. But what has happened is that the serverless movement, along with a boost from these new upstart vendors has the human capability to carry forward in this new world. Communities like [Believe in Serverless](https://discord.gg/ys7wtdwCC5) are fostering collaboration and engagement regardless of your flavor of serverless or programming language of choice. What I find so interesting about what I see right now is that the online discourse has moved passed talking about the far left or far right of serverless and is just talking about delivering value and solving problems. The word serverless rarely comes up. The focus has found its way to value, users, and developer experience. Which is right where it always is down the center of the tech world.

What I also find unique to this version of the serverless community is that it's open not just to a vendor but not even to being serverless. The concept of serverless only pushed too far into the dialogue and I believe that was true because of where it was coming from. The truth is, it can be serverless only, but almost every deployment is going to be serverless plus. And the most responsible thing a serverless architect can do is be serverless first but not serverless always. It just doesn't make sense. And this community gets that. It's different than what it was like in years previous. Version x.0 of Serverless is a much more moderate and tempered crowd. Which ultimately is a great thing.

So again, serverless doesn't matter. Value has always mattered. And what's being shown is that serverless plays a role in shipping value. But honestly, it always had.

### People

I always end up back here, don't I? I believe strongly that there is more humanity in tech than people want to acknowledge. Sure, algorithms, data structures, transistors, power, and everything in between are very scientific. But just like there are physical aspects to a building, if it didn't deliver a solid user experience, the building wouldn't sell. Software is like this but at a higher level. You can't build good software without the help of others. And you can't build a good community or support a movement like serverless without amazing people.

I've said this from day 1 as being public in the serverless and tech community, that I wouldn't be doing or sharing most of this content if it wasn't for the people. Serverless doesn't matter to me because I could be writing COBOL code with the people I've met as a part of this movement and it would be A-OK by me. 25 years ago I was involved in Linux communities because the people were awesome to hang out with. And serverless to me has that same feel. And it's something I give AWS credit for even beyond the software and the marketing that launched serverless into the world like the Hulk Ride at Universal Orlando. They launched serverless with amazing people. And they recruited heavily to build communities and groups that also had quality humans at the core.

Those are facts that just underscore for me that serverless doesn't matter. People do. They always have and they always will long after the world realizes that GenAI is just the next fad.

## Wrapping Up

And even though these times are fading, the people aren't. We are just finding other ways to organize and collaborate. And if the computers and the AI take away this craft called programming that I love dearly, I'll still have the friends and relationships that I've made through being in this community. And then perhaps we'll have more time on our hands to do things IRL vs always being virtual. Who knows.

But I do know this. Serverless mattered. A computing movement was built that helped shape this next phase and the world is better for having had this happen.

But I also know that it mattered for reasons behind the compute. It mattered because of the community that was born from it. Artificial, manufactured, or cultivated, who cares? It happened. And what happens next is also why serverless no longer matters. Because the people that came together matter more and the future is brighter than it's ever been.

Thanks so much for reading this different piece. And happy building!
