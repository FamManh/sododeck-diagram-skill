// build-deck.mjs: node build-deck.mjs > data-pipeline.draft.sododeck
// Then: node <skill>/scripts/deliver.mjs data-pipeline.draft.sododeck data-pipeline.sododeck --detail faithful
// Positions come from the column and row grid below; move a column by editing C.

const C = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000]; // column x
const R = (row) => row * 150; // row y

const nodes = [];
const edges = [];

const card = (id, type, title, col, row, group, extra = {}) =>
  nodes.push({ id, type, title, ...extra, group, position: { x: C[col], y: R(row) } });
const link = (id, from, to, protocol, label, extra = {}) =>
  edges.push({ id, from, to, protocol, label, ...extra });
const DASHED = { dash: 'dashed', width: 1.5 };
const side = (id, from, to, protocol, label) => link(id, from, to, protocol, label, { style: DASHED });
const tie = (id, note, to) => edges.push({ id, from: note, to, protocol: 'other', style: DASHED });

// ── Orchestration (top row) ────────────────────────────────────────────────
card('scheduler', 'service', 'Workflow scheduler', 0, 0, 'orch', {
  tech: 'DAG scheduler',
  description:
    'Runs the `nightly_full` DAG at **02:00 UTC**. Starts the orders extract, waits on sensors for the events and CRM partitions, then runs staging only when all three sources have landed. Task retries: 3, back-off 5 min.',
});
card('run-meta', 'database', 'Run metadata store', 1, 0, 'orch', {
  tech: 'Postgres',
  description:
    'Run state, task attempts, per-source watermarks (`orders.updated_at`, `events.event_time`) and the backfill log. Every job reads its watermark here at start and writes it back on success.',
});
card('planner', 'service', 'Backfill planner', 2, 0, 'orch', {
  tech: 'Python worker',
  description:
    'Consumes `partition.landed` events. When a partition lands **behind** the events watermark it applies the *Backfill window* rule and, if allowed, triggers a scoped re-run of staging for the late dates only.',
  rules: ['backfill-window'],
});

// ── Sources ────────────────────────────────────────────────────────────────
card('orders-replica', 'database', 'Orders DB replica', 0, 2, 'sources', {
  tech: 'Postgres read replica',
  description: 'Read replica of the orders database. Tables: `orders`, `order_items`, `refunds`.',
});
card('producers', 'service', 'Product event producers', 0, 3, 'sources', {
  tech: 'Web + mobile backends',
  description:
    'Emit clickstream and product events (`page_view`, `add_to_cart`, `checkout_started`). Mobile clients buffer offline, so events can arrive **days late**.',
});
card('crm', 'external', 'CRM', 0, 7, 'sources', {
  tech: 'SaaS CRM',
  description:
    'Drops a nightly accounts export on SFTP at ~01:30 UTC and receives the reverse-ETL bulk upserts. Bulk API quota: 10k rows/min.',
});

// ── Ingestion ──────────────────────────────────────────────────────────────
card('x-orders', 'component', 'Extract orders', 1, 2, 'ingest', {
  tech: 'Python · incremental',
  description:
    'Incremental pull: `WHERE updated_at > :watermark`, batches of 50k rows, written as Parquet. ~1.2 M rows/night.',
});
card('x-events', 'queue', 'Events sink consumer', 1, 3, 'ingest', {
  tech: 'Kafka consumer group',
  description:
    'Consumes `product.events` continuously and flushes hourly files partitioned by **event date** (not arrival date), so late events land in past partitions.',
});
card('x-crm', 'component', 'Fetch CRM export', 1, 4, 'ingest', {
  tech: 'SFTP sensor + loader',
  description:
    'Sensor waits for `accounts_YYYYMMDD.csv` (timeout 03:30 UTC), checks the row count trailer, converts to Parquet.',
});
card('landing', 'database', 'Landing zone', 2, 3, 'ingest', {
  tech: 'Object store · Parquet',
  description:
    'Raw, immutable files under `raw/<source>/dt=YYYY-MM-DD/`. Retained 90 days. Every new partition emits `partition.landed`.',
});

