---
title: Observing a Mirth Connect Operator with Grafana
author: "Benjamen Pyle"
description: "Mirth Connect is a workhorse integration engine in healthcare, but out of the box it tells you almost nothing about how it's doing. Here's how I wrapped it in a Kubernetes operator, emitted real Prometheus metrics from it, and shipped a Grafana dashboard alongside the chart so every cluster gets observability for free."
pubDatetime: 2026-04-21T00:00:00Z
tags:
  - kubernetes
  - observability
  - grafana
  - prometheus
  - operator
  - healthcare
  - golang
draft: false
---

If you've ever run Mirth Connect in production, you know the feeling. The UI says everything is green. Channels are "STARTED". Somewhere in the logs, a `script error` buried three levels deep is silently dropping messages, and you find out about it two days later when someone in the back office says "hey, did the feed from Acme Hospital break?"

Mirth 4.5 doesn't expose `/metrics`. It has a decent REST API, but nobody is actually watching it. On Kubernetes, a healthy-looking pod with a wedged channel is indistinguishable from a healthy-looking pod doing real work. That's the gap this post is about.

I wrote a small Kubernetes operator that reconciles Mirth's actual runtime state into Prometheus metrics, and shipped a Grafana dashboard alongside the Helm chart so that any cluster that picks up the operator gets observability on day one. No separate "set up monitoring" ticket. No six months of no one noticing.

## Why an operator

The easy answer would have been a sidecar or a CronJob that hits Mirth's REST API every 30 seconds and publishes metrics. I tried that first. It works. It also has two problems:

1. It doesn't know **which** Mirth you mean. A synthetic CronJob is pinned to one URL, one credential, one set of channels. As soon as you have two Mirth instances (dev + qa, or multi-tenant), you're copy-pasting CronJobs.
2. It doesn't do anything about what it observes. A channel in `STOPPED` state gets a metric. Nobody does anything. The next morning someone notices.

An operator gives me a declarative object — a `MirthInstance` CR — that says "here is a Mirth, poll it, surface its state, and optionally try to fix it." The metrics fall out as a side effect. So does remediation.

```yaml
apiVersion: mirth.pyle.io/v1alpha1
kind: MirthInstance
metadata:
  name: mirth-qa
  namespace: integrations
spec:
  endpoint: https://mirth-service.integrations.svc.cluster.local:8443
  credentialsRef:
    name: mirth-admin
  monitoring:
    pollIntervalSeconds: 30
```

The reconciler polls the Mirth REST API on that interval, updates the CR status, and emits Prometheus metrics. One controller, one emitter, arbitrarily many `MirthInstance` objects.

## What it actually measures

The operator exposes a fixed set of metrics. Every metric is labelled with `instance` (the name of the `MirthInstance` CR) and, where applicable, `channel` and `state`. That's the whole cardinality story — bounded by how many channels you deploy, which is a small number in practice.

```go
MirthUp                 *prometheus.GaugeVec  // instance
ChannelStatus           *prometheus.GaugeVec  // instance, channel, state
ChannelMessagesReceived *prometheus.GaugeVec  // instance, channel
ChannelMessagesSent     *prometheus.GaugeVec  // instance, channel
ChannelMessagesErrored  *prometheus.GaugeVec  // instance, channel
ChannelMessagesQueued   *prometheus.GaugeVec  // instance, channel
ChannelMessagesFiltered *prometheus.GaugeVec  // instance, channel
ChannelsTotal           *prometheus.GaugeVec  // instance
ChannelsHealthy         *prometheus.GaugeVec  // instance
RemediationTotal        *prometheus.CounterVec // instance, channel, result
JVMHeapUsedBytes        *prometheus.GaugeVec  // instance
DeployErrorsTotal       *prometheus.CounterVec // instance, channel, event_name
```

A few of these deserve comment.

`mirth_channel_status` is a gauge that is `1` when a channel is in a given state and `0` otherwise. So a single channel produces four time series — one for `STARTED`, one for `PAUSED`, one for `STOPPED`, one for `UNKNOWN` — and exactly one of them is hot at any moment. That shape is awkward if you're used to just storing an enum, but it's the right shape for Grafana's state-timeline panel, which wants a time series of discrete values per row.

`mirth_channel_messages_*_total` are named `_total` but they're gauges, not counters. The reason is that Mirth itself owns the running total — the operator polls it and mirrors it. When Mirth restarts, its counter resets, and ours follows. On the dashboard I use `delta(metric[5m])` clamped to zero instead of `rate()`, because `rate()` on a gauge isn't meaningful.

`mirth_deploy_errors_total` is a real counter. It only goes up. The operator polls Mirth's `/api/events` endpoint and increments this any time it sees a `ChannelDeploy`, `ScriptCompile`, or similar event with a failure. This is the one that catches "everything looks green but a deploy silently broke the preprocessor" — Mirth logs it in the events table and nowhere else.

