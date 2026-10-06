# Scripts

Every script: `node <skill>/scripts/<name>.mjs …`. Node 20 or newer, offline, reads and writes only
the files you name. `--help` prints usage.

Exit codes: `0` no `error` problems (warnings allowed) · `1` at least one `error`, or a file that
cannot be loaded · `2` wrong arguments or a file that cannot be read (message on stderr).

## Contents

1. validate · 2. lint · 3. summary · 4. diff · 5. deliver · 6. Reading a problem · 7. Problem
   codes

## 1. validate

`validate.mjs <deck> [--format json|text]`: would the app open this file? Checks JSON syntax, the
file format (schema) and identity rules (unique ids). Default output is JSON.

## 2. lint

`lint.mjs <deck> [--detail faithful|balanced|simplified] [--mode new|update|codebase|text]
[--format json|text]`: everything validate checks, plus the app's deck problems (broken flows,
missing rules, broken references, …) and the authoring checks (taste, modelling and layout
warnings: a card without a position, a connector over a card, a frame over another group's card,
overlapping frames). `--mode codebase` also asks for a source link on every card and connector.

## 3. summary

`summary.mjs <deck> [--format text|json]`: a short outline (groups with cards, levels,
connectors, flows with numbered steps, rules and where they are used). Read it before editing a
deck instead of reading the whole file.

## 4. diff

`diff.mjs <old> <new> [--format json|text]`: what changed, matched by id. `+` added, `~` changed
(with the changed fields), `-` removed. Exit 0 whenever both files load.

## 5. deliver

`deliver.mjs <draft> <target> [--detail …] [--mode …]`: runs lint on the draft; when there is no
error, replaces the target with the draft in one step and deletes the draft (the report prints
only when there are warnings). Otherwise both files stay as they are and the report prints.

## 6. Reading a problem

```json
{
  "code": "step-without-connection",
  "severity": "error",
  "path": "/flows/0/steps/2",
  "subject": "charge",
  "message": "Step without connection: Checkout · step 3 used a deleted connection.",
  "evidence": "Checkout · step 3 used a deleted connection",
  "fix": "Point the step's \"edge\" to an existing connector id, or remove the step."
}
```

`path` is a JSON Pointer into the file (`/flows/0/steps/2` = first flow, third step; a schema
problem points at the exact key, such as `/nodes/3/title`); `subject` is the id of the object; `fix` is what to change. A file that is not JSON gives
`line` and `column` instead of `path`. The same report comes out of Sododeck's **Copy problems**,
so a user can paste the app's problems to you and you fix them the same way.

## 7. Problem codes

Errors make the app refuse a file or mark a deck problem; warnings are advice. Format and identity
codes (`schema-*`, `invalid-json`, `duplicate-id`, …) come from validate.

### Deck problems (lint)

| Code | Severity | Title | Fix |
| --- | --- | --- | --- |
| `duplicate-connection` | warning | Duplicate connection | Delete the extra connectors so each pair is joined once, or give them different labels. |
| `step-without-connection` | error | Step without connection | Point the step's "edge" to an existing connector id, or remove the step. |
| `broken-chain` | error | Broken flow | Pick connectors so each step starts where the previous step ended, or reorder the steps. |
| `incomplete-flow` | warning | Incomplete flow | Add steps to the flow, and give every branch a label, a condition and existing steps. |
| `overlapping-conditions` | warning | Overlapping conditions | Give each branch of the flow a different condition. |
| `missing-rule` | warning | Missing rule | Point the reference to an existing key of "rules", or remove it. |
| `rule-without-catch-all` | warning | Rule without catch-all | Add a last row whose "when" cells are all empty or "any", so every input matches a row. |
| `invalid-rule-cells` | error | Invalid rule cells | Write each cell as a value, a list ("a, b"), a comparison with a number (">= 3") or "any". |
| `broken-reference` | error | Broken reference | Point the reference to an existing id, or remove it. |
| `card-size-out-of-range` | warning | Card size out of range | Set "size" between 120 × 44 and 800 × 600 (shapes may be smaller), or remove it. |
| `unknown-card-type` | warning | Unknown card type | Use a card type this version knows, such as "service" or "database". |
| `unknown-pack` | warning | Unknown pack | Remove the id from "packs", or use a built-in pack: architecture, process, logistics, data, database, shapes. |
| `field-value-dangling` | warning | Value without a field | Remove the value from "values", or add the field (and option) it points to in "fields". |
| `db-dangling-reference` | error | Missing column | Point the reference to an existing column or enum id, or remove it. |
| `db-composite-mismatch` | error | Key columns don't match | Give "fromColumns" and "toColumns" the same number of columns. |
| `db-no-primary-key` | warning | No primary key | Mark one or more columns of the table as the primary key ("pk": true). |
| `db-duplicate-table` | error | Duplicate table | Rename one of the tables so each table name is unique in its schema. |
| `db-duplicate-column` | error | Duplicate column | Rename one of the columns so each column name is unique in its table. |
| `db-duplicate-index` | error | Duplicate index | Rename one of the indexes so each index name is unique. |
| `db-duplicate-enum` | error | Duplicate enum | Rename one of the enums so each enum name is unique in its schema. |
| `db-empty-column` | error | Column without a name | Give the column a name. |
| `db-type-mismatch` | error | Type mismatch | Give the referencing columns the same type as the columns they reference. |
| `db-null-default` | error | Null default on a not-null column | Remove the null default, or allow null in the column. |
| `db-fk-not-key` | warning | Reference to a non-key column | Point the relationship at the primary key or a unique column of the referenced table. |
| `db-many-to-many` | warning | Many-to-many | Add a junction table with a foreign key to each side. |
| `db-empty-enum` | warning | Enum without values | Add at least one value to the enum. |
| `db-default-type` | warning | Default does not fit the type | Change the default so it fits the column type. |
| `db-required-loop` | warning | Required references form a loop | Make one foreign key in the loop optional so rows can be inserted. |
| `db-duplicate-relationship` | warning | Duplicate relationship | Delete the extra relationship. |
| `db-unknown-type` | warning | Type not in the list | Use a type from the dialect's list, or keep it if your database defines it. |

### Authoring checks (lint, skill only)

| Code | Severity | Title | Fix |
| --- | --- | --- | --- |
| `id-style` | warning | Id is not a short slug | Use a short lower-case slug (at most 32 characters) chosen once; never rebuild it from the title. |
| `orphan-card` | warning | Card without connections | Connect the card, put it in a group, or delete it if it does not earn its place. |
| `duplicate-title` | warning | Same title twice | Give each card in the same group and level its own title. |
| `label-too-long` | warning | Label over budget | Shorten the label; put details in the note or in fields. |
| `level-over-budget` | warning | Too many cards on one level | Split the level: move related cards under a parent card one level down, or merge minor ones. |
| `connector-without-source` | warning | No source link | Add a link to the file and lines the connector or card was built from, or remove it. |
| `card-without-position` | warning | Card without a position | Place the card on the layout grid (see references/layout.md); the skill lays decks out by hand, the app does not. |
| `connector-crosses-card` | warning | Connector runs over a card | Move the card off the line, move an end so the line between the two card centres misses it, or add a bend (`route.waypoints`). |
| `frame-covers-card` | warning | Group frame covers a card of another group | Move the card out of the frame, or move the group's cards so their frame no longer reaches it. |
| `frames-overlap` | warning | Two group frames overlap | Move one group so the frames have a gap; sibling groups never share space. |