// ── Transformation ─────────────────────────────────────────────────────────
card('stage', 'component', 'Stage raw tables', 3, 3, 'transform', {
  tech: 'SQL models',
  description:
    'Loads landed partitions into `staging.*` in the Data warehouse with typed columns and load metadata (`_loaded_at`, `_run_id`).',
});
card('clean', 'component', 'Clean and dedupe', 4, 3, 'transform', {
  tech: 'SQL models',
  description:
    'Deduplicates on natural keys (latest `updated_at` wins), normalises currencies to EUR, drops test accounts, masks PII columns.',
});
card('dims', 'component', 'Build dimensional models', 5, 3, 'transform', {
  tech: 'SQL models',
  description:
    'Builds `dim_customer` (SCD type 2), `dim_product`, `fct_orders`, `fct_events` in a shadow schema `core_next`.',
});

// ── Data quality ───────────────────────────────────────────────────────────
card('dq', 'component', 'Run quality checks', 6, 3, 'quality', {
  tech: 'Declarative test suite',
  description:
    '~140 checks on `core_next`: schema, uniqueness, not-null, accepted values, freshness and row-volume deltas versus the 7-day median.',
});
card('q-mgr', 'service', 'Quarantine manager', 6, 4, 'quality', {
  tech: 'Python worker',
  description:
    'Applies the *Data quality severity* rule to every failed check. Moves failing rows (warn) or the whole batch (block) into the quarantine schema, marks the run in the Run metadata store, and raises an alert.',
  rules: ['dq-severity'],
});
card('quarantine', 'database', 'Quarantine schema', 6, 6, 'quality', {
  tech: 'Data warehouse schema',
  description:
    '`quarantine.<model>__<run_id>` tables with the failing rows and the check that caught them. Kept 30 days for triage.',
});

// ── Warehouse marts ────────────────────────────────────────────────────────
card('publish', 'component', 'Publish marts', 7, 3, 'marts', {
  tech: 'Schema swap',
  description:
    'Atomically swaps `core_next` into the mart schemas (`ALTER SCHEMA … RENAME` in one transaction), so readers never see a half-built mart.',
});
card('m-sales', 'database', 'Sales mart', 8, 2, 'marts', {
  tech: 'Data warehouse',
  description: 'Revenue, orders, refunds by day, channel and region.',
});
card('m-product', 'database', 'Product mart', 8, 3, 'marts', {
  tech: 'Data warehouse',
  description: 'Funnels, feature adoption and retention cohorts built from `fct_events`.',
});
card('m-customer', 'database', 'Customer mart', 8, 4, 'marts', {
  tech: 'Data warehouse',
  description: 'One row per account: lifetime value, health score, churn risk, last active date.',
});

// ── BI ─────────────────────────────────────────────────────────────────────
card('bi-refresh', 'component', 'Dashboard extract refresh', 9, 2, 'bi', {
  tech: 'BI extract cache',
  description: 'Rebuilds dashboard extracts from the marts. Full refresh ~25 min.',
});
card('dashboards', 'client', 'BI dashboards', 10, 2, 'bi', {
  tech: 'BI tool',
  description: 'Exec daily, Growth funnel, Finance close. Target: fresh by **06:00 UTC**.',
});

// ── Activation ─────────────────────────────────────────────────────────────
card('rev-etl', 'service', 'Reverse-ETL sync', 9, 7, 'activation', {
  tech: 'Python worker',
  description:
    'Diffs the Customer mart against the last synced snapshot and upserts only changed accounts to the CRM (`health_score`, `ltv_eur`, `churn_risk`).',
});

// ── On-call ────────────────────────────────────────────────────────────────
card('alerting', 'service', 'Alerting', 7, 6, 'oncall', {
  tech: 'Alert router',
  description:
    'Routes `dq.alerts` by severity: `warn` posts to the data-quality channel, `block` opens a ticket, `page` pages the data on-call.',
});

