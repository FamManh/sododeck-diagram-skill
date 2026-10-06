// build-deck.mjs: regenerates the food delivery showcase deck.
//   node build-deck.mjs            -> writes food-delivery.draft.sododeck next to this script
// Then: validate, lint --detail faithful, deliver.mjs draft -> food-delivery.sododeck.
// Positions come from the column / row grid below; move a column by editing one number.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Columns follow the work: apps -> gateway -> use cases -> job table -> pool -> workers
// -> outbound adapters -> completion listeners -> outbox -> relay.
const C = [0, 300, 650, 1050, 1350, 1750, 2100, 2450, 2800, 3150, 3500];
const ROW = 150;
const TOP = -400; // partner APIs sit in a row above the order service
const BOTTOM = 1050; // corridor row: notification service -> restaurant tablet

const nodes = [];
const edges = [];
const dashed = { dash: 'dashed', width: 1.5 };

const card = (id, type, title, col, y, group, extra = {}) =>
  nodes.push({ id, type, title, ...extra, ...(group ? { group } : {}), position: { x: C[col], y } });
const link = (id, from, to, protocol, label, extra = {}) =>
  edges.push({ id, from, to, protocol, ...(label ? { label } : {}), ...extra });
const side = (id, from, to, protocol, label) => link(id, from, to, protocol, label, { style: dashed });

// ---------------------------------------------------------------- apps + edge
card('cust-app', 'client', 'Customer app', 0, 2 * ROW, 'apps', {
  tech: 'Mobile app',
  description: 'Browses menus, places and cancels orders, shows courier ETA from push updates.',
});
card('rest-app', 'client', 'Restaurant tablet app', 0, BOTTOM, 'apps', {
  tech: 'Tablet app (kiosk mode)',
  description:
    'Rings on a new paid order; staff accept (with prep minutes) or reject. Also shows payout receipts.',
});
card('gateway', 'gateway', 'API gateway', 1, 3 * ROW, 'edge', {
  tech: 'HTTPS · JWT',
  description:
    'Terminates TLS, checks the customer or restaurant token, rate limits **20 req/s per user**, routes `/v1/*` to the order service.',
});

// ---------------------------------------------------------------- order service: use cases
card('c-courier', 'queue', 'Courier events consumer', 2, 0, 'uc', {
  tech: 'Kafka consumer',
  description:
    'Consumes `courier.events`. `CourierDelivered` enqueues a `PAYOUT` job; `PickedUp` only updates order state. Deduplicates on `eventId` (24 h window).',
});
card('uc-place', 'component', 'Place order', 2, ROW, 'uc', {
  tech: 'POST /v1/orders',
  description:
    'Validates basket against the menu snapshot, prices it, inserts the order as `PLACED` and the `CHARGE_PAYMENT` job **in one transaction**. Idempotent on the `Idempotency-Key` header.',
});
card('uc-cancel', 'component', 'Cancel order', 2, 2 * ROW, 'uc', {
  tech: 'POST /v1/orders/{id}/cancel',
  description:
    'Applies the refund policy. Refuses with `409` once the courier has picked up. Otherwise sets `CANCELLED` and enqueues `REFUND` with the policy amount.',
  rules: ['refund-policy'],
});
card('uc-accept', 'component', 'Restaurant accept', 2, 3 * ROW, 'uc', {
  tech: 'POST /v1/orders/{id}/accept',
  description:
    'Sets `ACCEPTED` with `prepMinutes`; enqueues `ASSIGN_COURIER` with `notBefore = now + prep − 8 min` so the courier arrives as the food is ready.',
});
card('uc-reject', 'component', 'Restaurant reject', 2, 4 * ROW, 'uc', {
  tech: 'POST /v1/orders/{id}/reject',
  description: 'Sets `REJECTED` with a reason code and enqueues a full `REFUND`.',
});
card('uc-track', 'component', 'Track order', 2, 5 * ROW, 'uc', {
  tech: 'GET /v1/orders/{id}',
  description: 'Read-only: order state, courier and ETA for the customer app (polled every 15 s).',
});
card('orders-db', 'database', 'orders', 3, 5 * ROW, 'orders', {
  tech: 'SQL table',
  description:
    'One row per order: `state`, `total_cents`, `restaurant_id`, `courier_id`, timestamps per state. Written by the use cases and listeners.',
});

