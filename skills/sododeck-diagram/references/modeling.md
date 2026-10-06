# Modeling a deck

Read this for any new deck and for update requests that add cards, connectors or groups.

## Contents

1. The file skeleton
2. Cards
3. Card types
4. Connectors: hand-offs and side connectors
5. Groups and levels
6. Ids
7. Positions, sizes and colour
8. Notes, features, tags and links
9. Examples

## 1. The file skeleton

Every deck has these root keys, even when empty, in this order:

```json
{
  "$schema": "https://sododeck.com/schema/v1.json",
  "version": 1,
  "name": "Checkout",
  "description": "Optional, one or two sentences (markdown). In codebase mode: the commits read.",
  "nodes": [],
  "groups": [],
  "edges": [],
  "views": [],
  "features": [],
  "flows": [],
  "rules": {},
  "stickies": []
}
```

`nodes` are cards, `edges` connectors, `stickies` notes. `rules` is an object keyed by rule id
(`rules.md`); everything else is a list. Leave `views` empty: the app creates its standard views.
Unknown keys are refused, so don't invent fields.

## 2. Cards

```json
{
  "id": "orders",
  "type": "service",
  "title": "Order Service",
  "description": "Creates orders and asks the payment provider to charge.",
  "tech": "Node.js",
  "links": [{ "label": "source", "url": "src/orders/main.ts" }],
  "group": "shop",
  "position": { "x": 600, "y": 0 }
}
```

Required: `id`, `type`, `title`. Always: `position` (`layout.md`), `group` when the deck has
groups. Useful: `description` (markdown: behaviour, guards, numbers), `tech`, `host`, `owner`,
`tags`, `links`, `rules` (a policy the card applies everywhere), `parent` and `level` (section 5).

A card is something that **acts or holds state**: a deployable, a use case, a consumer, a worker,
a listener, an adapter, a store, an outside system. Not a card: a message topic (a connector
label), a function call that is part of one card's job, a config value.