// ── Connectors ─────────────────────────────────────────────────────────────
link('sched-xorders', 'scheduler', 'x-orders', 'other', 'start nightly_full');
side('sched-meta', 'scheduler', 'run-meta', 'sql', 'run + task state');
side('planner-meta', 'planner', 'run-meta', 'sql', 'log backfill run');
side('replica-xorders', 'orders-replica', 'x-orders', 'sql', 'SELECT updated_at > wm');
link('producers-xevents', 'producers', 'x-events', 'event', 'product.events · Kafka');
link('crm-xcrm', 'crm', 'x-crm', 'other', 'accounts CSV · SFTP');
link('xorders-landing', 'x-orders', 'landing', 'other', 'PUT raw/orders/');
link('xevents-landing', 'x-events', 'landing', 'other', 'PUT raw/events/');
link('xcrm-landing', 'x-crm', 'landing', 'other', 'PUT raw/crm/');
link('landing-stage', 'landing', 'stage', 'sql', 'COPY INTO staging');
link('landing-planner', 'landing', 'planner', 'event', 'partition.landed · Kafka');
link('planner-stage', 'planner', 'stage', 'other', 're-stage dt range');
link('stage-clean', 'stage', 'clean', 'sql', 'staging.*');
link('clean-dims', 'clean', 'dims', 'sql', 'clean.*');
link('dims-dq', 'dims', 'dq', 'sql', 'core_next built');
link('dq-publish', 'dq', 'publish', 'other', 'all checks passed');
link('dq-qmgr', 'dq', 'q-mgr', 'other', 'failed checks');
side('qmgr-quarantine', 'q-mgr', 'quarantine', 'sql', 'move failing rows');
link('qmgr-publish', 'q-mgr', 'publish', 'event', 'dq.released · Kafka');
link('qmgr-alerting', 'q-mgr', 'alerting', 'event', 'dq.alerts · Kafka');
link('publish-msales', 'publish', 'm-sales', 'sql', 'swap sales');
link('publish-mproduct', 'publish', 'm-product', 'sql', 'swap product');
link('publish-mcustomer', 'publish', 'm-customer', 'sql', 'swap customer');
link('msales-bi', 'm-sales', 'bi-refresh', 'sql', 'refresh extracts');
link('mproduct-bi', 'm-product', 'bi-refresh', 'sql', 'refresh extracts');
link('bi-dashboards', 'bi-refresh', 'dashboards', 'http', 'publish extracts');
link('mcustomer-revetl', 'm-customer', 'rev-etl', 'sql', 'changed accounts');
link('revetl-crm', 'rev-etl', 'crm', 'http', 'POST /bulk/accounts');
link('crm-revetl', 'crm', 'rev-etl', 'http', 'bulk job result');

// ── Notes (outside every frame, tied to their card) ────────────────────────
const stickies = [
  {
    id: 'note-lag',
    text: '**Caveat · replica lag.** The orders extract reads a replica. If lag exceeds 15 min at 02:00, rows updated in that gap wait for the next night.',
    color: 'amber',
    position: { x: -400, y: 300 },
    size: { width: 240, height: 120 },
  },
  {
    id: 'note-quota',
    text: '**Caveat · CRM quota.** Bulk upserts are capped at 10k rows/min. A large re-score (> 600k accounts) runs past 08:00 and overlaps sales hours.',
    color: 'amber',
    position: { x: 3000, y: 1050 },
    size: { width: 240, height: 120 },
  },
];
tie('note-lag-tie', 'note-lag', 'orders-replica');
tie('note-quota-tie', 'note-quota', 'rev-etl');