`mirth_remediation_total` is the only metric the operator emits *about itself*, not about Mirth. When the reconciler decides to try to bring a channel back (e.g. a `STARTED` channel that's been errored for N consecutive polls), that attempt and its result land here.

## How the dashboard ships

This is the part I'm most proud of, because it removes a whole category of "I installed the operator but where's the dashboard" support burden.

The Mirth Operator Helm chart has a `dashboards/` directory with a raw Grafana JSON file, and a template that renders it into a `ConfigMap` labelled `grafana_dashboard: "1"`:

```yaml
{{- if .Values.grafanaDashboard.enabled }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "mirth-operator.fullname" . }}-dashboard
  namespace: {{ .Values.grafanaDashboard.namespace | default .Release.Namespace }}
  labels:
    {{- include "mirth-operator.labels" . | nindent 4 }}
    {{ .Values.grafanaDashboard.sidecarLabel }}: {{ .Values.grafanaDashboard.sidecarLabelValue | quote }}
data:
  mirth-operator.json: |-
    {{- .Files.Get "dashboards/mirth-operator.json" | nindent 4 }}
{{- end }}
```

Grafana from `kube-prometheus-stack` runs with a sidecar container that watches the Kubernetes API for ConfigMaps matching that label, reads their `.json` data keys, and hot-imports them into Grafana. No restart. No HTTP call. No external automation. The sidecar's environment looks like:

```
LABEL=grafana_dashboard
LABEL_VALUE=1
NAMESPACE=ALL
METHOD=WATCH
```

With `NAMESPACE=ALL`, the sidecar sees ConfigMaps in any namespace. That's what lets the operator chart live in `mirth-system` while Grafana runs in `monitoring`. Without it, you end up either writing cross-namespace from the operator's ArgoCD app (awkward RBAC) or pushing the dashboard into `monitoring` via a separate Helm release (awkward ownership). Widening the sidecar's watch is the cleaner of the three.

The tradeoff is RBAC scope. The sidecar's ServiceAccount now has cluster-wide `get/list/watch` on ConfigMaps. Bounded and uninteresting if you don't store secrets in ConfigMaps, which you shouldn't be.

## What the dashboard shows

Four rows:

**Overview.** Six stat panels: instances up, total channels, healthy channels, unhealthy channels (`total - healthy`, clamped), sum of queue depth, sum of JVM heap used. Each has coloured thresholds so a glance at the top of the screen tells you whether anything's on fire.

**Channel Throughput.** Three timeseries panels and one live gauge: messages received, sent, and errored per channel over 5-minute windows (as deltas), plus the current queue depth per channel. The errored panel is stacked with a red palette so spikes pull your eye without you having to read the legend.

**Channel Health.** A state-timeline spanning the full width showing every channel's state over the selected time range, colour-coded so `STARTED` is green, `PAUSED` is yellow, `STOPPED` is red. Underneath it, two bar-gauge panels that pick the top 10 channels by errors (over the time range) and by current queue depth. These are the "where do I look first" panels when something's wrong.

**Operator Actions & Errors.** Remediation attempts bucketed by result, deploy errors bucketed by event name, a table of the top 20 errors grouped by instance/channel/event, and JVM heap per instance. This row is the reason the whole exercise justifies itself — Mirth's event stream is the only place deploy and script compile failures surface, and until you put it on a dashboard, nobody is looking.

Everything is templated on `$datasource`, `$instance` (multi-select), and `$channel` (multi-select). Selecting a single channel narrows all throughput and health panels to just that channel's series, without changing any queries.

## Why I like this setup

The thing I keep coming back to is that **the dashboard ships with the operator**. If you install the Helm chart and set `grafanaDashboard.enabled: true`, you get the dashboard. If you turn on the operator in a new environment, you get the dashboard in that environment too. The dashboard is versioned alongside the metric names it depends on. If I add a metric, I update the dashboard in the same commit. There is no "fork of the dashboard that lives in someone's Grafana UI and nobody knows who owns it" state.

The second thing — and this is more about Mirth than the operator — is that this pattern inverts the usual observability story. Usually, you get metrics by instrumenting the application. Mirth is a black box; I can't instrument it. So the operator becomes the instrumentation, polling the black box and synthesizing the metrics the application should have emitted. That's a general pattern. Anywhere you have a legacy service with a decent API but no Prometheus endpoint, you can put an operator in front of it and get a modern observability story without touching the service itself.

And the third thing — the thing I didn't expect — is that once you have the metrics, you start to want remediation too. A channel that's been stuck for five minutes wants to be restarted. A deploy that failed wants to roll back. The `MirthInstance` CR is a natural place for that policy to live, right next to the thing being observed. That's the next post.

## The boring but important bits

A few things I got wrong on the first pass and had to fix.

**Metric cardinality.** My first version had a `tenant_id` label. Don't. In healthcare I could end up with hundreds of tenants, and multiplied by channels and states you're suddenly at tens of thousands of series per instance. Keep labels bounded to things an operator can reason about, not things an organization can invent.

**The "gauge named _total" trap.** I named `mirth_channel_messages_received_total` following Prometheus convention for monotonic counters, but it's a gauge that Mirth can reset. If a downstream alert or dashboard blindly uses `rate()`, they get negative spikes at every Mirth restart. I should have named it `mirth_channel_messages_received` and let the query use `delta()` or `increase()` intentionally. Living with it for now, but `_total` on a gauge is a lie.

**Dashboard-as-ConfigMap vs. Grafana Operator.** I briefly considered using the Grafana Operator's `GrafanaDashboard` CRD, which gives you a more structured, reviewable object. I went with the sidecar approach because it's zero-install — kube-prometheus-stack already ships it, which means this pattern works on any cluster that already has a standard observability stack. Grafana Operator adds a CRD and a reconciler I'd have to deploy separately. For a first-class "dashboard ships with the chart" experience, the sidecar is simpler.

**Sidecar searchNamespace.** You have to remember to set `grafana.sidecar.dashboards.searchNamespace: ALL` in the kube-prometheus-stack values. It defaults to the Grafana release namespace. I forgot this on the first go, spent twenty minutes wondering why the ConfigMap existed but the dashboard didn't appear, and watched the sidecar logs in the wrong namespace. Classic.

---

The end state is worth it. Install the operator, create a `MirthInstance` CR, open Grafana, there's a dashboard with the real state of every channel across every cluster. That's what I wanted the whole time. Now I just need the pager rules on top.
