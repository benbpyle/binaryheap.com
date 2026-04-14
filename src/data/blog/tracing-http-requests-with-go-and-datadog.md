---
title: Tracing HTTP Requests with Go and Datadog
author: "Benjamen Pyle"
description: HTTP request tracing in Go with Datadog wraps the standard HTTP client to generate spans with method and URL details in your flame graphs.
pubDatetime: 2022-12-13T00:00:00Z
tags:
  - aws
  - datadog
  - observability
  - programming
draft: false
---

Small follow up on the last post regarding tracing. I'm a huge fan of Event Driven systems or EDA (Event Driven Architecture) but sometimes you do need to make that synchronous HTTP request in order to fetch more data. Perhaps you are building a "saga" or sometimes events just published what happened and to whom it happened but not specifics about the actual event. For that you need to return back out and fetch more info.

When that happens, you'll need to use a HTTP Client for making that request. And when doing so, it often sort of turns into a black hole, especially if you have multiple calls to make and you need to distinguish them. Enter again the Datadog libraries. With a simple wrapping of the client, when you make requests WithContext you will get a nicer and prettier display of what the span is. In the case below, I usually like to set the VERB that was requested in addition to the URL. Feel free to use/show whatever makes sense to you

```go
package main

import (
	"fmt"
	httptrace "gopkg.in/DataDog/dd-trace-go.v1/contrib/net/http"
	"net/http"
)

// NewHttpClient creates a new HttpClient wrapped with DD Trace library to add a span
// for each request that is made through it
func NewHttpClient() *http.Client {
	client := httptrace.WrapClient(&http.Client{}, httptrace.RTWithResourceNamer(func(h *http.Request) string {
		return fmt.Sprintf("%s %s://%s%s", h.Method, h.URL.Scheme, h.URL.Host, h.URL.Path)
	}))

	return client
}

```

You can then use the client like this

```go
req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
```

And by doing this, in Datadog it'll yield a flame graph that looks like this

![Span traces](/images/http_trace-1024x511.png)

If you notice above, another really nice thing that Datadog does, is that if the service/endpoint/thing you are calling is also instrumented, Datadog can keep track of those traces as well to give you a fuller picture of what happened in the caller(s).

Hope this was helpful, enjoy!