// ── Groups ─────────────────────────────────────────────────────────────────
const groups = [
  { id: 'orch', title: 'Orchestration', style: { fill: 'violet' } },
  { id: 'sources', title: 'Sources', style: { fill: 'slate' } },
  { id: 'ingest', title: 'Ingestion', style: { fill: 'blue' } },
  { id: 'transform', title: 'Transformation', style: { fill: 'teal' } },
  { id: 'quality', title: 'Data quality', style: { fill: 'amber' } },
  { id: 'marts', title: 'Warehouse marts', style: { fill: 'indigo' } },
  { id: 'oncall', title: 'On-call', style: { fill: 'red' } },
  { id: 'bi', title: 'BI', style: { fill: 'green' } },
  { id: 'activation', title: 'Activation', style: { fill: 'pink' } },
];

// ── Rules ──────────────────────────────────────────────────────────────────
const rules = {
  'dq-severity': {
    title: 'Data quality severity',
    description:
      'Severity of a failed check, by check type and failure rate (% of rows failing; for `volume`, % deviation from the 7-day median row count). First matching row wins. `warn` publishes the passing rows, `block` holds the mart, `page` also wakes the on-call.',
    hitPolicy: 'first',
    inputs: [
      { id: 'check', label: 'Check type' },
      { id: 'rate', label: 'Failure rate (%)' },
    ],
    outputs: [
      { id: 'severity', label: 'Severity' },
      { id: 'action', label: 'Action' },
    ],
    rows: [
      { id: 'schema', when: ['schema', 'any'], then: ['page', 'Hold all marts, page on-call'] },
      { id: 'vol-big', when: ['volume', '> 50'], then: ['page', 'Hold mart, page on-call'] },
      { id: 'unique', when: ['uniqueness', '> 0'], then: ['block', 'Quarantine batch, hold mart'] },
      { id: 'fresh', when: ['freshness', 'any'], then: ['block', 'Hold mart, open ticket'] },
      { id: 'vol', when: ['volume', '> 20'], then: ['block', 'Quarantine batch, hold mart'] },
      { id: 'nn-high', when: ['not_null', '> 1'], then: ['block', 'Quarantine batch, hold mart'] },
      { id: 'av-high', when: ['accepted_values', '> 5'], then: ['block', 'Quarantine batch, hold mart'] },
      { id: 'other', when: ['any', 'any'], then: ['warn', 'Quarantine failing rows, publish rest'] },
    ],
  },
  'backfill-window': {
    title: 'Backfill window',
    description:
      'What the Backfill planner does with a partition that lands behind the events watermark, by lateness (days between event date and arrival) and share of that date’s rows arriving late. First matching row wins.',
    hitPolicy: 'first',
    inputs: [
      { id: 'lateness', label: 'Lateness (days)' },
      { id: 'share', label: 'Late share of day (%)' },
    ],
    outputs: [
      { id: 'decision', label: 'Decision' },
      { id: 'window', label: 'Re-run window' },
    ],
    rows: [
      { id: 'same-night', when: ['<= 1', 'any'], then: ['No backfill', 'Next nightly run covers it'] },
      { id: 'auto', when: ['<= 7', 'any'], then: ['Auto backfill now', 'Late dates only'] },
      { id: 'small', when: ['<= 30', '< 5'], then: ['Batch to Sunday slot', 'Late dates only'] },
      { id: 'approve', when: ['<= 30', 'any'], then: ['Needs data owner approval', 'Late dates only'] },
      { id: 'too-old', when: ['any', 'any'], then: ['Archive, never restate', 'None'] },
    ],
  },
};

// ── Flows ──────────────────────────────────────────────────────────────────
const features = [
  { id: 'nightly', title: 'Nightly' },
  { id: 'recovery', title: 'Recovery' },
  { id: 'activation', title: 'Activation' },
];

