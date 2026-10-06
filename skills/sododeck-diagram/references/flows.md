# Flows

Read this whenever the deck has a sequence: a request path, a job, a user action, "what happens
when …". A flow plays step by step in the app; each step lights one connector, so a good flow is
a light travelling across the picture.

## The one rule

**Each step names a connector, and each step starts at the card where the previous step ended.**
Lint reports `broken-chain` when this fails and `step-without-connection` when a step names a
connector that does not exist. Branches start where the main path ended.

## Model the hand-offs, not the calls

Most code calls out and comes back: a use case writes a table, seeds a job, then enqueues. Drawn
as calls, every one of those needs a connector there and back, and the flow zig-zags. Draw the
**baton** instead: the thing that carries the work to the next actor.

| In the code                                      | In the deck                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| A publishes to a topic, B consumes it            | one solid connector A → B, label `TopicName · Kafka`, protocol `event`  |
| A inserts a queue row, a worker picks it up      | A → `queue` card → worker, both solid: the queue table is a hand-off    |
| A emits an event, listener L takes over the work | solid A → L, protocol `other`, label the event name                     |
| A emits an event (audit, history) and carries on | no step; mention it in the description, or a dashed A → L if it matters |
| A writes its own table and carries on            | dashed A → table; mention it in the step `description`                  |
| A calls B and uses the answer to continue        | solid A → B and solid B → A (the reply), both steps                     |
| A calls a pricing / lookup API mid-step          | dashed A → API, mentioned in the step                                   |
| A seeds or reads a status store a UI polls       | dashed, plus one small flow "Poll status" that walks UI → API → store   |

The test: after the step, **who holds the work?** If it is the target, the connector is a solid
step. If it is still the source, the connector is dashed and the step is not there.

## End-to-end, not per service

One flow per journey a person would name, from its real trigger to its real end, across every
system: "Hourly generate: scheduler → import → snapshot → queue → worker → send → partner reply →
result stored". Splitting it per service hides the hand-offs, which are the point. 4–15 steps
along one path (the main path plus one branch) is normal for an end-to-end flow; more usually
means two journeys. A main path of one or two steps followed by branches is fine when the choice
comes right away.

When two journeys share a tail (both end by sending to the partner and storing the reply), each
flow walks the shared cards again; that is how the reader sees they converge.

## Shape

```json
{
  "id": "checkout",
  "title": "Checkout",
  "feature": "checkout",
  "trigger": "Customer presses Pay",
  "outcome": "Order is paid and confirmed",
  "steps": [
    { "id": "submit", "edge": "web-gateway", "title": "Submit cart", "sla": "< 300 ms" },
    {
      "id": "create",
      "edge": "gateway-orders",
      "title": "Create order",
      "description": "Also inserts the order (dashed connector to Orders DB)."
    },
    {
      "id": "charge",
      "edge": "orders-payments",
      "title": "Charge card",
      "payload": "{ \"orderId\": \"o_123\", \"amount\": 4990 }",
      "rules": ["charge-retry"]
    }
  ]
}
```

Step fields: `id` and `edge` required; `title` (a verb phrase), `condition` (when the step runs:
`flag on`, `total > 50`), `sla`, `description` (markdown: side effects, guards, the line of code
that decides), `payload` (a real message), `notes`, `owner`, `tags`, `links`, `rules` and
`ruleInputs` (`rules.md`), `touches` (tables, `database.md`).

Flow fields: `id`, `title`, `steps` required; `feature`, `description`, `trigger`, `outcome`,
`owner`, `tags`, `links`, `branches` optional. Group flows with `features` ("Auto", "Manual",
"From partner").

## Branches

Branches fork **only at the end of the main path**: every branch's first step starts where the
last main step ended.

```json
"branches": [
  { "id": "save", "label": "Save", "condition": "action = SAVE" },
  { "id": "send", "label": "Save and send", "condition": "action = SAVE_AND_SEND" }
],
"steps": [
  { "id": "s1", "edge": "web-api" },
  { "id": "s2", "edge": "api-queue" },
  { "id": "s3", "edge": "queue-worker" },
  { "id": "s4", "edge": "worker-listener" },
  { "id": "s5a", "edge": "listener-status", "branch": "save" },
  { "id": "s5b", "edge": "listener-sender", "branch": "send" },
  { "id": "s6b", "edge": "sender-partner", "branch": "send" }
]
```

Each branch needs a `label` and a `condition`; failure paths get `errorPath: true`. So place the
fork last: run the shared steps, then split.

An exit **in the middle** ("no match → mark skipped, stop") cannot be a branch. Put it in the
step's `description` and in a rule on that step (the rule's rows list every outcome), or give it
its own short flow.

## Writing good steps

- Titles are what happens, 2–5 words: "Enqueue UPDATE", "Publish delete", "Apply reply".
- Put the guard in `condition` (`flag on`, `candidate has WO id`), so a reader sees why a step
  may not run.
- Put the decision table on the step that decides (`rules`), not on a card.
- One real `payload` on the step where the data shape matters (the message to the partner).
- The flow's `outcome` states the end state in domain words, including what does **not** happen
  ("no job, no notification").
