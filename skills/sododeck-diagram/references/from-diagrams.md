# From a hand-drawn diagram

Read this when the user gives you a whiteboard file (`.excalidraw`), a screenshot or a photo of a
diagram and wants it as a deck. A drawing mixes several things on one canvas: architecture, flows,
decision logic, state, constants and plain notes. Your job is to sort each piece into the deck
part that holds it, and to say what had no home.

## Contents

1. Read the drawing
2. What each drawn thing becomes
3. Build order
4. Fidelity report

## 1. Read the drawing

**Whiteboard files** can be megabytes of coordinates and embedded pictures, and often hold several
unrelated boards. Don't read the JSON. Run:

```
node <skill>/scripts/outline.mjs board.excalidraw                  # boards, shapes, arrows, text
node <skill>/scripts/outline.mjs board.excalidraw --board "Flow"   # one board only
```

The first run lists the **boards** (large one-line titles with a diagram under them). Pick the
ones the user means; ask only if their request does not say. Then outline each board on its own.
The outline gives every labelled shape (kind, fill colour, position), every arrow as
`"from label" → "to label" "arrow label"` (`end guessed` when the arrow was not attached and the
nearest shape was taken: check those), and the free text by size: headings, legends, notes.
`--min-text 16` hides small print.

**Images**: read them directly; work board by board and section by section the same way.

Read the **legend** first when there is one: it says what each colour means (trigger, use case,
queue, external system, gap). Colours are usually consistent across the board, so the fill in the
outline tells you the card type.

Large boards are often drawn as a **matrix**: columns are stages (trigger → use case → queue →
worker → event → listener), rows are entry points. Each row is one flow; each column tells you the
kind of card. A row that reuses a shape drawn once ("shared parts drawn once") reuses one card.

## 2. What each drawn thing becomes

| On the drawing                                                | In the deck                                                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| a box for a service, use case, consumer, worker, job          | a card (`service`, `component`); one per name, even when drawn in several rows                                                          |
| a cylinder or "DB", a table list                              | `database` card, or `db-table` cards with columns (`database.md`)                                                                       |
| a topic, queue, outbox, job store                             | `queue` card (or `database` for a store you query)                                                                                      |
| a person, UI, BFF                                             | `client` card; an outside company's system: `external`                                                                                  |
| an arrow between boxes                                        | a connector, label = what travels                                                                                                       |
| a numbered path, a row of a matrix, a swimlane sequence       | a **flow**; replies get their own connector back (`flows.md`)                                                                           |
| entry points listed side by side (Kafka events, user actions) | one flow each, starting at its trigger card                                                                                             |
| a diamond / guard / "if"                                      | a **branch** when the path splits; a **rule** when it decides a value or an outcome                                                     |
| guards checked in order (G1, G2, G3…)                         | one rule with `hitPolicy: "first"`, a row per guard in that order                                                                       |
| a matrix (type × manipulation, status × action)               | a rule: inputs are the axes, outputs the cells                                                                                          |
| "setup gates", "all must hold"                                | a rule whose last row is the "not ready" outcome, attached to the flow's first step                                                     |
| reasons a step produces nothing ("Missing: no agreement…")    | a rule (input: what is missing, output: reason and owner), or a branch per reason when each has its own path                            |
| a status state machine                                        | the status values in the cards' and steps' `description`; transitions as step `title`s ("PENDING → INTERFACED"); report it as collapsed |
| constants, limits, retry counts                               | the `description` of the card that owns them (`chunk size 1000`, `retries 5`)                                                           |
| a payload or JSON sample                                      | the step's `payload`                                                                                                                    |
| a numbered section of a poster ("6 · Pricing")                | a **feature** with its flows and a feature view (`modeling.md` §8)                                                                      |
| an open gap, "documented vs implemented"                      | the card's or step's `notes`; a short sticky only when it must be seen on the canvas                                                    |
| an FAQ, a timeline, a title banner                            | the deck `description` (a short list), or left out and reported                                                                         |

Keep the drawing's names: a box labelled `GenerateCandidateQueueUseCase` is a card titled
"Generate Candidate Queue" with that exact name in its `description` or `tech`, so a reader can
find it in the code. Ids are short slugs made once from those names (`gen-queue-uc`).

## 3. Build order

1. Cards: every distinct box once, with type and a description that gathers the constants and
   notes drawn next to it. Group them by system and, inside the system the drawing is about, by
   role (use cases, workers, listeners, outbound), as `layout.md` describes. A drawing's colour
   band is a group when it matches one of those; otherwise ignore it.
2. Connectors: every arrow, deduplicated by (from, to, what travels). For a shared store, bus or
   job table drawn with arrows from everywhere, keep the arrows a flow walks and its owner; name
   the rest in its description.
3. Flows: one per entry point, row or numbered path; add reply connectors only where the chain
   needs them.
4. Features, views and rules only if the user asked for them.
5. Lay the deck out on the grid (`layout.md`); the drawing's own coordinates are a hint for the
   column order, not positions to copy.
6. Validate, lint (clear the layout warnings and `hub-card`), deliver. Don't pass `--detail`:
   the drawing's detail is the detail.

**Big decks.** Past about 15 cards, write a small script that builds the deck JSON (cards, then
connectors, then flows from lists of connector ids) instead of typing it: it keeps ids consistent
and lets you compute each listed view's `includes` from the flows plus the stores their notes name.
Run it, then validate and lint the file it writes.

**Sources that disagree** (two boards, a board and a doc): follow the one closest to the code and
the most recently changed, write the other version in the `description` of the rule or card it
affects ("Poster says only GENERATE reaches APM; code board adds REFRESH, REASSIGN_VENDOR"), and
list the conflict in the fidelity report.

**Long outlines.** A dense board can outline to tens of kilobytes. Add `--min-text 16` to drop
small print, or take `--format json` and filter it with a short script.

## 4. Fidelity report

End the handover with what did not come across one-to-one, in the four groups of
`from-codebase.md`: **merged** (boxes drawn twice that became one card), **collapsed** (a state
machine into descriptions, a section into a rule), **left out** (scribbles, unrelated boards, an
FAQ), **could not map** (an arrow whose ends you could not tell, a box with no name). Name the
board and the text, so the user can find it on their drawing.
