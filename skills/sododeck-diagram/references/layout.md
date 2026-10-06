# Layout

Read this for every new deck and for any update that adds cards. The app draws a placed card
exactly where the file puts it. It does lay out cards that have no position, but that automatic
layout knows nothing about which flows matter, so it stacks cards in the way of the lines that
tell the story. Place every card yourself.

## Contents

1. Sizes the checks assume
2. The grid: columns follow the data
3. Placing cards so lines stay clear
4. Groups and frames
5. Notes
6. Bends
7. Writing a generator for big decks
8. Fixing each lint warning

## 1. Sizes the checks assume

| Thing                  | Box lint assumes                                       |
| ---------------------- | ------------------------------------------------------ |
| Card                   | 184 × 96 from its `position` (top-left), or its `size` |
| Sticky note            | its `size`, else 200 × 200                             |
| Group frame (no frame) | its cards' bounding box + 24 px each side, 40 on top   |
| Line clearance         | 6 px around every card                                 |

Connectors are checked as straight lines between card centres (or through `route.waypoints`).
The app routes them as curves, so a straight line that clears every card is a safe bet.

## 2. The grid: columns follow the data

Pick columns in the order work moves: sources on the left, the systems that act in the middle,
the outside systems and stores where things end up on the right. Then rows inside each column.

- Column step: **300 px** between columns of plain cards. Before a column that one card fans out
  to (a dispatcher to its workers), make the gap **at least half the height of the stack** it
  fans to: 350 px for a stack of 5 at 150 px rows, 600 px for 8. Over 6 cards, split the stack
  into two columns instead.
- Row step: **150 px** inside a stack (cards 96 tall plus a label gap); **250 px** when connectors
  run horizontally between rows.
- Keep one card per grid cell. Round every coordinate to the grid; it makes misalignment obvious
  in review.

A typical service deck reads like this (columns left to right):

| Column | Holds                                                                |
| ------ | -------------------------------------------------------------------- |
| 0      | upstream sources (a database you replicate, a scheduler)             |
| 1      | ingest / import components and their stores                          |
| 2      | the entry points of the main service: API use cases, topic consumers |
| 3      | hand-off stores (queue table), dispatcher                            |
| 4      | workers, one per job type                                            |
| 5      | completion listeners, one per job type                               |
| 6–7    | outbound adapters (send to partner, receive reply), result stores    |
| 8      | partner systems, notification service                                |

The user interface and its gateway sit **above** the entry-point column; job and status stores
sit on a **row above** everything, so the lines to them run in an empty corridor.

## 3. Placing cards so lines stay clear

- **Fan out to a column, never through it.** One card talking to five cards stacked in a column is
  clean when the one card sits a column to the left at their middle row. A card in the same
  column as its targets draws lines through its neighbours.
- **1:1 neighbours share a row.** A worker and its own listener sit side by side on the same row:
  the line is short and horizontal.
- **Leave corridors for long lines.** A connector that must cross the deck (a gateway to a use
  case far to the right) runs along a row that is empty in every column it crosses. Reserve the
  top row and the bottom row for these.
- **Two connectors between the same pair** (request and reply) are fine; the app draws them as
  two curves.
- **A card many things reach** (a shared listener, a sender) goes where its inputs converge: to
  the right of all of them, at the middle row of the cards that feed it.
- **Order a stack by its targets.** If stack A connects to stack B one-to-one, use the same row
  order in both, and lines never cross each other.

## 4. Groups and frames

- Give every card its `group`. A group with no `position` / `size` gets a frame around its cards;
  that frame is what lint checks.
- **Sibling frames never touch**: frames add 24 px at the sides and bottom and 40 px on top, so
  leave at least 70 px between the cards of two groups (one empty grid row or column is plenty).
- **A frame must not reach a card of another group.** If it does, the reader thinks the card
  belongs there. Move the stranger out, or make the group a column of its own.
