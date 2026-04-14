---
title: Caching with Momento and Golang
author: "Benjamen Pyle"
description: "Caching. Simple. Useful. This architectural topic applies to a serverless app as well as an app with servers. Some functions never need caching, and some benefit from it right as the first user traffi"
pubDatetime: 2023-05-20T00:00:00Z
tags:
  - aws
  - cdk
  - datadog
  - golang
  - momento
  - programming
  - serverless
draft: false
---

Caching. Simple. Useful. This architectural topic applies to a serverless app as well as an app with servers. Some functions never need caching, and some benefit from it right as the first user traffics some data through it. I've used a variety of caching tools over the years but recently dropped [Momento's](https://www.gomomento.com) serverless cache in a real-time ETL application and I was astonished at how easy it was and how well it is performing. This article is a walk-through of my experience of Caching with Momento and Golang.

## Solution Diagram

![Moment and Golang](/images/Cache_Sample.png)

Imagine this is part of a broader ETL-type process. Something like what is described in this [article](https://binaryheap.com/event-driven-serverless-data-architecture/). Data is streaming into one lambda, whose purpose is to route and send traffic to downstream systems. The routing configuration is stored in a DynamoDB table. Now, there is nothing wrong with continuing to have the data pulled from DynamoDB. Consistency of performance is pretty much guaranteed if we modeled our schema correctly. But let's say that I'm looking to shave just a little bit of time off my overall pipeline duration. Or perhaps I'm wanting to save a few (or maybe more) dollars on cost from querying DyanmoDB.

First off, before Momento, if I wanted to start using a cache in this workflow I better have a real performance problem because caching with ElasticCache or DAX is not cheap.

Secondly, I've got to understand a great deal about my requirements and then understand how to scale that cache as you have to pick server sizes, and node numbers and be able to handle expansion as the cache grows.

These two reasons alone are why this workflow has never had a cache in front of the queries. So we are clear, this is an example but it's very close to something that is live in production and has been in production for quite some time. So it's not like I started trying out Momento with something that's not used. I picked something critical and had a decent amount of traffic. For reference, yesterday it encountered around 12,000 invocations so again, not crazy, but not "nothing" and it's in a critical path on the pipeline.

## Sample Code

With everything as usual that I'm sharing, it's backed by [CDK](https://binaryheap.com/intro-to-cdk/) to deploy the infrastructure. This is a very simple deployment for highlighting caching with Momento and Golang. It contains the following resources:

1.  A Lambda function coded in Golang
2.  DynamoDB table
3.  Secret that holds my Momento API Token

For starters, grab a token from the [Momento console](https://docs.momentohq.com/getting-started)

Store that in Secrets Manager

```bash
aws secretsmanager create-secret --name mo-cache-token --description 'Momento API Token for working with the Router' --secret-string '{"token": "}'

```

Make note of the name you set because it'll matter when granting fine-grained permissions in IAM for access and decrypting.

### Function CDK

The function CDK code looks like this

```typescript
export class CacheFunction extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const version = Math.round(new Date().getTime() / 1000).toString();

    // The DDB Table for lookup with a simple Primary Key
    let table = new dynamodb.Table(this, id, {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: false,
      tableName: "SampleLookupTable",
    });

    // Basic Golang function
    let func = new golambda.GoFunction(this, `CacheFunction`, {
      entry: path.join(__dirname, "../../resources/router"),
      functionName: "cache-function",
      timeout: Duration.seconds(30),
      environment: {
        DD_FLUSH_TO_LOG: "true",
        DD_TRACE_ENABLED: "true",
        LOG_LEVEL: "debug",
        CACHE_NAME: "sample-cache", // Momento Cache Name
        TABLE_NAME: "SampleLookupTable",
        IS_LOCAL: "false",
      },
    });

    Tags.of(func).add("version", version);

    // grant access to read and write
    table.grantReadWriteData(func);
    // grant access to query/decrypt the token secret
    const s = Secret.fromSecretNameV2(this, "Secrets", "mo-cache-token");
    s.grantRead(func);
  }
}
```

With this function setup, I've set up a basic Lambda that has access to the DynamoDB table and the ability to read and decrypt the token. The Momento token must be used for all queries and it's transparent to the user when working with it beyond creating the client.

### DDB Record

Next, let's take a look at this simple lookup table. For right now I've just defined one simple record that has a key and the mock URL for the queue I might be forwarding onto.

![DDB Record](/images/ddb_record.png)

This is important as it's the route lookup for the Lambda. This is the exact data that I'm going to be caching. The QueueURL that is.

One of the nice things about Momento is that it supports many out-of-box data types. For such a young product this is a great thing. So far I've personally used Strings and Sets but there is support for Sorted Sets, Dictionaries and Lists. Lots of really good things in there. For more reading, [here is the data type documentation](https://docs.momentohq.com/develop/datatypes)

### Golang Code Setup

Now for the code that does the work on caching with Momento using Golang.

```go
func handler(ctx context.Context, e SampleEvent) error {
    log.WithFields(log.Fields{
        "event": e,
    }).Debug("Printing out the event")

    route := determineRoute(ctx, e)
    if route != nil {
        log.WithFields(log.Fields{
            "route": route,
        }).Debug("Printing out the route")
    }

    return nil
}

```

This is the handler code that Lambda runs for me. If things go well, you'll get a printout of the event and then the route as well if things were found.

While here, let's look at the `init()` function as well.

```go
func init() {
    isLocal, _ := strconv.ParseBool(os.Getenv("IS_LOCAL"))
    // fetch the token from secrets
    token, err := GetSecretString()

    // define the log formatter
    log.SetFormatter(&log.JSONFormatter{
        PrettyPrint: isLocal,
    })

    // if the token can't be fetched, shut down the execution
    if err != nil {
        log.WithFields(log.Fields{
            "err": err,
        }).Fatal("Fetching token failed, now I have to go away")
    }

    // build the Momento client
    cacheClient, err = NewMomentoClient(*token)
    // if the client can't be built, shut down the execution
    if err != nil {
        log.WithFields(log.Fields{
            "err": err,
        }).Fatal("Creating cache client, now I have to go away")
    }

    // build up the DDB client, router and set the cache, table name and determine the log level
    dbClient := NewDynamoDBClient(isLocal)
    routeRepository = &RouterDynamoRepository{db: dbClient}
    tableName = os.Getenv("TABLE_NAME")
    cacheName = os.Getenv("CACHE_NAME")
    SetLevel(os.Getenv("LOG_LEVEL"))
}

```

### Golang Code Route Lookup

Moving into the Route lookup, here's the func that handles the code

```go
type Route struct {
    Key      string `dynamodbav:"pk"`
    QueueUrl string `dynamodbav:"QueueUrl"`
}

func determineRoute(ctx context.Context, e SampleEvent) *Route {
    // this is where I poke into the cache
    r, err := ReadRoute(ctx, e.Name)

    if err != nil {
        log.WithFields(log.Fields{
            "err": err,
        }).Error("Error fetching route from cache")
        return nil
    }

    // if found, just return the value
    if r != nil {
        log.Debugf("Route was in Cache")
        return r
    }

    // no cache hit, go to DDB
    route, err := routeRepository.GetRoute(ctx, e.Name)

    if err != nil {
        log.WithFields(log.Fields{
            "err": err,
        }).Error("Error fetching route from DDB")
        return nil
    }

    // if the route is found in DDB, set the cache
    if route != nil {
        log.Info("Setting the Cache")
        err = SetRoute(ctx, route)
        if err != nil {
            log.WithFields(log.Fields{
                "err": err,
            }).Error("Error setting route from cache")
        }
    }

    return route
}

```

Before reading from the Cache, I needed to configure the client. This in my opinion is super simple. It feels as easy as working with the AWS SDKs. Remember the token I put in Secrets Manager? This is where I make use of it.

```go
func NewMomentoClient(token string) (momento.CacheClient, error) {
    // Initializes credential provider from token
    credentialProvider, err := auth.FromString(token)

    if err != nil {
        return nil, err
    }

    // Initializes Momento
    client, err := momento.NewCacheClient(
        config.InRegionLatest(),
        credentialProvider,
        600*time.Second)

    if err != nil {
        return nil, err
    }

    return client, nil
}

```

Reading from the Cache is also simple. I'm using a basic string for the value so a simple GetRequest is executed. Again, feels like working with DyanmoDB in a lot of ways

```go
func ReadRoute(ctx context.Context, key string) (*Route, error) {
    // build the request
    request := momento.GetRequest{
        CacheName: cacheName,
        Key:       momento.String(key),
    }

    // make the query
    resp, err := cacheClient.Get(ctx, &request)

    if err != nil {
        return nil, err
    }

    // the Get returns an interface for working with
    // if it's a Hit, let's return the value
    if v, ok := resp.(*responses.GetHit); ok {
        log.WithFields(log.Fields{
            "key": key,
        }).Info("Cache hit")
        return &Route{
            QueueUrl: v.ValueString(),
        }, nil
    }

    return nil, nil
}

```

Then on the other side, if the cache read is not a hit, I want to set the value for the next time I want to read from it.

```go
func SetRoute(ctx context.Context, route *Route) error {
    // build the momento value
    v := momento.String(route.QueueUrl)
    // build the set request
    request := momento.SetRequest{
        CacheName: cacheName,
        Key:       momento.String(route.Key),
        Value:     v,
    }

    // execute it
    _, err := cacheClient.Set(ctx, &request)

    if err == nil {
        log.WithFields(log.Fields{
            "key": route.Key,
        }).Info("Cache set")
    }

    return err
}

```

## Run the Code

So the Momento cache is built and accessed with Golang in code, but what does that look like when running it?

First up:

```bash
cdk deploy
# watch
cdk watch # this just is a nice little nugget

```

Then create the record I showed above in DynamoDB

Lastly, let's run the Lambda with this event payload

```json
{
  "name": "sample",
  "correlationId": "abc"
}
```

Once you've done all of that, you'll get some output that looks like this.

First, run, you'll set the cache as a miss, the DDB is queried and then set.

![Hit Miss](/images/mo_init_run.png)

Run it a second time, and you'll see the cache hit

![Output](/images/mo_run.png)

## Impressions

OK, so I've shown a sample of how things work. This repos will 100% deploy and run just fine for you as something to build upon, but I'd not be doing this tool service without adding some thoughts and opinions as it's just that good.

### Ease of use

Can't overstate this enough. It's just easy. As I mentioned in the beginning, I took something that was already in production and a candidate for caching but I didn't want to incur the cost of DAX or ElasticCache. It is this simple:

1.  Setup an account with Momento
2.  Create a cache via console or CLI
3.  Drop it in your code.
4.  Enjoy

### Pricing

I'll let their [page](https://www.gomomento.com/pricing) speak for itself but honestly, this is exactly why it makes so much sense. Something that's this easy and has this simple of a pricing model is just awesome. It reduces the barrier to overcoming two of the fronts that are generally big road blocks.

### SDK Support

Out of the box you've got support for Go, Java, .NET, Node, PHP, Ruby and Rust. Having a clean and simple SDK makes developing so much easier. Being a Golang developer, I can say the SDK feels super Go-ish. Which is a compliment. I had no issues reading through the code and looking at some examples to get up and running.

### Data Type Support

I mentioned this above but the variations in data types for something so new is amazing. I'd have been stoked for just string support, but having Sets and List and Dictionaries open up the options for what you can build and how you can store your data. Can't understate this as there's so much opportunity to build here.

### Performance

Kind of funny that performance is the last thing I'm listing for something that is designed to improve performance. But again, it just does its thing so there isn't much to say about it. I created a [wrapper](https://github.com/benbpyle/momento-go-ddtrace) around the client so that I could use my normal [Datadog](https://binaryheap.com/observing-with-aws-lambda-datadog-and-go/) tracing and I've observed consistent < 10ms performance from the cache. And if you think that it takes the burden off my DDB queries which are also super performant, Momento runs at a fraction of the cost and with a consistent grade of performance. You won't be disappointed.

## Wrap Up

Adding in Caching with Momento using Golang is a no-brainer in my opinion when you've got a problem that requires caching. I've said it a couple of times in this article but I'm blown away by the functionality, the lack of bugs and the ease of use on top of great pricing and performance. You can tell that this was built by people that understand the problem, understand Serverless and understand the value of community. The Discord server is super welcoming and helpful and the documentation is coming along nicely to match the features. Things are still in the "you might need to read some source code" to figure something out, but I don't see that as a bad thing at all. And I'm 100% confident that it's only going to get better from here.

If you've got this problem, you need to take a look at this tool. In my opinion, caching has never been this simple, effortlessly scalable and affordable. Well done to this team.

As always, here is the [GitHub repository](https://github.com/benbpyle/momento-go-sample) where you can clone the code and deploy it and play around with it. I hope you found this helpful. I'm excited to get back to coding!
