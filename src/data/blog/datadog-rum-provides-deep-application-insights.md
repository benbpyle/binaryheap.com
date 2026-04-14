---
title: Datadog RUM Provides Deep Application Insights
author: "Benjamen Pyle"
description: "Observability is a user experience concern. Let that sync in for a minute. When you reach a certain amount of scale, it's not practical for a developer to take feedback from each and every user and th"
pubDatetime: 2024-09-14T00:00:00Z
tags:
  - data
  - datadog
  - observability
  - programming
draft: false
---

Observability is a user experience concern. Let that sync in for a minute. When you reach a certain amount of scale, it's not practical for a developer to take feedback from each and every user and the behaviors they encounter while running the system. Enter observability and code instrumentation. I've [written](https://binaryheap.com/?s=datadog) about Datadog quite a bit over the past couple of years and am publicly an [Ambassador](https://www.datadoghq.com/ambassadors/) in the community. But what I haven't done is shown you how to connect the most top-level of a user's interaction into backend level spans and traces. That's where Datadog's Real User Monitoring (RUM) comes into play. Let's jump into real user observability with RUM.

- [What is Real User Monitoring (RUM)](#what-is-real-user-monitoring-rum)
- [Why does RUM Matter](#why-does-rum-matter)
- [Building a Solution](#building-a-solution)
  - [Vue.js as the Frontend](#vue-js-as-the-frontend)
    - [Customizing Actions](#customizing-actions)
  - [A .NET Backend](#a-net-backend)
    - [Todos Service](#todos-service)
    - [Users Service](#users-service)
- [Datadog RUM Output](#datadog-rum-output)
  - [Sessions → Views → Actions/Resources/Errors](#sessions-→-views-→-actions-resources-errors)
  - [Sessions](#sessions)
  - [Views](#views)
  - [Traces, Spans, and the Goodness](#traces-spans-and-the-goodness)
- [Final Thoughts](#final-thoughts)
- [Wrapping Up](#wrapping-up)

## What is Real User Monitoring (RUM)

Real User Monitoring is the name of the product in the Datadog [ecosystem](https://docs.datadoghq.com/real_user_monitoring/). But it's essentially instrumentation that allows a builder to gain insight into how a user navigates a graphical user interface. In the current world of computing, most GUIs are deployed as web applications which is where I'm going to spend the time in this article. However, the RUM product can be applied to native mobile applications as well which might be the subject of some future content.

With RUM deployed, Programmers, DevOps and Site Reliability Engineers (SRE) will have visibility into clicks, actions, resources, and exceptions that a user experiences in the browers. The best way I can describe it is, think of having Firefox or Chrome's developer tools enabled for each user, every interaction, all stored and available in the Datadog UI.

## Why does RUM Matter

Remember when I said that Observability is a User Experience concern? If you aren't monitoring a user's journey and interactions with all of your platform, including the UI, then you are missing out on a tremendous opporutunity to improve the experience of your users and customers. With RUM, a builder not only gains the ability to see what has happened in the platform, but also has access to data that can help predict where next level investments in architecture, infrastructure, and technology should be made.

## Building a Solution

How best to demonstrate the power and features of Datadog's RUM than with an example. I'm branching out a touch here from my usual Go or Rust and going to be using C# for the services and Vue.js for the UI. A quick aside, never get so locked into one tool. Yes learn it. Get great at it. But the programming world is huge and having a healthy understanding of other technologies will make you more well-rounded which will improve your decision-making. Seems odd considering I'm talking about tools, but my point is, I love Rust, but C# is amazing also. Both things can be true.

### Vue.js as the Frontend

At the end of the article, you'll find some repositories that you can clone and work with, but for now, let's take a peek at the setup. The below is a snippet from the package.json file of the project.

```json
"dependencies": {
    "@datadog/browser-rum": "^5.23.3",
}
```

By adding the Dataog RUM package, the code is now ready to be configured to allow RUM to pick up and ship interactions, clicks, and actions that the user takes while using the application. Configuration of RUM is below and [here is](https://docs.datadoghq.com/real_user_monitoring/browser/setup/) an in-depth article about the various options and settings. In the configuration, the comments show just a little about what each of the options configures.

```javascript
import { datadogRum } from "@datadog/browser-rum";
datadogRum.init({
  applicationId: "<application id>",
  clientToken: "<client token>",
  // `site` refers to the Datadog site parameter of your organization
  // see https://docs.datadoghq.com/getting_started/site/
  site: "<site url>",
  service: "<name of your service>",
  // this is the DD_ENV var
  env: "local",
  // Specify a version number to identify the deployed version of your application in Datadog
  version: "1.0.0",
  // session sampling
  sessionSampleRate: 100,
  // true tracks clicks, scrolls, hovers
  trackUserInteractions: true,
  // api requests and file downloads
  trackResources: true,
  // connecting the UI with traces at this API URL
  allowedTracingUrls: ["http://localhost:3000"],
  trackLongTasks: true,
  defaultPrivacyLevel: "allow",
});
```

With the above bits in place, the code is completely configured, and Datadog RUM will start shipping telemetry into the product.

#### Customizing Actions

Before I move into the backend code, I want to make a quick stop in customizing actions. Actions are “interactions” like clicks, scrolls, hovers, and the like. Customized actions like the image below allows me to give context and meaning to things that user's do in the application.

![Datadog RUM Actions](/images/action_customized.webp)

I can't overemphasize this enough. You want to be naming and standardizing on the way that you connect these elements together. It'll make analyzing so much easier and clearer. But to make this come together, it does take a spot of code. Note in the HTML that I'm adding `data-dd-action-name`. This attribute on the tag is what names the click. There are other options to explore through documentation, but by adding just a little of meta, I'm getting a great deal of observability value.

```html
<div class="menu">
  <router-link to="/" class="button" data-dd-action-name="Home Route Clicked">
    <span class="material-icons">home</span>
    <span class="text">Home</span>
  </router-link>
  <router-link
    to="/todos"
    class="button"
    data-dd-action-name="Todo Route Clicked"
  >
    <span class="material-icons">description</span>
    <span class="text">Todos</span>
  </router-link>
</div>
```

### A .NET Backend

The backend of this application is simple. My Vue app is just a Home and a Todos list. When the user clicks the Todo menu, I have a Receiver 1 that handles the todos. For each Todo, it makes a call to Receiver 2 which is a User service that returns the user for the given Todo. All of that comes together inside a grid.

![Todo App](/images/vue_app-scaled.webp)

#### Todos Service

Remember up above where I supplied the `allowedTracingUrls: ['http://localhost:3000'],` in the config? This was so that for each API resource requested on that path would include the Datadog Trace Headers. These headers help Datadog's RUM forward them into the backend requests which then each service's APM instrumentation can treat its spans as a part of a bigger trace which originated from RUM. As you'll see in the repository, there is a Docker Compose file that launches the two services, with Datadog enabled, in addition to a Postgres database for managing the Todos and Users.

The UI ends up looking like this.

![todos list](/images/todos-scaled.webp)

And just to highlight how the Datadog service tracing doesn't impact the appearance of my code at all, here's the controller method.

```csharp
[HttpGet]
[Route("/todos")]
public async Task<ActionResult<IEnumerable<Todo>>> GetTodos()
{
    this._logger.LogInformation("Request Received");
    var todos = await this._context.Todos.ToListAsync();
    var httpClient = _httpClientFactory.CreateClient();

    foreach (var t in todos)
    {
        this._logger.LogInformation("Making a request for: " + t.UserId);
        var body = await httpClient.GetFromJsonAsync<UserBody>("http://api2:8080/users/" + t.UserId,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        if (body != null)
        {
            t.Username = body.Username;
        }
        else
        {
            t.Username = "Unassigned";
        }
    }

    return todos;
}

```

All the instrumentation complexity comes into the Dockerfile and attaching the tracer to the dll.

```dockerfile
# Base Docker Image that the output will run on - Debian Slim
FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim AS base

WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

# Download the latest version of the tracer but don't install yet
RUN TRACER_VERSION=$(curl -s https://api.github.com/repos/DataDog/dd-trace-dotnet/releases/latest | grep tag_name | cut -d '"' -f 4 | cut -c2-)
    && curl -Lo /tmp/datadog-dotnet-apm.deb https://github.com/DataDog/dd-trace-dotnet/releases/download/v${TRACER_VERSION}/datadog-dotnet-apm_${TRACER_VERSION}_arm64.deb

WORKDIR /src
COPY ["receiver.csproj", "Api/"]
RUN dotnet restore "Api/receiver.csproj"
WORKDIR "/src/Api"
COPY . .

RUN dotnet build "receiver.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "receiver.csproj" -c Release -o /app/publish

FROM base AS final

# Copy the tracer from build target
COPY --from=build /tmp/datadog-dotnet-apm.deb /tmp/datadog-dotnet-apm.deb
# Install the tracer
RUN mkdir -p /opt/datadog
    && mkdir -p /var/log/datadog
    && dpkg -i /tmp/datadog-dotnet-apm.deb
    && rm /tmp/datadog-dotnet-apm.deb

# Enable the tracer
ENV CORECLR_ENABLE_PROFILING=1
ENV CORECLR_PROFILER={846F5F1C-F9AE-4B07-969E-05C26BC060D8}
ENV CORECLR_PROFILER_PATH=/opt/datadog/Datadog.Trace.ClrProfiler.Native.so
ENV DD_DOTNET_TRACER_HOME=/opt/datadog
ENV DD_INTEGRATIONS=/opt/datadog/integrations.json

WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "receiver.dll"]
```

#### Users Service

Since the users service is going to have so much in common with the todos service, I'm not going to walk through the code. However, I did add some middleware that dumps out the headers when the users service receives a request. What I'm showing you here are that Datadog is sending its specific headers in addition to attaching the two Opentelemetry headers. Talk about nice extensibility out of the box.

```bash
api2          | info: Receiver2.Controllers.UsersController[0]
api2          |       (ID)=1, (User)=Receiver2.Models.User
api2          | info: Microsoft.AspNetCore.HttpLogging.HttpLoggingMiddleware[9]
api2          |       Request and Response:
api2          |       Host: api2:8080
api2          |       traceparent: [Redacted]
api2          |       tracestate: [Redacted]
api2          |       x-datadog-trace-id: [Redacted]
api2          |       x-datadog-parent-id: [Redacted]
api2          |       x-datadog-origin: [Redacted]
api2          |       x-datadog-sampling-priority: [Redacted]
```

I can't stress enough how little instrumentation code I'm doing and how much value I'm receiving in return. You could wire this up manually, but why? And speaking of value, let's see what Datadog's RUM provides us.

## Datadog RUM Output

If you were waiting for me to make a joke about RUM and Captain Morgan, this would probably be the point that I'd do it. But I'm going to refrain and just jump into showing off the fruits of my labor.

### Sessions → Views → Actions/Resources/Errors

Datadog breaks RUM down into Sessions, Views, Actions/Resources/Errors. Everything happens in ths scope of a session. It's how the data is organized and ultimately how I am billed.

### Sessions

I can break into any part of the data I wish, but starting with a session list seems to make sense. I can see all the sessions in my window of time in addition to getting some top-level metrics about what all happened inside that grouping.

![Datadog RUM Session](/images/rum_sessions.webp)

### Views

These are the next logical breakout. A view is what you'd like it is. In the Single Page Application world, it's what is rendered when a Route is triggered and a View is returned. Sessions have a collection of views.

![Datadog RUM Views](/images/rum_views.webp)

### Traces, Spans, and the Goodness

At this point, if I finished the article, you'd have still received a ton of value from RUM. However, what if I could take it a little further? What if I could connect a user's click to backend service calls? Well, I can. And it's available right in the Datadog RUM explorer or inside the Application Performance Monitoring (APM) content that I've shown before.

![Datadog RUM trace](/images/rum_traces.webp)

I have the window scrolled down in that image, but what's hiding below is very detailed user information. Now I can choose to store that, or I can filter it out via configuration, but the fact is, performance and full visibility can be sliced however I want. That is the waterfall view of the various calls that I described further up.

This is great if I'm working on the UI part of the application and start top down. But if I'm working on the backend and live in the APM section of the application, I can also find these spans and their connected Datadog RUM root trace. That view will also show me user specifics just as if I was in the RUM part of the Datadog UI.

![Datadog RUM Span List](/images/rum_span_list.webp)

Amazing right? And again, for very little effort.

## Final Thoughts

Datadog's RUM can give me insight into my application the top-level user interactions that I've never had a window in before. Honestly, if you aren't starting your traces at the user level, then what are you really doing? That's a bold statement, but I believe that once you experience this, you might wonder how you've been managing along without it for so long.

I didn't even touch on session replay. Imagine receiving a bug report and then being able to go back and watch what the user clicked on, hovered over, and all the juicy bug report details you wished you had. Well, you can have them now if you choose to.

Lastly, if price is a concern, look into sampling. I always tell people that you don't need 100% of the sample. Find what works. I'd rather have 1 out of 10 user interactions in a price point I can afford than just say, if I can't afford 100% I'm not using it at all. There is a point where the money for the service pays for itself. And trust me, even a 4 or 5 figure observability bills a month could easily save you that against the human time and the efficiency gains. As a small business owner, I'm not shelling out money for everything, but the value here warrants the price. Figure out what you can afford, and sample accordingly.

## Wrapping Up

I love exploring tools and techniques that transcend architectures. Datadog's RUM can be used in serverless, serverfull, and places in between. But to circle back to my original statement.

Observability is a user experience concern. It is my belief that all teams should be observing their software in production. It will help validate your assumptions, highlight hotspots, inform where new investments should be made, and give the impression to your users that you care and are ahead of problems. And adding a tool like RUM can greatly improve your overall observability position.

As always, here are the repositories that I walked through in the code. Feel free to clone them and get them deployed in your own environments.

- [Vue.js UI Code](https://github.com/benbpyle/rum-todo-ui)
- [Backend Code](https://github.com/benbpyle/rum-todo-api)

Thanks for reading and happy building!
