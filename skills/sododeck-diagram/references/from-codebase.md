# From a codebase

Read this when the user points you at code and wants its architecture or its flows as a deck. Also
read `modeling.md`, `flows.md`, `layout.md` and `rules.md`: a codebase deck uses all of them.

The goal is a deck a reader can trust and play: every card and connector traceable to a line of
code, every flow a path the code really takes. A design document, a README or an older diagram is
a lead to check, never a source: when it disagrees with the code, the code wins and the
difference becomes a gap note.

## 1. Find the edges of the system

1. **Deployables**: services, apps, workers, scheduled workflows, functions (build and deploy
   files, entry points, workflow definitions). One card each, or one group each when you will
   open it up (step 2).
2. **Brokers and topics**: topic names in config and in producer / consumer code. A topic is a
   **connector label**, never a card. Label it with the short topic name (the config key without
   its shared prefix: `KAFKA_TOPIC_ORDER_EVENTS_OUT` → `ORDER_EVENTS_OUT · Kafka`); put the full
   topic value and the event types it carries in the connector `description`. When one topic
   carries several event types between the same two cards, keep one connector and name the event
   in each step title. A consumer that dispatches by `eventType` is worth a card.
3. **Stores**: tables, caches, object stores. A card only when a flow passes through it (a queue
   table, a job-status cache) or a reader needs to see what lands there (the table a flow's result
   is written to). Writes to the service's own tables along the way go in descriptions.
4. **Outside systems**: partner APIs and SDKs (`external`).
5. **Systems you cannot read** (a caller or partner whose code is out of scope): one card, tagged
   `"tags": ["not-read"]`, linked to the place in your code that names it (the client, the topic
   config). Draw only the connectors your side of the code proves, and list the card under "not
   read" in the fidelity report.

## 2. Open up the service the user cares about

The user's question is usually about one service. Draw its inside at the level of **the units
the code is organised by**, one card each, and group them by role (nested groups inside the
service group):

| Role in code                                  | Group                          | Card per                      |
| --------------------------------------------- | ------------------------------ | ----------------------------- |
| request handlers, use cases called by the API | "Manual / API use cases"       | use case                      |
| message consumers, scheduled entry points     | "Auto use cases" / "Consumers" | consumer or use case          |
| queue table + dispatcher                      | "Queue + workers"              | queue, dispatcher             |
| workers by job type / intent                  | same group                     | job type                      |
| completion and event listeners                | "Listeners"                    | listener                      |
| outbound adapters, reply handlers             | "Partner interface"            | sender, reply consumer        |
| status / job stores the UI polls              | "Job status"                   | store and the status use case |

Card titles are the role in plain words ("Update amendment job", "Interface job completion"); the
file goes in the source link, the behaviour in the `description` (guards, dedupe windows, retry
counts, thresholds, the flag that gates it).

## 3. Trace every hop

For each flow the user asked about (and every entry point you found):

1. Start at the trigger (a route, a consumer, a cron) and read the handler.
2. Follow the work: what does the handler hand to whom? A publish, an insert into a queue table,
   an emitted event, a direct call whose result it uses. Each hand-off is a solid connector.
3. Read the receiving side before you draw the connector: the consumer of that topic, the worker
   that picks that queue row, the listener of that event name. **No connector from names alone**:
   a `PaymentClient` class does not prove a call.
4. Record side reads and writes on the way (dashed, or in the step description).
5. Note every guard: feature flags, status checks, thresholds, "only when …". They become step
   `condition`s and rule rows.
6. Stop at the end state: the row written, the message the partner gets, the notification.

Read the same handler for each job type separately; shared-looking code often differs in one
branch (which events it emits, whether it notifies), and that difference is what readers need.

## 4. Turn matrices into rules

Code full of `if` ladders and lookup tables (status mappings, eligibility, which operation to
send, which notification title) becomes decision tables (`rules.md`) attached to the step that
applies them. Cite the line in the rule `description`. A rule with the outcome of each case is
worth more than a paragraph.

## 5. Source links

Every card and connector built from code carries a link to where you saw it, at a fixed commit:

```json
"links": [{ "label": "source", "url": "src/orders/charge.ts#L40-L58" }]
```

Use repository-relative paths (prefix with the repo name when there are several) and put the
commits in the deck `description`. Run lint with `--mode codebase`: it reports
`connector-without-source` for anything without a link.

## 6. Gaps

While tracing you will find things that look wrong: a retry that never happens, a status that is
never cleared, two transactions where one is needed, a document that disagrees with the code. Put
each on a sticky note in free space next to the card it concerns, starting
`**Gap · <short name>.**` and saying what happens in one or two sentences. Never fix the code
silently in the picture by drawing what should be there.

## 7. Fidelity report

End the handover with what did not come across one-to-one:

- **merged**: several things drawn as one card ("3 cancel use cases → Auto cancel use cases").
- **left out**: found but not drawn, and why (read-only queries, tests, scripts).
- **could not map**: things you saw but could not trace (a client without a visible target).
- **not read**: hops taken from documentation without reading the code.
