# Decision rules

Read this when the user describes a decision, policy, pricing, routing or approval logic, or when
code you trace has a status mapping, an eligibility check or any `if` ladder a reader needs. A
rule is a small decision table; attach it to the step or card where the decision is made. Don't
draw a decision as a diamond card: a rule keeps the logic readable and testable in the app.

## Shape

Rules live in the root `rules` object, keyed by rule id:

```json
"rules": {
  "refund-approval": {
    "title": "Refund approval",
    "description": "Who approves a refund, by amount and order age.",
    "hitPolicy": "first",
    "inputs": [
      { "id": "amount", "label": "Amount (EUR)" },
      { "id": "age", "label": "Order age (days)" }
    ],
    "outputs": [{ "id": "approver", "label": "Approver" }],
    "rows": [
      { "id": "small", "when": ["<= 50", "<= 30"], "then": ["Automatic"] },
      { "id": "recent", "when": ["<= 500", "<= 30"], "then": ["Support lead"] },
      { "id": "other", "when": ["any", "any"], "then": ["Finance"] }
    ]
  }
}
```

- `hitPolicy`: `first` (the first matching row wins, the usual choice), `unique` (exactly one row
  may match), `collect` (all matching rows apply).
- Each row has one `when` cell per input and one `then` cell per output, in column order.
- A `first` rule should end with a catch-all row (`any` in every `when` cell, with what happens
  "otherwise"), or lint warns `rule-without-catch-all`. A `collect` table that lists facts (one
  row per trigger window, per notification type) may keep that warning; say so under "Warnings
  kept".
- In codebase mode, cite the line that implements the table in its `description`, and use the
  code's own values in the cells (`PENDING`, `> 50`), so a reader can check it.

## Cell grammar (`when` cells)

| Cell                                           | Matches                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `any` or empty                                 | anything                                                           |
| `<= 50`, `< 10`, `>= 3`, `> 2` (also `≤`, `≥`) | numbers compared                                                   |
| `gold, silver`                                 | any value in the list                                              |
| `Yes`                                          | that value exactly (case-insensitive; numbers compared as numbers) |

A cell lint cannot read is reported as `invalid-rule-cells`. Qualitative inputs ("all items
approved", "some", "none") are plain values: write `all`, `some`, `none` and match them exactly.

## Attaching

- To a step: `"rules": ["refund-approval"]` on the step, and optionally sample inputs to show in
  the player: `"ruleInputs": { "refund-approval": { "amount": "120", "age": "10" } }`.
- To a card: `"rules": ["refund-approval"]` on the node, when the card applies the policy
  everywhere rather than in one flow.

A step or card that names a rule id that does not exist is reported as `missing-rule`.
`examples/refund-policy.sododeck` shows a rule attached to a step.