- Nest groups (`"parent": "<group id>"` on the group) to show a big service and its parts: the
  outer frame is the service, the inner ones are "Manual use cases", "Workers", "Listeners".
  The outer frame wraps every card of its nested groups (plus padding), so keep cards of other
  systems clear of that whole area. Nested frames may overlap their parent, not each other. An
  outer group with no cards of its own shows as "(empty)" in `summary.mjs`; that is expected.
- Colour the groups, not the cards: `"style": { "fill": "teal" }` on each group, one colour per
  group, so a reader sees zones at a glance. Leave cards uncoloured.

## 5. Notes

A sticky note sits at its own `position`; give it `size` `{ "width": 240, "height": 120 }` and
put it in free space **outside every frame**, as close as you can to what it is about (in the
corridor above or below the group, level with the card). Notes are for gaps, open questions and
caveats, one idea each, starting with a bold tag: `**Gap · no retry.** A failed publish is never
resent.`

When the note has to sit away from its card, tie them with a connector from the note to the card
(`"from": "gap-1", "to": "w-send", "protocol": "other"`, dashed, no label): the reader follows the
line, and lint checks it like any other.

## 6. Bends

When a line cannot be cleared by moving cards, give the connector a bend. A waypoint is a point
as fractions of the span from the source centre S to the target centre T:

```json
"route": { "waypoints": [{ "x": 0.55, "y": 0 }] }
```

`x: 0.55, y: 0` is 55 % of the way across, at the source's height: the line leaves sideways, then
turns towards the target. Use one bend; two at most. A deck that needs many bends needs a better
column order.

## 7. Writing a generator for big decks

Over about 15 cards, write the deck from a small script so the grid is data and you can move a
whole column in one edit. Keep the script next to the deck so the user can regenerate it, and
have it write `<name>.draft.sododeck`; `deliver.mjs` then moves the draft to `<name>.sododeck`.

```js
// build-deck.mjs: node build-deck.mjs > draft.sododeck
const C = [0, 300, 600, 950, 1300, 1700]; // column x
const nodes = [];
const edges = [];
const card = (id, type, title, col, row, group, extra = {}) =>
  nodes.push({ id, type, title, ...extra, group, position: { x: C[col], y: row * 150 } });
const link = (id, from, to, protocol, label, extra = {}) =>
  edges.push({ id, from, to, protocol, label, ...extra });
const side = (id, from, to, protocol, label) =>
  link(id, from, to, protocol, label, { style: { dash: 'dashed', width: 1.5 } });

card('api', 'component', 'Orders API', 2, 0, 'svc');
card('queue', 'queue', 'jobs table', 3, 0, 'svc');
card('worker', 'service', 'Worker', 4, 0, 'svc');
card('db', 'database', 'orders', 4, 1, 'svc');
link('api-queue', 'api', 'queue', 'sql', 'enqueue');
link('queue-worker', 'queue', 'worker', 'sql', 'picked');
side('worker-db', 'worker', 'db', 'sql', 'upsert');

const deck = {
  $schema: 'https://sododeck.com/schema/v1.json',
  version: 1,
  name: 'Orders',
  nodes,
  groups: [{ id: 'svc', title: 'Order service', style: { fill: 'blue' } }],
  edges,
  views: [],
  features: [],
  flows: [],
  rules: {},
  stickies: [],
};
process.stdout.write(JSON.stringify(deck, null, 2) + '\n');
```

Then validate and lint the output; fix positions in the script, never in the generated file.

## 8. Fixing each lint warning

| Code                     | What to do                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `card-without-position`  | Place the card on the grid, next to what it connects to.                                                   |
| `connector-crosses-card` | Move the named card out of the line (another row), widen the column gap, reorder a stack, or add one bend. |
| `frame-covers-card`      | Move the stranger card outside the frame, or move the group's cards so the frame no longer reaches it.     |
| `frames-overlap`         | Push one group a row or a column away; sibling groups need at least 70 px between their cards.             |

Rerun lint after each round of moves: moving one card often clears several warnings, and
sometimes creates one elsewhere.
