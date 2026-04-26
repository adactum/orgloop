---
title: "Event Schema (Appendix A)"
description: "JSON Schema definition for the OrgLoop event envelope — id, timestamp, source, type, provenance, payload, trace_id."
---

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://orgloop.dev/schemas/event/v1alpha1",
  "title": "OrgLoop Event",
  "type": "object",
  "required": ["id", "timestamp", "source", "type", "provenance"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^evt_[a-zA-Z0-9]+$",
      "description": "Unique event identifier"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp (UTC)"
    },
    "source": {
      "type": "string",
      "description": "Source connector ID"
    },
    "type": {
      "type": "string",
      "enum": ["resource.changed", "actor.stopped", "message.received"],
      "description": "OaC event type"
    },
    "provenance": {
      "type": "object",
      "required": ["platform"],
      "properties": {
        "platform": { "type": "string" },
        "platform_event": { "type": "string" },
        "author": { "type": "string" },
        "author_type": {
          "type": "string",
          "enum": ["team_member", "external", "bot", "system", "unknown"]
        }
      },
      "additionalProperties": true
    },
    "payload": {
      "type": "object",
      "description": "Source-specific event data",
      "additionalProperties": true
    },
    "trace_id": {
      "type": "string",
      "pattern": "^trc_[a-zA-Z0-9]+$",
      "description": "Trace ID grouping all pipeline entries for this event"
    }
  }
}
```


## Route identity (RouteRef)

Routes carry a compound identity at every persistence boundary (audit, history,
log entries, loop-detector chain nodes):

```ts
interface RouteRef {
  module: string; // module that owns the route
  name: string;   // module-local route name
}
```

Two modules may legitimately declare a route with the same `name`. The
`module` qualifier disambiguates them. Internal code constructs `RouteRef`
explicitly; CLI commands accept bare names and resolve them through
`route-resolver.ts` (see [CLI Design](./cli-design)).

**`EventFilter.route` removed.** Bus subscribers no longer carry a route
filter — match on `source` / `type` and consult `EventRecord.matched_routes`
(`RouteRef[]`) for downstream filtering.
