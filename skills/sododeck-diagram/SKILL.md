---
name: sododeck-diagram
description: >-
  Writes and edits Sododeck decks (.sododeck files): architecture components, connectors, groups,
  step-by-step flows and decision rules, laid out by hand and checked by bundled validate and lint
  scripts so the file imports cleanly into Sododeck. Use this whenever the user wants a system,
  architecture, service, data-flow or request-flow diagram, wants to document how a request or a
  job moves through services, has a .sododeck file to change, or asks for a deck built from a
  description, a codebase, a database schema, Mermaid, C4 or OpenAPI, even if they never say
  "Sododeck".
---

# Sododeck diagram

A Sododeck deck is a **model you can play**: cards, connectors between them, groups, flows that
walk along connectors step by step, and decision tables on the steps that decide. It is also a
**picture**, and the picture is your job: you place every card. The app can lay out cards that
have no position, but it cannot know which lines matter; a hand-laid deck reads far better.

Skill 1.0.0+359c247b22e8 · file format version 1 · schema fingerprint 359c247b22e8.
The full schema is `schema/v1.json`; you rarely need it, the references cover what matters.

## What makes a deck good

A reader should be able to press play on any flow and watch it travel across the screen without
the line doubling back, jumping, or hiding behind a card. Everything below serves that:

1. **Cards are the things that act or hold state**: a deployable, a use case, a consumer, a
   worker, a listener, a table that hands work over, an outside system. A message broker topic is
   **not** a card; it is the label of the connector that carries it (`OrderPaid · Kafka`).
2. **Two kinds of connector.** Solid connectors are hand-offs, the path a flow walks. Dashed
   connectors (`"style": { "dash": "dashed", "width": 1.5 }`) are side reads and writes (a service
   writes its own table, a worker calls a pricing API); they explain the picture but are never a
   flow step.
3. **A flow is one unbroken walk** along solid connectors: each step starts where the previous one
   ended. Side effects go in the step's `description`, decisions in a rule on the step.
4. **Groups carry structure, levels are rare.** Put cards in frames by responsibility (nested
   groups are fine) on one screen. Use a drill-down level only for a part most readers never open.
5. **Hand layout on a grid**, data flowing left to right, no connector running over a card, no
   frame covering a card of another group. Lint checks all three.
6. **Only what you traced.** Every card and connector comes from the request or the code. Things
   that look wrong in the code go on a sticky note ("Gap · …"), not into silent omissions.

## Workflow

1. **Pick the mode** and read the reference it names (table below), plus `references/layout.md`
   for any new deck or any update that adds cards.
2. **List before you draw**: cards (with their group), solid hand-offs, dashed side connectors,
   flows as sequences of hand-offs. Check every flow is a walk before writing JSON.
3. **Write the deck to a draft file** (`checkout.draft.sododeck`), never over the user's file. Over
   about 15 cards, write a small generator script instead of the JSON by hand (`layout.md` shows
   one): positions come from a column and row grid, and you can move a column in one edit.
4. **Check** with `validate.mjs`, then `lint.mjs`. Fix every `error`, then every layout warning
   (`card-without-position`, `connector-crosses-card`, `frame-covers-card`, `frames-overlap`), rerun
   until clean. Each problem names the `code`, the JSON `path`, the `subject` id and a `fix`.
5. **Deliver** with `deliver.mjs`: it replaces the target only when the draft passes.
6. **Hand over** in the format at the end of this file.

```
node <skill>/scripts/validate.mjs draft.sododeck --format text
node <skill>/scripts/lint.mjs draft.sododeck --format text [--mode update|codebase] [--detail …]
node <skill>/scripts/deliver.mjs draft.sododeck target.sododeck [--mode …]
```

`<skill>` is the folder this file is in. `--format text` prints one line when all is well and one
short block per problem; leave it out for JSON. All scripts need Node 20 or newer, work offline
and read only the files you name. `references/scripts.md` lists every option and problem code.

## Modes

| The user wants…                         | Mode             | Read                                                                                 |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| a deck from a description (the default) | `new`            | `references/modeling.md`, `references/flows.md`; `rules.md` for a decision or policy |
| a deck of a code repository             | `codebase`       | `references/from-codebase.md` (it sends you to the others)                           |
| to change an existing deck              | `update`         | run `summary.mjs` first, then the reference for what they ask about                  |
| a deck from Mermaid, C4 text or OpenAPI | `text`           | `references/from-text-formats.md`                                                    |
| database tables and relationships       | `new` / `update` | `references/database.md`                                                             |

Always also read `references/layout.md` (placing cards) and, once per new deck,
`references/taste.md`. Pass the mode to lint (`--mode update`, `--mode codebase`).

## Dials

- **Detail** (`--detail` for lint): `faithful` (at most 60 cards on one screen), `balanced` (30,
  the default), `simplified` (10). A code walkthrough is `faithful`; a slide is `simplified`.
- **Audience**: `engineer` (default: protocols, tech, payloads, source links), `mixed` (plain
  titles, short descriptions), `executive` (outcomes and owners, no protocols). The audience
  changes wording and fields, never the structure rules.

## Rules that matter most

- **Ids are permanent.** Pick a short lower-case slug once (`orders`, `orders-db`, `w-update`) and
  never change it. Views, links and steps attach by id.
- **A flow step uses a solid connector, and starts where the last step ended.** If the story
  needs to come back ("the provider replies"), add the connector back. If it does not continue
  from the target (a write to a table), the connector is dashed and not a step.
- **Branches fork only at the end** of a flow's main path. An early exit ("unmatched → skipped")
  goes in a step `description` or a rule, or becomes its own flow.
- **Every card and note has a position**, on the grid from `layout.md`.

## Update mode

Change only what was asked. Keep every other object, id, position, key order and wording; edit
the draft rather than regenerating the file. Place new cards in free space next to the cards they
connect to, on the same grid, and rerun lint so no connector crosses a card. Before delivering run
`node <skill>/scripts/diff.mjs <their file> <draft> --format text` and show the result. Anything
removed must be something they asked to remove; a `~` on an object you did not mean to touch is a
slip: undo it.

## Handover

End with this, filled in (omit lines that don't apply):

```
Deck: <path> (<n> cards, <n> connectors, <n> flows, <n> rules). validate ✓ lint ✓ (warnings: <n or none>)
What's in it: <3–6 lines from summary.mjs: groups, then flows>
Gaps found: <the sticky notes you added, one line each>      (codebase mode)
Assumed: <what you inferred rather than read, or "nothing">
Warnings kept: <code: why it is fine here>                   (only when lint left warnings)
Changes: <diff.mjs text output>                              (update mode)
Fidelity: merged … · left out … · could not map …            (codebase / text modes)
Import: open Sododeck, Library → Import (or drop the file on the library).
        If it reports problems, use "Copy problems" and paste them here.
```