The title is what people read: 1–4 words, under 40 characters, naming the role ("Reassign job
completion", "Send to partner"). Details go in `description` and fields.

## 3. Card types

`type` decides the icon and default fields. Use the most specific type that is true. Types outside
the Architecture pack need their pack listed in the root `packs` list (for example
`"packs": ["architecture", "process"]`); without `packs` a deck shows Architecture only.

| Type id | Name | Pack | Kind |
| --- | --- | --- | --- |
| `service` | Service | Architecture (`architecture`) | card |
| `database` | Database | Architecture (`architecture`) | card |
| `gateway` | Gateway | Architecture (`architecture`) | card |
| `client` | Client | Architecture (`architecture`) | card |
| `queue` | Queue | Architecture (`architecture`) | card |
| `external` | External | Architecture (`architecture`) | card |
| `component` | Component | Architecture (`architecture`) | card |
| `task` | Task | Process (`process`) | card |
| `decision` | Decision | Process (`process`) | card |
| `document` | Document | Process (`process`) | card |
| `warehouse` | Warehouse | Logistics (`logistics`) | card |
| `truck-route` | Truck route | Logistics (`logistics`) | card |
| `issue` | Issue | Data cards (`data`) | card |
| `db-table` | Table | Database (`database`) | card |
| `rectangle` | Rectangle | Basic shapes (`shapes`) | shape (plain outline) |
| `rounded-rectangle` | Rounded rectangle | Basic shapes (`shapes`) | shape (plain outline) |
| `ellipse` | Ellipse | Basic shapes (`shapes`) | shape (plain outline) |
| `diamond` | Diamond | Basic shapes (`shapes`) | shape (plain outline) |
| `pill` | Pill | Basic shapes (`shapes`) | shape (plain outline) |
| `cylinder` | Cylinder | Basic shapes (`shapes`) | shape (plain outline) |
| `document-shape` | Document | Basic shapes (`shapes`) | shape (plain outline) |
| `parallelogram` | Parallelogram | Basic shapes (`shapes`) | shape (plain outline) |
| `hexagon` | Hexagon | Basic shapes (`shapes`) | shape (plain outline) |
| `actor` | Actor | Basic shapes (`shapes`) | shape (plain outline) |
| `text` | Text | Basic shapes (`shapes`) | shape (plain outline) |

An unknown type id is kept and drawn as a generic card, with a warning. Prefer a built-in one.
A queue table or a consumer of a topic is a `queue` card; a scheduled workflow is a `task`; a
person or their device is `client`; another company's system is `external`.

## 4. Connectors: hand-offs and side connectors

```json
{
  "id": "orders-notify",
  "from": "orders",
  "to": "notify",
  "protocol": "event",
  "label": "OrderPaid · Kafka"
}
```

Required: `id`, `from`, `to` (card ids; a group id means "the whole group"; a note id ties a note
to a card). `protocol`: `http` (REST, GraphQL), `grpc`, `event` (Kafka and other brokers), `sql`,
`websocket`, `other` (in-process events and calls). The label says **what** travels, under 32
characters: the topic or event name, the method, the operation.

There are two kinds, and the difference is the most important modeling decision in a deck:

- **Solid (default): a hand-off.** After it, the target holds the work. Flows walk these.
- **Dashed: a side read or write.** The source writes its table, calls a lookup, seeds a status
  key, and carries on. Mark it `"style": { "dash": "dashed", "width": 1.5 }`. Never a flow step.
  Draw one only when the reader needs to see that store or service (where results land, a call
  to another system); routine writes to the service's own tables stay in descriptions. If more
  than a third of a deck's connectors are dashed, cut back.

Draw every connector in the direction the work or data goes. Two connectors between the same pair
(request and reply) only when a flow walks back. One connector per meaning: if the same pair
carries two unrelated things, label one connector with both ("UPDATE · CHANGE_BOUND") rather than
drawing two parallel lines.

## 5. Groups and levels

**Groups** frame related cards on the same screen: `{ "id": "workers", "title": "Queue +
workers", "parent": "backend", "style": { "fill": "indigo" } }`, then `"group": "workers"` on
each card. Use them for each system, and inside the system the user cares about, for each role
(use cases, workers, listeners, outbound). One or two levels of nesting.

**Levels** (`"parent": "<card id>"` on a card) put cards on another screen the reader opens from
the parent card. Use a level only for detail most readers skip; a reader who has to open five
cards to follow one flow loses the flow. A flow should stay on one screen.

## 6. Ids

- Opaque and permanent: 1–64 characters of letters, digits, `-`, `_`, `.`, `:`. Use short
  lower-case slugs, at most 32 characters, prefixed by role when it helps: `uc-update`,
  `w-update`, `l-update`.
- Unique within their collection; a card and a group never share an id.
- Never rebuilt from the title (`order-service-v2-new` for "Order Service v2 (new)" is what lint
  warns about).
- Steps, branches, rule columns and rows have ids too; short ones are fine (`s1`, `enq`).

## 7. Positions, sizes and colour

Every card and every note has a `position` (top-left, canvas px); `layout.md` explains the grid.
Leave `size` out unless a card holds long text. Colour the **groups** (`style.fill`, one named
colour each: `red orange amber yellow lime green teal cyan blue indigo violet pink slate`), not
the cards.

## 8. Notes, features, tags and links

- `stickies`: `{ "id": "gap-1", "text": "**Gap · no retry.** …", "color": "amber", "position": {
"x": 1200, "y": -400 }, "size": { "width": 240, "height": 120 } }` (colours `amber blue green
clay grey`), outside every group frame. Use them for gaps, open questions and caveats. Never
  write `anchor`: notes are placed, not pinned.
- `features`: `[{ "id": "auto", "title": "Auto" }]` groups flows (`"feature": "auto"` on a flow).
- `tags`: short labels shared across the deck, for filtering views.
- `links`: sources, documentation, dashboards. In codebase mode every card and connector has one.

## 9. Examples

`examples/checkout.sododeck`: a small deck with a group, a dashed side write, a Kafka topic as a
connector label, a reply connector, one flow and a note. `examples/platform.sododeck`: groups on
a level below a top-level card. `examples/refund-policy.sododeck`: a rule on a step.
