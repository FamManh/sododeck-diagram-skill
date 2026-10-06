# From text formats

Read this when the user gives you Mermaid, C4 text or an OpenAPI document and wants a deck. Then
lay it out by hand (`layout.md`): the source's own layout is not kept, and a hand-laid deck reads far
better than the app's automatic one. Keep ids stable: derive each id once from the source identifier (a Mermaid node id, a C4 element id, an
OpenAPI tag), shortened to a slug, and reuse it on every later conversion so updates diff cleanly.

## Mermaid

| Mermaid                                          | Deck                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| flowchart node `api[API Gateway]`                | card `{ "id": "api", "title": "API Gateway" }`; pick the type from the label (`gateway`)                                |
| node shapes `[( )]` database, `[[ ]]` subroutine | `database`, `component`                                                                                                 |
| edge `a -->\|label\| b`                          | connector `a → b` with `label`; a node that is only a topic or queue name becomes the label of the connector through it |
| `subgraph core [Core]`                           | group `core`; a nested subgraph becomes a flat group (report it as collapsed)                                           |
| `sequenceDiagram` participants                   | cards; each message `A->>B: text` becomes a connector (once per pair and label) and a step of one flow, in order        |
| `style`, `classDef`, `click`, `linkStyle`        | left out (report them)                                                                                                  |

A sequence diagram becomes one flow. Its replies (`B-->>A`) are connectors back, which keeps every
step chained (`flows.md`).

## C4 text

| C4                                           | Deck                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Person`                                     | `client` card                                                                      |
| `System`, `System_Ext`                       | `service` / `external` card, `level: "system"`                                     |
| `Container`, `ContainerDb`, `ContainerQueue` | `service` / `database` / `queue`, `level: "container"`, `parent` = its system      |
| `Component`                                  | `component`, `level: "component"`, `parent` = its container                        |
| `Rel(a, b, "label", "tech")`                 | connector `a → b`, `label`, protocol from the technology                           |
| `System_Boundary`, `Container_Boundary`      | the boundary becomes the parent card; or a group when it has no element of its own |

The C4 levels map to deck levels: systems on top, open a system to see its containers.

## OpenAPI

An OpenAPI document describes one service, so it gives one card plus its callers, not a whole
architecture:

- the service is one card; `servers` go to `host`;
- each tag becomes a `component` card one level below the service (`parent`), when there is more
  than one tag;
- operations go into the component's `description` as a list (`POST /orders: create an order`);
- `callbacks` and `webhooks` become connectors to an `external` card;
- request and response examples go into a step's `payload` when the user also wants a flow.

## Fidelity report

End the handover with merged, collapsed, left out and could-not-map items (same format as in
`from-codebase.md`): styling lines, nested boundaries, unsupported diagram kinds, operations
without a tag. Nothing is dropped silently.