const flows = [
  {
    id: 'nightly-run',
    title: 'Nightly full run',
    feature: 'nightly',
    trigger: 'Scheduler fires `nightly_full` at 02:00 UTC',
    outcome: 'Every mart is swapped in one transaction and dashboards show yesterday’s numbers by 06:00 UTC',
    steps: [
      {
        id: 'start',
        edge: 'sched-xorders',
        title: 'Start nightly DAG',
        description:
          'The scheduler also starts the CRM and events sensors; this flow follows the orders branch. Run state is written to the Run metadata store (dashed).',
        payload: '{ "dag": "nightly_full", "run_id": "nf_2026-10-05", "logical_date": "2026-10-05" }',
      },
      {
        id: 'land',
        edge: 'xorders-landing',
        title: 'Land orders partition',
        sla: '< 20 min',
        description: 'Reads the replica since the stored watermark (dashed side read).',
        payload:
          '{ "path": "raw/orders/dt=2026-10-05/", "files": 24, "rows": 1184320, "watermark": "2026-10-05T23:59:58Z" }',
      },
      {
        id: 'stage',
        edge: 'landing-stage',
        title: 'Load into staging',
        condition: 'orders, events and CRM partitions all landed',
      },
      { id: 'clean', edge: 'stage-clean', title: 'Clean and dedupe' },
      { id: 'model', edge: 'clean-dims', title: 'Build star schema', sla: '< 45 min' },
      { id: 'check', edge: 'dims-dq', title: 'Run quality suite' },
      {
        id: 'publish',
        edge: 'dq-publish',
        title: 'Publish passed models',
        condition: 'no failed check',
        description: 'Any failed check hands over to the Quarantine manager instead (see *Quality check fails*).',
      },
      { id: 'swap', edge: 'publish-msales', title: 'Swap sales mart' },
      { id: 'refresh', edge: 'msales-bi', title: 'Refresh extracts', sla: '< 25 min' },
      { id: 'serve', edge: 'bi-dashboards', title: 'Dashboards refreshed', sla: 'by 06:00 UTC' },
    ],
  },
  {
    id: 'backfill',
    title: 'Late-arriving events backfill',
    feature: 'recovery',
    trigger: 'Mobile clients flush events buffered offline, with event dates days in the past',
    outcome:
      'Only the late dates are rebuilt and the Product mart is corrected; dates older than 30 days are archived and never restated',
    steps: [
      {
        id: 'arrive',
        edge: 'producers-xevents',
        title: 'Late events arrive',
        payload:
          '{ "event": "checkout_started", "event_time": "2026-10-02T18:41:07Z", "received_at": "2026-10-05T07:12:44Z", "user_id": "u_83f1" }',
      },
      { id: 'write', edge: 'xevents-landing', title: 'Write past partition' },
      {
        id: 'detect',
        edge: 'landing-planner',
        title: 'Detect late partition',
        rules: ['backfill-window'],
        ruleInputs: { 'backfill-window': { lateness: '3', share: '2.4' } },
        description: 'The planner compares the partition date with the events watermark in the Run metadata store.',
      },
      {
        id: 'restage',
        edge: 'planner-stage',
        title: 'Re-stage late dates',
        condition: 'decision = Auto backfill now',
        payload: '{ "run_id": "bf_2026-10-05_01", "source": "events", "dates": ["2026-10-02"], "mode": "replace_partition" }',
      },
      { id: 'clean', edge: 'stage-clean', title: 'Clean late dates' },
      { id: 'model', edge: 'clean-dims', title: 'Rebuild affected facts', description: 'Only `fct_events` partitions for the late dates; dimensions untouched.' },
      { id: 'check', edge: 'dims-dq', title: 'Run quality suite' },
      { id: 'publish', edge: 'dq-publish', title: 'Publish corrected models' },
      { id: 'swap', edge: 'publish-mproduct', title: 'Swap product mart' },
      { id: 'refresh', edge: 'mproduct-bi', title: 'Refresh funnel extracts' },
      { id: 'serve', edge: 'bi-dashboards', title: 'Corrected funnels live' },
    ],
  },
  {
    id: 'dq-fail',
    title: 'Quality check fails',
    feature: 'recovery',
    trigger: 'One or more checks fail on `core_next` during a run',
    outcome:
      'Failing data is quarantined and the right people are told; a blocked mart keeps yesterday’s data rather than wrong data',
    branches: [
      { id: 'warn', label: 'Warn', condition: 'severity = warn' },
      { id: 'block', label: 'Block', condition: 'severity = block, page', errorPath: true },
    ],
    steps: [
      { id: 'model', edge: 'clean-dims', title: 'Build star schema' },
      { id: 'check', edge: 'dims-dq', title: 'Run quality suite' },
      {
        id: 'handover',
        edge: 'dq-qmgr',
        title: 'Hand over failed checks',
        rules: ['dq-severity'],
        ruleInputs: { 'dq-severity': { check: 'not_null', rate: '0.4' } },
        payload:
          '{ "run_id": "nf_2026-10-05", "model": "fct_orders", "check": "not_null(customer_id)", "failed_rows": 4712, "total_rows": 1184320 }',
        description: 'The worst severity across all failed checks decides the branch.',
      },
      {
        id: 'release',
        edge: 'qmgr-publish',
        title: 'Release passing rows',
        branch: 'warn',
        description: 'Failing rows go to the Quarantine schema (dashed); a warn notice is posted on `dq.alerts` without paging.',
      },
      { id: 'swap', edge: 'publish-msales', title: 'Swap sales mart', branch: 'warn' },
      { id: 'refresh', edge: 'msales-bi', title: 'Refresh extracts', branch: 'warn' },
      { id: 'serve', edge: 'bi-dashboards', title: 'Dashboards show warning', branch: 'warn' },
      {
        id: 'alert',
        edge: 'qmgr-alerting',
        title: 'Hold mart and alert',
        branch: 'block',
        description:
          'The whole batch moves to the Quarantine schema and the run is marked `blocked`. `block` opens a ticket; `page` pages the data on-call. Marts keep yesterday’s data.',
        payload: '{ "severity": "page", "run_id": "nf_2026-10-05", "check": "schema(fct_orders)", "runbook": "dq/schema-drift" }',
      },
    ],
  },
  {
    id: 'reverse-etl',
    title: 'Reverse-ETL sync to CRM',
    feature: 'activation',
    trigger: 'Customer mart is published by the nightly run',
    outcome: 'Changed accounts carry fresh health score, LTV and churn risk in the CRM; unchanged accounts are not sent',
    steps: [
      { id: 'publish', edge: 'dq-publish', title: 'Publish passed models' },
      { id: 'swap', edge: 'publish-mcustomer', title: 'Swap customer mart' },
      {
        id: 'diff',
        edge: 'mcustomer-revetl',
        title: 'Select changed accounts',
        description: 'Diffs against the last synced snapshot; typically 3–8 % of accounts change per night.',
      },
      {
        id: 'upsert',
        edge: 'revetl-crm',
        title: 'Bulk upsert accounts',
        sla: '10k rows/min',
        payload:
          '{ "object": "account", "external_id_field": "acct_id", "records": [{ "acct_id": "A-10293", "health_score": 72, "ltv_eur": 18450, "churn_risk": "low" }] }',
      },
      {
        id: 'result',
        edge: 'crm-revetl',
        title: 'Record bulk job result',
        description: 'Rejected rows are retried once; if over 1 % still fail, the sync raises a `warn` on `dq.alerts`.',
        payload: '{ "job_id": "bj_77120", "processed": 41210, "failed": 18 }',
      },
    ],
  },
];

const deck = {
  $schema: 'https://sododeck.com/schema/v1.json',
  version: 1,
  name: 'Nightly analytics pipeline',
  description:
    'A fictional nightly batch pipeline: three sources land in an object store, are staged, cleaned and modelled in the Data warehouse, checked for quality, published to marts, and served to BI dashboards and back to the CRM.',
  nodes,
  groups,
  edges,
  views: [],
  features,
  flows,
  rules,
  stickies,
};
process.stdout.write(JSON.stringify(deck, null, 2) + '\n');
