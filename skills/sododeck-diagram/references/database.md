# Database pack

Read this when the user wants tables, columns and relationships (an ER model), or wants flows to
show which tables a step reads or writes.

## Setup

Add `"database"` to the root `packs` (for example `"packs": ["architecture", "database"]`) and set
`"dialect"` to `generic`, `postgres`, `mysql` or `sqlite`.

## Tables

A table is a card of type `db-table`. Its `title` is the table name. Tables need a `position`
like every card; put related tables in one column and a relationship's two tables on one row
where you can (`layout.md`).

```json
{
  "id": "orders",
  "type": "db-table",
  "title": "orders",
  "description": "One row per order.",
  "position": { "x": 300, "y": 0 },
  "columns": [
    { "id": "orders-id", "name": "id", "type": "bigint", "pk": true, "increment": true },
    { "id": "orders-customer", "name": "customer_id", "type": "bigint", "notNull": true },
    { "id": "orders-total", "name": "total", "type": "numeric", "size": "10,2", "default": 0 }
  ],
  "indexes": [{ "id": "idx-orders-customer", "columns": ["orders-customer"] }]
}
```

Column fields: `id` and `name` and `type` required; `size`, `pk`, `notNull`, `unique`,
`increment`, `default` or `defaultExpr` (not both), `check`, `enumRef`, `note`. Column ids are
permanent like every other id; the column `name` can change.

Every table should have a primary key (`db-no-primary-key` warns otherwise). Table names and
column names must be unique (`db-duplicate-table`, `db-duplicate-column`).

To place tables under a database card, give them `"parent": "<database card id>"`: the database
card opens to its tables.

## Relationships

A relationship is a connector between two tables with the key columns:

```json
{
  "id": "rel-orders-customer",
  "from": "orders",
  "to": "customers",
  "label": "placed by",
  "fromColumns": ["orders-customer"],
  "toColumns": ["customers-id"],
  "cardinality": "n-1",
  "onDelete": "cascade"
}
```

`cardinality` reads from → to: `1-1`, `1-n`, `n-1`, `n-n`. `fromColumns` and `toColumns` are column
ids of the `from` and `to` tables, the same number on both sides (`db-composite-mismatch`
otherwise, `db-dangling-reference` when a column id does not exist).

## Steps that touch tables

A flow step can say which tables (or columns) it reads or writes:

```json
"touches": [
  { "table": "orders", "access": "write" },
  { "table": "customers", "column": "customers-email", "access": "read" }
]
```

`table` is a table card id, `column` a column id of that table, `access` is `read` or `write`.
Use touches instead of extra flow steps for database side effects (see `flows.md`).
