# Taste

Read this once for every new deck. A valid deck can still be useless; these are the habits that
make a reader understand a system in a minute and trust it.

## The reader presses play

Judge the deck by playing each flow in your head. The light should move steadily across the
screen, mostly left to right, one hop per step. If it jumps back to a card it just left, a
connector is modelled as a call instead of a hand-off (`flows.md`). If it disappears into a card
that sits on top of the line, the layout is wrong (`layout.md`). If a step's title does not say
what happens, the reader stops.

## Every card earns its place

- One card per thing that acts or holds state and that a reader would name. Merge a helper into
  the card that uses it and mention it in the `description`.
- A topic is a label, a function call is a sentence, a config value is a field. None is a card.
- Show the inside of the service the question is about, at the level the code is organised by
  (use cases, workers, listeners). Keep the other systems as one or two cards each.

## Budgets

|                     | Budget                                    | Lint code           |
| ------------------- | ----------------------------------------- | ------------------- |
| Cards on one screen | faithful 60 · balanced 30 · simplified 10 | `level-over-budget` |
| Card or group title | 40 characters (1–4 words is best)         | `label-too-long`    |
| Connector label     | 32 characters                             | `label-too-long`    |
| Steps per flow path | 4–15 (main path plus one branch)          |                     |
| Rows per rule       | as many cases as the code has             |                     |

Over the card budget? First merge minor cards; then group harder; only then push a part a level
down.

## Shape follows meaning

- A sequence is a **flow**; a decision is a **rule** on the step that decides; a team, system or
  role is a **group**; a gap is a **note**.
- A side write is a **dashed** connector, a hand-off a **solid** one.
- A choice at the end of a flow is a **branch**; a choice in the middle is a rule plus a
  description, or a separate flow.

## Words

- Card titles name the role ("Refresh job completion"), connector labels name what travels
  ("OrderPaid · Kafka", "enqueue RECALCULATE"), step titles say what happens ("Publish delete").
- Numbers belong in descriptions and conditions: retry counts, dedupe windows, thresholds,
  batch sizes. They are what engineers come to check.
- For `executive` readers drop protocols and tech; for `mixed`, plain titles and one sentence.

## Honesty

- Draw what you read in the code or what the user said. A likely-but-unseen connector goes under
  "Assumed" in the handover, not into the deck.
- When the code and a document disagree, draw the code and add a gap note.
- A card without connectors is fine only inside a group; lint reports `orphan-card` otherwise.
