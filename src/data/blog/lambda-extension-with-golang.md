---
title: Lambda Extension with Golang
author: "Benjamen Pyle"
description: "Lambda extensions built with Golang enable cross-language reuse by running a sidecar HTTP API for caching with Momento and DynamoDB read-through."
pubDatetime: 2023-06-18T00:00:00Z
tags:
  - aws
  - cdk
  - golang
  - programming
  - serverless
  - typescript
draft: false
---

For full disclosure, I've been writing Lambda function code since 2017 and I completely breezed over the release of Lambda Extensions back in 2020. [Here's](https://aws.amazon.com/blogs/compute/introducing-aws-lambda-extensions-in-preview/) the release announcement. At the core of extensions, you have internal and external options. For the balance of this article, I'm going to focus on building a Lambda extension with Golang and lean into the external style approach.

## Extensions and Why

Taking a quick step back, why extensions? From an architect level of thinking, extensions give me the ability to have cross-team reuse of code without being tied to a particular language or build process. For something like Node or Python, you could use a standard Layer to package your Lambda reuse. But for something like Golang, where your code is packaged at build time and not run-time, then you sort of have to look at the shared library. [I wrote about that here](https://binaryheap.com/golang-private-module-with-cdk-codebuild/). But what if you wanted to create some shared functionality that was usable regardless of which language you built your Lamabda in? That seems to have some serious appeal for my current projects where teams are using different stacks to build their APIs due to need and comfort.

The other component when deciding to use extensions depends upon whether you'd like to participate in the Lambda lifecycle events. This diagram courtesy of the AWS Compute Blog shows what that looks like.

![Lambda Lifecycle](/images/4a-Lambda-lifecycle-for-execution-environment-runtime-extensions-and-function.png-1024x493-1.png)

## Journey through the Sample Code

With the above stated, I was working on something related to rewriting our platforms IAM and Permission evaluation platform. As we started to get towards the end of the design phase, I wanted to build some tools that helped the engineering team more easily take advantage of the new platform. One of my favorite things is building when it helps others build faster. I tend to like building for the builders vs building for a non-technical customer, but that's an article for another day.

I obviously can't share the private code that was worked on. As I get more markers in production showing performance, I'm going to share the benefits of using [Momento](https://www.gomomento.com) in front of DynamoDB. I will surely touch upon some of the why though as we work through this. So what I ended up doing is taking a small part of what I learned, and packaging it up in a sample that we could walk through.

The premise of this sample is that I want to build a Lambda Extension with Golang that takes advantage of providing a consistent API for querying but the extension abstracts away the fact that a caching layer using Momento is in front of DynamoDB. The architecture for this look like the below:

![Lambda Extension with Golang](/images/Arch.png)

### Building The Extension

#### Registration

As I explained earlier up in the article, this is going to demonstrate an external extension. This means that I'm going to need to leverage registering the extension with the Extension API.

Registering the Client looks like this ()

```go
func (e *Client) Register(ctx context.Context, filename string) (*RegisterResponse, error) {
    const action = "/register"
    url := e.baseURL + action

    reqBody, err := json.Marshal(map[string]interface{}{
        "events": []EventType{Invoke, Shutdown},
    })
    if err != nil {
        return nil, err
    }
    httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(reqBody))
    if err != nil {
        return nil, err
    }
    httpReq.Header.Set(extensionNameHeader, filename)
    httpRes, err := e.httpClient.Do(httpReq)
    if err != nil {
        return nil, err
    }
    if httpRes.StatusCode != 200 {
        return nil, fmt.Errorf("request failed with status %s", httpRes.Status)
    }
    defer httpRes.Body.Close()
    body, err := ioutil.ReadAll(httpRes.Body)
    if err != nil {
        return nil, err
    }
    res := RegisterResponse{}
    err = json.Unmarshal(body, &res)
    if err != nil {
        return nil, err
    }
    e.extensionID = httpRes.Header.Get(extensionIdentiferHeader)
    print(e.extensionID)
    return &res, nil
}

```

This should look familiar to this [AWS Repository](https://github.com/aws-samples/aws-lambda-extensions/blob/main/go-example-extension/extension/client.go). I'm still personally exploring more of how I can customize and instrument some of this code, but the extension is registered and ready for use by this function.

#### Defining the API

Now think of the extension as a sidecar to your Lambda. It's running in an external process but in the same shared space as your primary Lambda code. This code is simply then exposed over an HTTP API of your choosing. Pretty cool isn't it?

This again opens up the world for however, you want to define your micro HTTP server. For this use case, I'm going to use Chi. Defining the route, in this case, will have a basic `/{key}` definition.

```go
func startHTTPServer(port string, config *Config) {
    r := chi.NewRouter()
    r.Get("/{key}", handleValue(config))

    logrus.Infof("Starting server on %s", port)
    err := http.ListenAndServe(fmt.Sprintf(":%s", port), r)

    if err != nil {
        logrus.WithFields(logrus.Fields{
            "err": err,
        }).Error("error starting the server")
        os.Exit(0)
    }
}

```

And since the main loop is waiting for Lambda events and not the Web Server, I'm going to fire this server off in a Go Channel. I'll highlight the main loop here in a bit

```go
// Start begins running the sidecar
func Start(port string, config *Config) {
    go startHTTPServer(port, config)
}

```

#### Implementing the Route Handler

This implementation will be specific to Chi, but again you could be coding this in anything you want and it could look like the mux of your choice. I will advise you that keeping your layers small and efficient is something you should pay attention to. You can't do much better than going with Golang for this choice but that's also my bias speaking.

```go
func handleValue(config *Config) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {

        v := chi.URLParam(r, "key")
        m, err := config.CacheRepository.ReadCache(r.Context(), v)

        if err != nil {
            http.Error(w, err.Error(), http.StatusNotFound)
            return
        }

        if m == nil {
            logrus.Debug("Cache miss, reading from table")
            i, err := config.DbRepository.ReadItem(r.Context(), v)

            if err != nil || i == nil {
                http.Error(w, err.Error(), http.StatusNotFound)
                return
            }

            config.CacheRepository.WriteCache(r.Context(), i)

            b, _ := json.Marshal(&i)
            w.Write(b)
        } else {
            logrus.Debug("Cache hit, returning from Momento")
            b, _ := json.Marshal(&m)
            w.Write(b)
        }
    }
}

```

This is the meat of the extension. Let's walk through what it does.

1.  It accepts a route and fetches the `{id}` from the path.
2.  Attempts to read the item by key from the Momento Cache.
3.  If the item is found and marshaled, it returns the item
4.  If the item is not found, it then attempts to look up the item by key from DynamoDB.
5.  If the item is found there, it then writes that item into the Momento cache
6.  Then returns the item
7.  If the item wasn't found in the cache or the table, it returns a 404 (not found) error

This a simple read-through cache example but again, shows the power of abstracting this away so any Lambda can take advantage of this very simple API.

#### Main Event Loop

As I mentioned, the Web Server is launched in a Go Routine but the main event loop is waiting on "events" from the attached Lambda.

- Invocation
- Execution
- Shutdown. etc

```go
func main() {
    ctx, cancel := context.WithCancel(context.Background())
    // other code omitted
    processEvents(ctx)
}

func processEvents(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            // this lambda is done
            return
        default:
            // handle the next event
            _, err := extensionClient.NextEvent(ctx)
            if err != nil {
                logrus.WithFields(logrus.Fields{
                    "err": err,
                }).Error("Error occurred.  Exiting the extension")
                return
            }
        }
    }
}

```

It's a really basic loop. But you could get more specific based on the type of event you are handling. For me, I don't care to handle specific events, I just want this thing running beside my primary function ready to fetch some data.

#### Packaging and Publishing the Extension

For convenience, I've added a Makefile to the sample code, but to highlight what all needs to happen.

When compiling, you need to tell Golang the OS and Architecture that you are building for. You want that to match the Lambda execution environment

```bash
GOOS=linux GOARCH=amd64

```

Next, the runtime will look for extensions defined in the `extensions/` directory. I'm not sure if you can change this (almost positive you can't), but I'm all for conventions.

Finally, push up the layer.

```bash
aws lambda publish-layer-version  --layer-name 'lambda-cache-layer' --region us-west-2 --zip-file 'fileb://extension.zip'

```

Do make note of the `LayerVersionArn` that comes back when you run this command as it'll be needed when you attach the layer to your functions.

To tie it all together, like I said, here's the Makefile

```bash
build:
    cd src/ext;GOOS=linux GOARCH=amd64 go build -o bin/extensions/lambda-cache-layer main.go
package: build
    cd src/ext/bin;zip -r extension.zip extensions/
deploy: build package
    cd src/ext/bin;aws lambda publish-layer-version  --layer-name 'lambda-cache-layer' --region us-west-2 --zip-file 'fileb://extension.zip' --profile=dev

```

### Using The Extension

Now that I've built and deployed a Lambda Extension with Golang, how do I use it in a Lambda of my choosing? Remember how I mentioned the "sidecar" model? To picture it, I like to think of my Lambda having a buddy like this:

![Lambda Buddy](/images/Main.png)

#### Including the Lambda as a Layer

As with all my articles, I'm going to build this infrastructure with [CDK](https://binaryheap.com/intro-to-cdk/)

Here's the TypeScript code for bringing in the layer, defining the Lambda and then granting access to the secret and table.

```typescript
buildTopLevelResources = (
  scope: Construct,
  resource: IResource,
  table: Table
) => {
  const layer = LayerVersion.fromLayerVersionArn(
    scope,
    "CacheLayer",
    "arn:aws:lambda:::layer::"
  );

  const func = new GoFunction(scope, "SampleFunction", {
    entry: path.join(__dirname, `../src/sample`),
    functionName: `lambda-extension-cache-sample`,
    timeout: Duration.seconds(10),
    layers: [layer],
    environment: {
      IS_LOCAL: "false",
      LOG_LEVEL: "debug",
    },
  });

  resource.addMethod(
    "GET",
    new LambdaIntegration(func, {
      proxy: true,
    }),
    {}
  );
  table.grantReadData(func);
  const s = Secret.fromSecretNameV2(this, "Secrets", "");
  s.grantRead(func);
};
```

I want to walk through a few sections of this.

I haven't shown code before in my articles with layers. Below is how you define one in TypeScript for CDK. You need to give it a "name", and specify the "arn" which includes

- Region
- AccountId
- Layer Name
- Version -- this part matters

```typescript
const layer = LayerVersion.fromLayerVersionArn(
  scope,
  "CacheLayer",
  "arn:aws:lambda:::layer::"
);
```

The second part of this block is the granting of access to the AWS Secret that is storing my Momento Token. For more on that process and my previous write-up on using Momento with Golang, [here is an article](https://binaryheap.com/caching-with-momento-and-golang/)

```typescript
const s = Secret.fromSecretNameV2(this, "Secrets", "");
s.grantRead(func);
```

#### Leveraging the Layer in Code

When building a Lambda Extension with Golang, the final step of making good with the extension code is to execute it. No surprise, I'm going to do that with another Golang function. However, here's the piece that I want you to take away about using extensions. Your function code doesn't have to be in the same code as your layer. My teams are currently writing Lambdas in Python, Golang and Node. But since this extension is running externally and is being accessed over an HTTP API, it's 100% reusable. This to me is a big advantage. Especially when you have code that say a platforms or architecture team could be working on that is dropped into your feature teams.

```go
type Model struct {
    Id       string `json:"id"`
    FieldOne string `json:"fieldOne"`
    FieldTwo string `json:"fieldTwo"`
}

func getModel(id string) (*Model, error) {
    request, _ := http.NewRequest("GET", fmt.Sprintf("http://localhost:4000/%s", id), nil)
    c := &http.Client{}

    request.Header.Set("Content-Type", "application/json; charset=UTF-8")

    response, error := c.Do(request)
    if error != nil {
        return nil, error
    }

    defer response.Body.Close()
    if response.StatusCode != 200 {
        logrus.Debug("Item not found by key")
        return nil, nil
    }

    resBody, _ := ioutil.ReadAll(response.Body)

    var model Model
    err := json.Unmarshal(resBody, &model)

    return &model, err
}

```

Not a whole lot going on with this code. It requests the extension on `localhost:4000` and fetches a model by the ID supplied. This came from the API Request Path. If found, it Unmarshals the `[]byte` into the `struct` and returns it to the caller. Again, the reuse here is incredible as the code could be Node or Python or any other language you prefer.

## Testing the Extension

What would a walkthrough be without showing you how to execute the code :). So when building a Lambda Extension with Golang, your primary handler can be anything you want. The event source might be Kinesis, SQS, EventBridge or whatever. In this case, I'm using API Gateway.

![Lambda Design](/images/1_lambda.png)

First, let's put a record in the DynamoDB CacheSample table.

```json
{
  "id": "1",
  "fieldOne": "abc",
  "fieldTwo": "def"
}
```

Now, let's make the API GET request via curl to run the API.

![Lambda curl](/images/curl.png)

So if you remember our extension was a read-through cache implementation. The first time through, it'll miss on the cache, then read from DynamoDB and then write the cache into the store. The second time through, you'll get the hit and return.

First time:

![First time](/images/cache-miss.png)

Second time: ![Second time](/images/cache-hit.png)

Amazing right?

## Wrap-up and conclusions

So I want to touch upon a few things I love about this approach.

### 1\. Reuse

I've mentioned this a few times, but by building a Lambda Extension with Golang, you gain reuse beyond just your language and framework of choice. This is also true if you built a Lambda Extension with `insert your language`. As an architect or a lead, this is powerful.

### 2\. Separation of concerns

By deploying certain concerns separately like this, you can isolate them so that your code is doing one thing and doing that well. Now of course, if you don't need reuse, then this just adds overhead. So it's always a balance so treat that carefully.

### 3\. Cost

This one more pertains to caching and speed. For this example, I've clocked things down to almost 90% savings on compute when a cache hit occurs. I'm going to do some future performance write-ups when I get more volume of the catalyst for this article in production. So I'm going from say 100ms down to 10ms. This matters because honestly, the user isn't going to notice this. That's less than a blink of an eye. But if I elevate my thinking up a level to say one of the AWS well-architected pillars, then I'm thinking about cost. And millions of executions with 90% savings by using [Momento](https://www.gomomento.com), well you do the math. It's solid though, trust me on that.

And lastly, as always, here is the [GitHub Repository](https://github.com/benbpyle/lambda-extension-cache) containing the working sample. You can simply run through the steps above and you'll have a sample caching Lambda Extension built with Golang that you can start having fun with.

Hope this was helpful!