// ---------------------------------------------------------------- order service: job queue
card('jobs', 'queue', 'jobs table', 3, 2 * ROW, 'g-jobs', {
  tech: 'SQL table',
  description:
    'Queue table: `type`, `order_id`, `payload`, `not_before`, `attempts`, `lease_until`. Max **5 attempts** with backoff 10 s × 2ⁿ, then `DEAD`.',
});
card('reaper', 'component', 'Lease reaper', 3, 3 * ROW, 'g-jobs', {
  tech: 'Cron · every 30 s',
  description: 'Clears `lease_until` on jobs whose worker died, so the pool claims them again.',
});
card('pool', 'service', 'Worker pool', 4, 2 * ROW, 'g-jobs', {
  tech: '16 goroutines',
  description:
    'Claims up to **20 due jobs** per poll (`FOR UPDATE SKIP LOCKED`, lease 30 s) and hands each to the worker for its `type`.',
});
card('w-assign', 'service', 'Assign courier worker', 5, 0, 'g-jobs', {
  description:
    'Gets pickup ETA from the Maps API (via the dispatch adapter), applies the courier priority rule, asks dispatch for a courier.',
  rules: ['courier-priority'],
});
card('w-charge', 'service', 'Charge payment worker', 5, ROW, 'g-jobs', {
  description: 'Captures the authorised amount. Declined card: job ends `FAILED`, order `PAYMENT_FAILED`.',
});
card('w-refund', 'service', 'Refund worker', 5, 2 * ROW, 'g-jobs', {
  description: 'Refunds the amount the job carries (full or partial, from the refund policy).',
});
card('w-payout', 'service', 'Payout worker', 5, 3 * ROW, 'g-jobs', {
  description: 'Pays the restaurant `subtotal − 18 % commission`, batched per restaurant per day.',
});

// ---------------------------------------------------------------- order service: outbound adapters
card('a-dispatch', 'component', 'Dispatch adapter', 6, 0, 'outbound', {
  tech: 'HTTP client · 10 s timeout',
  description: 'Wraps the courier dispatch API and the Maps ETA call; maps errors to retryable / final.',
});
card('a-pay', 'component', 'Payment adapter', 6, 2 * ROW, 'outbound', {
  tech: 'HTTP client · 5 s timeout',
  description:
    'Wraps captures, refunds and payouts. Sends the job id as `Idempotency-Key`, so a retried job never charges twice.',
});

// ---------------------------------------------------------------- order service: completion listeners
card('l-assign', 'component', 'Courier assigned listener', 7, 0, 'listeners', {
  description: 'Sets `COURIER_ASSIGNED` with courier id and ETA; writes `CourierAssigned` to the outbox.',
});
card('l-charge', 'component', 'Payment captured listener', 7, ROW, 'listeners', {
  description: 'Sets `PAID`; writes `OrderPaid` to the outbox so the restaurant tablet rings.',
});
card('l-refund', 'component', 'Refund done listener', 7, 2 * ROW, 'listeners', {
  description:
    'Writes `OrderRefunded` to the outbox. If a courier was already assigned, also releases it through the dispatch adapter.',
});
card('l-payout', 'component', 'Payout done listener', 7, 3 * ROW, 'listeners', {
  description: 'Records the payout in the ledger and writes `PayoutRecorded` to the outbox.',
});
card('ledger', 'database', 'payout_ledger', 7, 5 * ROW, 'orders', {
  tech: 'SQL table',
  description: 'Append-only: restaurant, order, gross, commission, net, provider payout id.',
});

// ---------------------------------------------------------------- order service: outbox
card('outbox', 'queue', 'outbox table', 8, 1.5 * ROW, 'g-outbox', {
  tech: 'SQL table',
  description: 'Events written in the same transaction as the state change: `id`, `key` (order id), `type`, `body`, `sent_at`.',
});
card('relay', 'service', 'Outbox relay', 9, 1.5 * ROW, 'g-outbox', {
  tech: 'Single instance · leader lock',
  description:
    'Polls unsent rows every **500 ms** (batch 100), publishes to `order.events` keyed by order id, then stamps `sent_at`. At-least-once.',
});

// ---------------------------------------------------------------- outside systems
card('payment', 'external', 'Payment provider', 5, TOP, 'partners', {
  tech: 'REST API',
  description: 'Card captures, refunds and restaurant payouts. Replies synchronously; p99 1.8 s.',
});
card('dispatch', 'external', 'Courier dispatch service', 6, TOP, 'partners', {
  tech: 'REST API + Kafka',
  description:
    'Matches a courier to a pickup and tracks the delivery; publishes `courier.events` (`PickedUp`, `CourierDelivered`).',
});
card('maps', 'external', 'Maps API', 7, TOP, 'partners', {
  tech: 'REST API',
  description: 'Route ETA between courier, restaurant and customer.',
});
card('notify', 'external', 'Notification service', 9, BOTTOM, 'messaging', {
  tech: 'Kafka consumer · push',
  description:
    'Consumes `order.events` and pushes to the restaurant tablet and the customer app (order paid, courier assigned, refunded, payout).',
});

// ---------------------------------------------------------------- connectors: entry
link('cust-gw', 'cust-app', 'gateway', 'http', 'HTTPS /v1/orders');
link('rest-gw', 'rest-app', 'gateway', 'http', 'HTTPS /v1/restaurant');
link('gw-place', 'gateway', 'uc-place', 'http', 'POST /orders');
link('gw-cancel', 'gateway', 'uc-cancel', 'http', 'POST /orders/{id}/cancel');
link('gw-accept', 'gateway', 'uc-accept', 'http', 'POST /orders/{id}/accept');
link('gw-reject', 'gateway', 'uc-reject', 'http', 'POST /orders/{id}/reject');
link('gw-track', 'gateway', 'uc-track', 'http', 'GET /orders/{id}');
link('dispatch-courier', 'dispatch', 'c-courier', 'event', 'courier.events · Kafka');

// ---------------------------------------------------------------- connectors: job queue
link('place-jobs', 'uc-place', 'jobs', 'sql', 'enqueue CHARGE_PAYMENT');
link('cancel-jobs', 'uc-cancel', 'jobs', 'sql', 'enqueue REFUND');
link('accept-jobs', 'uc-accept', 'jobs', 'sql', 'enqueue ASSIGN_COURIER');
link('reject-jobs', 'uc-reject', 'jobs', 'sql', 'enqueue REFUND (full)');
link('courier-jobs', 'c-courier', 'jobs', 'sql', 'enqueue PAYOUT');
link('jobs-pool', 'jobs', 'pool', 'sql', 'claim · SKIP LOCKED');
link('pool-assign', 'pool', 'w-assign', 'other', 'ASSIGN_COURIER');
link('pool-charge', 'pool', 'w-charge', 'other', 'CHARGE_PAYMENT');
link('pool-refund', 'pool', 'w-refund', 'other', 'REFUND');
link('pool-payout', 'pool', 'w-payout', 'other', 'PAYOUT');

// ---------------------------------------------------------------- connectors: outbound
link('assign-adapter', 'w-assign', 'a-dispatch', 'other', 'request courier');
link('charge-adapter', 'w-charge', 'a-pay', 'other', 'capture');
link('refund-adapter', 'w-refund', 'a-pay', 'other', 'refund');
link('payout-adapter', 'w-payout', 'a-pay', 'other', 'payout');
link('pay-provider', 'a-pay', 'payment', 'http', 'capture · refund · payout');
link('provider-pay', 'payment', 'a-pay', 'http', 'provider result');
link('adapter-dispatch', 'a-dispatch', 'dispatch', 'http', 'POST · DELETE /assignments');
link('dispatch-adapter', 'dispatch', 'a-dispatch', 'http', 'assignment result');

// ---------------------------------------------------------------- connectors: completion
link('pay-l-charge', 'a-pay', 'l-charge', 'other', 'PaymentCaptured');
link('pay-l-refund', 'a-pay', 'l-refund', 'other', 'RefundSettled');
link('pay-l-payout', 'a-pay', 'l-payout', 'other', 'PayoutSettled');
link('disp-l-assign', 'a-dispatch', 'l-assign', 'other', 'CourierAssigned');
link('refund-release', 'l-refund', 'a-dispatch', 'other', 'release courier');
link('l-assign-outbox', 'l-assign', 'outbox', 'sql', 'insert CourierAssigned');
link('l-charge-outbox', 'l-charge', 'outbox', 'sql', 'insert OrderPaid');
link('l-refund-outbox', 'l-refund', 'outbox', 'sql', 'insert OrderRefunded');
link('l-payout-outbox', 'l-payout', 'outbox', 'sql', 'insert PayoutRecorded');
link('outbox-relay', 'outbox', 'relay', 'sql', 'poll unsent · 500 ms');
link('relay-notify', 'relay', 'notify', 'event', 'order.events · Kafka');
link('notify-rest', 'notify', 'rest-app', 'other', 'push to tablet');

// ---------------------------------------------------------------- connectors: side reads / writes
side('reaper-jobs', 'reaper', 'jobs', 'sql', 'reset expired leases');
side('dispatch-maps', 'a-dispatch', 'maps', 'http', 'GET /eta');
side('track-orders', 'uc-track', 'orders-db', 'sql', 'SELECT order');
side('payout-ledger', 'l-payout', 'ledger', 'sql', 'insert payout entry');

// ---------------------------------------------------------------- notes
const stickies = [
  {
    id: 'n-lease',
    text: '**Caveat · at-least-once.** A job whose 30 s lease expires is claimed again, so a worker can run twice. Only the payment adapter is idempotent today; is a double courier request possible?',
    color: 'amber',
    position: { x: C[3], y: TOP },
    size: { width: 240, height: 120 },
  },
  {
    id: 'n-eta',
    text: '**Open question · ETA freshness.** The ETA is fetched once per assignment. Re-quote when the courier is more than 5 min late?',
    color: 'blue',
    position: { x: C[8], y: TOP },
    size: { width: 240, height: 120 },
  },
  {
    id: 'n-relay',
    text: '**Open question · relay throughput.** One relay instance (leader lock) keeps per-order ordering. Does it hold past 200 orders/s at dinner peak?',
    color: 'amber',
    position: { x: C[10], y: 1.5 * ROW },
    size: { width: 240, height: 120 },
  },
];
link('n-lease-pool', 'n-lease', 'pool', 'other', undefined, { style: dashed });
link('n-eta-maps', 'n-eta', 'maps', 'other', undefined, { style: dashed });
link('n-relay-relay', 'n-relay', 'relay', 'other', undefined, { style: dashed });

// ---------------------------------------------------------------- groups
const groups = [
  { id: 'apps', title: 'Apps', style: { fill: 'cyan' } },
  { id: 'edge', title: 'Edge', style: { fill: 'amber' } },
  { id: 'orders', title: 'Order service', style: { fill: 'blue' } },
  { id: 'uc', title: 'Use cases and consumers', parent: 'orders', style: { fill: 'indigo' } },
  { id: 'g-jobs', title: 'Job queue and workers', parent: 'orders', style: { fill: 'violet' } },
  { id: 'outbound', title: 'Outbound adapters', parent: 'orders', style: { fill: 'teal' } },
  { id: 'listeners', title: 'Completion listeners', parent: 'orders', style: { fill: 'green' } },
  { id: 'g-outbox', title: 'Transactional outbox', parent: 'orders', style: { fill: 'orange' } },
  { id: 'partners', title: 'Partner APIs', style: { fill: 'slate' } },
  { id: 'messaging', title: 'Messaging', style: { fill: 'pink' } },
];

// ---------------------------------------------------------------- rules
const rules = {
  'refund-policy': {
    title: 'Refund policy',
    description:
      'How much of the order total a cancelling customer gets back, by order state and minutes since the order was placed. First matching row wins.',
    hitPolicy: 'first',
    inputs: [
      { id: 'state', label: 'Order state' },
      { id: 'minutes', label: 'Minutes since order' },
    ],
    outputs: [
      { id: 'refund', label: 'Refund to customer' },
      { id: 'restaurant', label: 'Restaurant compensated' },
    ],
    rows: [
      { id: 'placed', when: ['PLACED, PAID', 'any'], then: ['100 %', 'No'] },
      { id: 'grace', when: ['ACCEPTED, COURIER_ASSIGNED', '<= 5'], then: ['100 %', 'No'] },
      { id: 'cooking', when: ['ACCEPTED', '> 5'], then: ['50 %', '50 % of subtotal'] },
      { id: 'assigned', when: ['COURIER_ASSIGNED', '> 5'], then: ['25 %', '75 % of subtotal'] },
      { id: 'picked', when: ['PICKED_UP, DELIVERED', 'any'], then: ['Refused (409)', 'Not applicable'] },
      { id: 'other', when: ['any', 'any'], then: ['Refused (409)', 'Not applicable'] },
    ],
  },
  'courier-priority': {
    title: 'Courier assignment priority',
    description:
      'Priority and search radius the assign worker sends to dispatch. First matching row wins; dispatch serves P1 before P2 within a zone.',
    hitPolicy: 'first',
    inputs: [
      { id: 'prepLeft', label: 'Prep minutes left' },
      { id: 'tier', label: 'Customer tier' },
      { id: 'total', label: 'Order total (EUR)' },
    ],
    outputs: [
      { id: 'priority', label: 'Priority' },
      { id: 'radius', label: 'Search radius (km)' },
      { id: 'batch', label: 'Batch with other orders' },
    ],
    rows: [
      { id: 'ready', when: ['<= 5', 'any', 'any'], then: ['P1', '3', 'No'] },
      { id: 'plus', when: ['any', 'plus', 'any'], then: ['P1', '4', 'No'] },
      { id: 'large', when: ['any', 'any', '>= 80'], then: ['P2', '5', 'No'] },
      { id: 'soon', when: ['<= 20', 'any', 'any'], then: ['P3', '5', 'Yes'] },
      { id: 'later', when: ['any', 'any', 'any'], then: ['P4', '7', 'Yes'] },
    ],
  },
};

// ---------------------------------------------------------------- flows
const features = [
  { id: 'ordering', title: 'Ordering' },
  { id: 'fulfilment', title: 'Fulfilment' },
];

const flows = [
  {
    id: 'place-order',
    title: 'Place order',
    feature: 'ordering',
    trigger: 'Customer taps Pay in the customer app',
    outcome:
      'Payment captured, order `PAID`, the restaurant tablet rings. No courier yet: that waits for the restaurant to accept.',
    steps: [
      {
        id: 'submit',
        edge: 'cust-gw',
        title: 'Submit basket',
        sla: '< 400 ms to 201',
        payload:
          '{ "restaurantId": "r_204", "items": [{ "sku": "m_margherita", "qty": 2 }, { "sku": "m_tiramisu", "qty": 1 }], "address": { "lat": 52.37, "lng": 4.89 }, "paymentMethodId": "pm_7Hq2" }',
      },
      { id: 'route', edge: 'gw-place', title: 'Route to Place order', description: 'Gateway checks the customer token and the `Idempotency-Key` header.' },
      {
        id: 'enqueue',
        edge: 'place-jobs',
        title: 'Enqueue CHARGE_PAYMENT',
        description: 'Same transaction inserts the order as `PLACED` (orders table). The customer gets `201` with the order id here.',
        payload: '{ "type": "CHARGE_PAYMENT", "orderId": "o_8F2K", "amountCents": 3150, "currency": "EUR", "notBefore": "now" }',
      },
      { id: 'claim', edge: 'jobs-pool', title: 'Claim job', description: 'Lease 30 s; `attempts` + 1.' },
      { id: 'dispatch', edge: 'pool-charge', title: 'Run charge worker' },
      { id: 'capture', edge: 'charge-adapter', title: 'Request capture' },
      {
        id: 'provider',
        edge: 'pay-provider',
        title: 'POST /captures',
        sla: '< 2 s',
        payload: '{ "paymentMethodId": "pm_7Hq2", "amount": 3150, "currency": "EUR", "reference": "o_8F2K", "idempotencyKey": "job_51902" }',
      },
      { id: 'captured', edge: 'provider-pay', title: 'Capture confirmed', description: 'A decline ends the job `FAILED`; a timeout retries with backoff.' },
      { id: 'done', edge: 'pay-l-charge', title: 'Job done: PaymentCaptured' },
      { id: 'paid', edge: 'l-charge-outbox', title: 'Write OrderPaid', description: 'Same transaction sets the order `PAID`.' },
      { id: 'relay', edge: 'outbox-relay', title: 'Relay picks event' },
      {
        id: 'publish',
        edge: 'relay-notify',
        title: 'Publish OrderPaid',
        payload: '{ "eventId": "ev_3301", "type": "OrderPaid", "orderId": "o_8F2K", "restaurantId": "r_204", "items": 3, "totalCents": 3150 }',
      },
      { id: 'ring', edge: 'notify-rest', title: 'Ring restaurant tablet', sla: '< 5 s from capture' },
    ],
  },
  {
    id: 'accept-assign',
    title: 'Restaurant accepts, courier assigned',
    feature: 'fulfilment',
    trigger: 'Restaurant staff tap Accept and enter prep minutes',
    outcome: 'Order `COURIER_ASSIGNED`; the customer sees the courier and the ETA. The restaurant can no longer reject.',
    steps: [
      {
        id: 'tap',
        edge: 'rest-gw',
        title: 'Tap Accept',
        payload: '{ "orderId": "o_8F2K", "prepMinutes": 15 }',
      },
      { id: 'route', edge: 'gw-accept', title: 'Route to Restaurant accept' },
      {
        id: 'enqueue',
        edge: 'accept-jobs',
        title: 'Enqueue ASSIGN_COURIER',
        condition: 'order state = PAID',
        description: 'Sets `ACCEPTED`; the job is due at `now + prep − 8 min` (here in 7 min).',
      },
      { id: 'claim', edge: 'jobs-pool', title: 'Claim due job' },
      { id: 'dispatch', edge: 'pool-assign', title: 'Run assign worker' },
      {
        id: 'prioritise',
        edge: 'assign-adapter',
        title: 'Pick priority, request courier',
        description: 'The worker first asks the Maps API for pickup ETA (dashed connector), then applies the courier priority rule.',
        rules: ['courier-priority'],
        ruleInputs: { 'courier-priority': { prepLeft: '7', tier: 'standard', total: '31.50' } },
      },
      {
        id: 'request',
        edge: 'adapter-dispatch',
        title: 'POST /assignments',
        sla: '< 10 s',
        payload:
          '{ "orderId": "o_8F2K", "pickup": { "lat": 52.36, "lng": 4.88 }, "dropoff": { "lat": 52.37, "lng": 4.89 }, "readyAt": "19:42", "priority": "P3", "radiusKm": 5, "batchable": true }',
      },
      { id: 'assigned', edge: 'dispatch-adapter', title: 'Courier assigned', description: 'No courier in radius: `404`, the job retries with radius + 2 km.' },
      { id: 'done', edge: 'disp-l-assign', title: 'Job done: CourierAssigned' },
      { id: 'record', edge: 'l-assign-outbox', title: 'Write CourierAssigned', description: 'Same transaction sets `COURIER_ASSIGNED`, courier id and ETA.' },
      { id: 'relay', edge: 'outbox-relay', title: 'Relay picks event' },
      { id: 'publish', edge: 'relay-notify', title: 'Publish CourierAssigned', description: 'Notification service pushes courier name and ETA to the customer app.' },
    ],
  },
  {
    id: 'delivered-payout',
    title: 'Courier delivered, restaurant paid',
    feature: 'fulfilment',
    trigger: 'Courier marks the order delivered in the dispatch service',
    outcome: 'Order `DELIVERED`, payout settled and recorded in the ledger, receipt on the restaurant tablet.',
    steps: [
      {
        id: 'event',
        edge: 'dispatch-courier',
        title: 'Consume CourierDelivered',
        payload: '{ "eventId": "cv_99120", "type": "CourierDelivered", "orderId": "o_8F2K", "courierId": "c_311", "at": "2026-10-06T19:58:12Z" }',
      },
      { id: 'enqueue', edge: 'courier-jobs', title: 'Enqueue PAYOUT', description: 'Sets the order `DELIVERED`. Duplicate events are dropped on `eventId`.' },
      { id: 'claim', edge: 'jobs-pool', title: 'Claim job' },
      { id: 'dispatch', edge: 'pool-payout', title: 'Run payout worker' },
      { id: 'request', edge: 'payout-adapter', title: 'Request payout', description: 'Net = subtotal 28.00 − 18 % commission = **22.96 EUR**.' },
      {
        id: 'provider',
        edge: 'pay-provider',
        title: 'POST /payouts',
        payload: '{ "destination": "acct_r_204", "amount": 2296, "currency": "EUR", "reference": "o_8F2K", "idempotencyKey": "job_51977" }',
      },
      { id: 'settled', edge: 'provider-pay', title: 'Payout accepted' },
      { id: 'done', edge: 'pay-l-payout', title: 'Job done: PayoutSettled' },
      { id: 'record', edge: 'l-payout-outbox', title: 'Write PayoutRecorded', description: 'Same transaction appends to `payout_ledger` (dashed connector).' },
      { id: 'relay', edge: 'outbox-relay', title: 'Relay picks event' },
      { id: 'publish', edge: 'relay-notify', title: 'Publish PayoutRecorded' },
      { id: 'receipt', edge: 'notify-rest', title: 'Show payout receipt' },
    ],
  },
  {
    id: 'cancel-refund',
    title: 'Customer cancels, refund',
    feature: 'ordering',
    trigger: 'Customer taps Cancel order',
    outcome:
      'Order `CANCELLED`, refund settled with the provider. Before accept the restaurant is told the order is withdrawn; after accept the courier is released too. After pickup nothing happens: the cancel is refused with `409`.',
    branches: [
      { id: 'before', label: 'Before restaurant accepted', condition: 'state in PLACED, PAID' },
      { id: 'after', label: 'After restaurant accepted', condition: 'state in ACCEPTED, COURIER_ASSIGNED' },
    ],
    steps: [
      { id: 'tap', edge: 'cust-gw', title: 'Tap Cancel', payload: '{ "orderId": "o_8F2K", "reason": "CHANGED_MIND" }' },
      { id: 'route', edge: 'gw-cancel', title: 'Route to Cancel order' },
      {
        id: 'enqueue',
        edge: 'cancel-jobs',
        title: 'Apply policy, enqueue REFUND',
        description: 'Refund amount comes from the refund policy. `PICKED_UP` or later: `409`, no job, flow stops.',
        rules: ['refund-policy'],
        ruleInputs: { 'refund-policy': { state: 'ACCEPTED', minutes: '8' } },
        payload: '{ "type": "REFUND", "orderId": "o_8F2K", "amountCents": 1575, "reason": "CUSTOMER_CANCEL" }',
      },
      { id: 'claim', edge: 'jobs-pool', title: 'Claim job' },
      { id: 'dispatch', edge: 'pool-refund', title: 'Run refund worker' },
      { id: 'request', edge: 'refund-adapter', title: 'Request refund' },
      { id: 'provider', edge: 'pay-provider', title: 'POST /refunds', payload: '{ "captureId": "cap_77A1", "amount": 1575, "idempotencyKey": "job_52004" }' },
      { id: 'settled', edge: 'provider-pay', title: 'Refund accepted' },
      { id: 'done', edge: 'pay-l-refund', title: 'Job done: RefundSettled' },
      { id: 'b-record', edge: 'l-refund-outbox', title: 'Write OrderRefunded', branch: 'before' },
      { id: 'b-relay', edge: 'outbox-relay', title: 'Relay picks event', branch: 'before' },
      { id: 'b-publish', edge: 'relay-notify', title: 'Publish OrderRefunded', branch: 'before' },
      { id: 'b-tell', edge: 'notify-rest', title: 'Withdraw order on tablet', branch: 'before' },
      {
        id: 'a-release',
        edge: 'refund-release',
        title: 'Release courier',
        branch: 'after',
        description: 'Also writes `OrderRefunded` to the outbox, so customer and restaurant are told.',
        condition: 'courier assigned',
      },
      { id: 'a-delete', edge: 'adapter-dispatch', title: 'DELETE /assignments/{id}', branch: 'after' },
    ],
  },
];

// ---------------------------------------------------------------- deck
const deck = {
  $schema: 'https://sododeck.com/schema/v1.json',
  version: 1,
  name: 'Food delivery order lifecycle',
  description:
    'A fictional food delivery platform: how an order is placed, paid, accepted, delivered, paid out and cancelled. The order service hands work over through a job queue table and a transactional outbox; Kafka topics are connector labels.',
  nodes,
  groups,
  edges,
  views: [],
  features,
  flows,
  rules,
  stickies,
};

const out = join(dirname(fileURLToPath(import.meta.url)), 'food-delivery.draft.sododeck');
writeFileSync(out, JSON.stringify(deck, null, 2) + '\n');
console.log(`wrote ${out}: ${nodes.length} cards, ${edges.length} connectors, ${flows.length} flows`);
