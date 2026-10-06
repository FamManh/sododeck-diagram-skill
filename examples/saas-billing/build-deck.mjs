// build-deck.mjs: generates saas-billing.draft.sododeck next to this script.
//   node build-deck.mjs
// Positions come from the column and row grid below; move a column in one edit, then rerun
// validate and lint. Fictional system: no real company or product is named.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Column x and row y (top-left of each card, 184 x 96).
const X = { c0: 0, c1: 300, uc1: 700, uc2: 1000, wh: 1350, wk1: 1700, wk2: 2050, sch: 2400, ls4: 2750, out: 3150 };
const Y = { top: -400, r0: 0, r1: 150, r2: 300, r3: 450, r4: 600, r5: 750, r6: 900, bottom: 1200 };

const nodes = [];
const edges = [];
const card = (id, type, title, x, y, group, extra = {}) =>
  nodes.push({ id, type, title, ...extra, ...(group ? { group } : {}), position: { x, y } });
const link = (id, from, to, protocol, label, extra = {}) =>
  edges.push({ id, from, to, protocol, label, ...extra });
const side = (id, from, to, protocol, label) =>
  link(id, from, to, protocol, label, { style: { dash: 'dashed', width: 1.5 } });

// ── Customer side and edge ──────────────────────────────────────────────────────────────
card('web', 'client', 'Web app', X.c0, Y.r2, null, {
  tech: 'React SPA',
  description: 'Signup form, plan picker and billing settings. Checkout opens the payment provider’s hosted card form.',
});
card('gateway', 'gateway', 'API gateway', X.c1, Y.r2, 'edge', {
  tech: 'Envoy',
  description:
    'Terminates TLS, verifies the session token, and enforces plan limits by reading the entitlement cache on every write request (`GET ent:{accountId}`, p99 < 2 ms).',
});

// ── Account service ─────────────────────────────────────────────────────────────────────
card('account-api', 'service', 'Account API', X.c1, Y.r4, 'account', {
  tech: 'Go · gRPC + REST',
  description: 'Owns accounts, members and invitations. Creates the login with the identity provider, then asks Billing to start a trial.',
});
card('accounts-db', 'database', 'Accounts DB', X.c1, Y.r5, 'account', {
  tech: 'PostgreSQL 16',
  description: 'Tables `accounts`, `members`, `invitations`.',
});
card('idp', 'external', 'Identity provider', X.c0, Y.r4, null, {
  tech: 'OIDC',
  description: 'Hosts logins and email verification. Returns a stable `sub` the account is keyed by.',
});

// ── Billing service: API use cases ──────────────────────────────────────────────────────
card('uc-convert', 'component', 'Convert to paid', X.uc1, Y.r0, 'uc', {
  tech: 'Kotlin · Spring',
  description:
    'Creates an invoice for the first paid period and a checkout session at the payment provider. The card form may ask for 3-D Secure, so the result only arrives by webhook.',
});
card('uc-upgrade', 'component', 'Change plan', X.uc2, Y.r0, 'uc', {
  tech: 'Kotlin · Spring',
  description:
    'Upgrades charge the prorated difference now (`proration_behavior = always_invoice`). Downgrades take effect at the next renewal and charge nothing.',
});
card('uc-trial', 'component', 'Start trial', X.uc1, Y.r4, 'uc', {
  tech: 'Kotlin · Spring',
  description: 'Inserts a `trialing` subscription on the Trial plan, 14 days, no card required. Idempotent on `accountId`.',
});

// ── Billing service: webhook intake ─────────────────────────────────────────────────────
card('wh-receiver', 'component', 'Webhook receiver', X.wh, Y.r0, 'webhooks', {
  tech: 'Kotlin · Spring',
  description:
    'Checks the `Signature` header (HMAC-SHA256, 5 min tolerance), writes the raw event to the inbox and answers `200` within 100 ms. No business logic here.',
});
card('inbox', 'queue', 'Webhook inbox', X.wh, Y.r1, 'webhooks', {
  tech: 'PostgreSQL table',
  description:
    'Table `webhook_inbox (event_id PK, type, payload, received_at, processed_at)`. `INSERT … ON CONFLICT (event_id) DO NOTHING` drops provider retries and duplicates.',
});

// ── Billing service: workers ────────────────────────────────────────────────────────────
card('w-events', 'service', 'Event processor', X.wk1, Y.r1, 'workers', {
  tech: 'Kotlin worker',
  description:
    'Polls the inbox with `FOR UPDATE SKIP LOCKED`, batch 50, every 1 s. Maps provider events to domain events and sets `processed_at`. Events for invoices already settled are skipped.',
});
card('w-charge', 'service', 'Charge worker', X.wk2, Y.r0, 'workers', {
  tech: 'Kotlin worker',
  description:
    'Charges the saved card off-session for renewals and dunning retries. Reads the result from the synchronous API reply; the matching webhook is later skipped by the inbox.',
});

// ── Billing service: scheduler ──────────────────────────────────────────────────────────
card('sched-renew', 'task', 'Renewal scheduler', X.sch, Y.r0, 'scheduler', {
  tech: 'Cron · every 15 min',
  description: 'Selects subscriptions with `current_period_end <= now()` and status `active`, and enqueues one RENEW job each (unique on `subscriptionId + period`).',
});
card('sched-dunning', 'task', 'Dunning scheduler', X.sch, Y.r1, 'scheduler', {
  tech: 'Delayed jobs table',
  description: 'Holds one pending attempt per past-due invoice (`dunning_attempts`). Fires a RETRY job when `run_at` is reached; see the Dunning schedule rule.',
  rules: ['dunning-schedule'],
});

// ── Billing service: listeners ──────────────────────────────────────────────────────────
card('l-paid', 'queue', 'Payment succeeded', X.wk1, Y.r3, 'listeners', {
  tech: 'Kafka consumer',
  description: 'Marks the invoice paid, sets the subscription `active` with the new period, clears any pending dunning attempt, publishes `SubscriptionChanged`.',
});
card('l-failed', 'queue', 'Payment failed', X.sch, Y.r3, 'listeners', {
  tech: 'Kafka consumer',
  description: 'Sets the subscription `past_due` and books the next attempt from the Dunning schedule. After the last attempt it cancels the subscription.',
  rules: ['dunning-schedule'],
});
card('l-entitle', 'queue', 'Entitlement sync', X.wk2, Y.r4, 'listeners', {
  tech: 'Kafka consumer',
  description: 'Recomputes limits from the plan and status, writes them to the entitlement cache, publishes `EntitlementsChanged`.',
  rules: ['plan-entitlements'],
});
card('l-notify', 'queue', 'Customer notifier', X.ls4, Y.r4, 'listeners', {
  tech: 'Kafka consumer',
  description: 'Picks the email template per event (welcome, receipt, plan changed, payment failed, cancelled) and sends it through the email service. Dedupes on `eventId` for 24 h.',
});

// ── Billing service: stores ─────────────────────────────────────────────────────────────
card('subs-db', 'database', 'Subscriptions DB', X.uc1, Y.r6, 'stores', {
  tech: 'PostgreSQL 16',
  description: 'Tables `subscriptions`, `dunning_attempts`, `webhook_inbox`. Status: `trialing → active → past_due → cancelled`.',
});
card('plan-catalog', 'database', 'Plan catalog', X.uc2, Y.r6, 'stores', {
  tech: 'PostgreSQL 16',
  description: 'Plans, monthly prices in cents and the provider price ids. Read for proration previews.',
});
card('invoice-store', 'database', 'Invoice store', X.wk1, Y.r6, 'stores', {
  tech: 'PostgreSQL 16 + object storage',
  description: 'Invoice rows (`draft → open → paid | void`) and rendered PDFs. Amounts in cents, currency per account.',
});
card('ent-cache', 'database', 'Entitlement cache', X.wk2, Y.r6, 'stores', {
  tech: 'Redis',
  description: 'Key `ent:{accountId}` → `{ plan, status, seats, projects, support }`. No TTL; rewritten on every `SubscriptionChanged`.',
});

// ── Outside systems ─────────────────────────────────────────────────────────────────────
card('provider', 'external', 'Payment provider', X.wh, Y.top, null, {
  tech: 'REST + webhooks',
  description: 'Stores cards, runs checkout sessions and charges. Sends `invoice.paid` / `invoice.payment_failed` webhooks, retried for 3 days.',
});
card('email', 'external', 'Email service', X.out, Y.r4, null, {
  tech: 'HTTP API',
  description: 'Transactional email; templates live there and are addressed by id.',
});
card('warehouse', 'external', 'Analytics warehouse', X.wk1, Y.bottom, null, {
  tech: 'Columnar warehouse',
  description: 'MRR, churn and dunning recovery dashboards, loaded nightly.',
});

// ── Hand-offs (solid) ───────────────────────────────────────────────────────────────────
link('web-gateway', 'web', 'gateway', 'http', 'HTTPS /api/*');
link('gw-account', 'gateway', 'account-api', 'http', 'POST /signup');
link('account-idp', 'account-api', 'idp', 'http', 'create user');
link('idp-account', 'idp', 'account-api', 'http', 'sub + verify link');
link('account-trial', 'account-api', 'uc-trial', 'grpc', 'StartTrial');
link('gw-convert', 'gateway', 'uc-convert', 'http', 'POST /subscriptions/convert');
link('gw-upgrade', 'gateway', 'uc-upgrade', 'http', 'PATCH /subscriptions/plan');
link('convert-provider', 'uc-convert', 'provider', 'http', 'create checkout session');
link('upgrade-provider', 'uc-upgrade', 'provider', 'http', 'update subscription');
link('provider-wh', 'provider', 'wh-receiver', 'http', 'invoice.* webhooks');
link('wh-inbox', 'wh-receiver', 'inbox', 'sql', 'insert, dedupe');
link('inbox-events', 'inbox', 'w-events', 'sql', 'poll unprocessed');
link('events-paid', 'w-events', 'l-paid', 'event', 'PaymentSucceeded · Kafka');
link('renew-charge', 'sched-renew', 'w-charge', 'sql', 'RENEW job');
link('charge-provider', 'w-charge', 'provider', 'http', 'charge saved card');
link('provider-charge', 'provider', 'w-charge', 'http', 'charge result');
link('charge-failed', 'w-charge', 'l-failed', 'event', 'PaymentFailed · Kafka');
link('charge-paid', 'w-charge', 'l-paid', 'event', 'PaymentSucceeded · Kafka');
link('failed-dunning', 'l-failed', 'sched-dunning', 'sql', 'book next attempt');
link('dunning-charge', 'sched-dunning', 'w-charge', 'sql', 'RETRY job');
link('trial-entitle', 'uc-trial', 'l-entitle', 'event', 'SubscriptionChanged · Kafka');
link('paid-entitle', 'l-paid', 'l-entitle', 'event', 'SubscriptionChanged · Kafka');
link('failed-entitle', 'l-failed', 'l-entitle', 'event', 'SubscriptionChanged · Kafka');
link('entitle-notify', 'l-entitle', 'l-notify', 'event', 'EntitlementsChanged · Kafka');
link('notify-email', 'l-notify', 'email', 'http', 'send template');

// ── Side reads and writes (dashed) ──────────────────────────────────────────────────────
side('account-db', 'account-api', 'accounts-db', 'sql', 'insert account');
side('gw-cache', 'gateway', 'ent-cache', 'other', 'read limits');
side('trial-subs', 'uc-trial', 'subs-db', 'sql', 'insert trialing');
side('upgrade-catalog', 'uc-upgrade', 'plan-catalog', 'sql', 'read prices');
side('paid-invoice', 'l-paid', 'invoice-store', 'sql', 'mark paid');
side('entitle-cache', 'l-entitle', 'ent-cache', 'other', 'SET ent:{accountId}');
side('dunning-notify', 'sched-dunning', 'l-notify', 'event', 'DunningEmail · Kafka');
side('invoice-warehouse', 'invoice-store', 'warehouse', 'other', 'nightly export');

// ── Notes, tied to their card ───────────────────────────────────────────────────────────
const stickies = [
  {
    id: 'q-convert',
    text: '**Open question · double convert.** The checkout session call has no idempotency key, so two quick clicks open two sessions. Key it on `invoiceId`?',
    color: 'amber',
    position: { x: 650, y: -400 },
    size: { width: 240, height: 120 },
  },
  {
    id: 'gap-card-update',
    text: '**Gap · card update during dunning.** A customer who adds a new card waits for the next booked attempt (up to 7 days); nothing retries at once.',
    color: 'amber',
    position: { x: 3150, y: 100 },
    size: { width: 240, height: 120 },
  },
  {
    id: 'gap-cold-cache',
    text: '**Gap · cold cache.** If `ent:{accountId}` is missing, the gateway fails open and allows the request. Nothing rebuilds the key until the next `SubscriptionChanged`.',
    color: 'amber',
    position: { x: 2050, y: 1200 },
    size: { width: 240, height: 120 },
  },
];
const noteLink = (id, from, to) =>
  edges.push({ id, from, to, protocol: 'other', style: { dash: 'dashed', width: 1.5 } });
noteLink('q-convert-link', 'q-convert', 'uc-convert');
noteLink('gap-card-link', 'gap-card-update', 'sched-dunning');
noteLink('gap-cache-link', 'gap-cold-cache', 'ent-cache');

// ── Groups ──────────────────────────────────────────────────────────────────────────────
const groups = [
  { id: 'edge', title: 'Edge', style: { fill: 'slate' } },
  { id: 'account', title: 'Account service', style: { fill: 'blue' } },
  { id: 'billing', title: 'Billing service', style: { fill: 'violet' } },
  { id: 'uc', title: 'API use cases', parent: 'billing', style: { fill: 'indigo' } },
  { id: 'webhooks', title: 'Webhook intake', parent: 'billing', style: { fill: 'amber' } },
  { id: 'workers', title: 'Workers', parent: 'billing', style: { fill: 'orange' } },
  { id: 'scheduler', title: 'Scheduler', parent: 'billing', style: { fill: 'teal' } },
  { id: 'listeners', title: 'Listeners', parent: 'billing', style: { fill: 'green' } },
  { id: 'stores', title: 'Stores', parent: 'billing', style: { fill: 'cyan' } },
];

// ── Rules ───────────────────────────────────────────────────────────────────────────────
const rules = {
  'dunning-schedule': {
    title: 'Dunning schedule',
    description:
      'What happens after a failed renewal charge, by the number of the attempt that just failed. Attempt 1 is the renewal itself; the subscription stays usable while `past_due`.',
    hitPolicy: 'first',
    inputs: [{ id: 'attempt', label: 'Failed attempt #' }],
    outputs: [
      { id: 'wait', label: 'Next attempt in' },
      { id: 'template', label: 'Email template' },
      { id: 'action', label: 'Action' },
    ],
    rows: [
      { id: 'a1', when: ['1'], then: ['3 days', 'payment-failed-1', 'Set past_due, book retry'] },
      { id: 'a2', when: ['2'], then: ['5 days', 'payment-failed-2', 'Book retry'] },
      { id: 'a3', when: ['3'], then: ['7 days', 'final-notice', 'Book last retry, show banner'] },
      { id: 'a4', when: ['any'], then: ['—', 'subscription-cancelled', 'Cancel, downgrade to Free'] },
    ],
  },
  'plan-entitlements': {
    title: 'Plan entitlements',
    description: 'Limits written to the entitlement cache for each plan. A cancelled subscription falls to Free.',
    hitPolicy: 'first',
    inputs: [{ id: 'plan', label: 'Plan' }],
    outputs: [
      { id: 'seats', label: 'Seats' },
      { id: 'projects', label: 'Projects' },
      { id: 'support', label: 'Support' },
    ],
    rows: [
      { id: 'trial', when: ['trial'], then: ['5', '10', 'Email, 2 business days'] },
      { id: 'starter', when: ['starter'], then: ['3', '5', 'Email, 2 business days'] },
      { id: 'pro', when: ['pro'], then: ['20', 'Unlimited', 'Email, 1 business day'] },
      { id: 'business', when: ['business'], then: ['100', 'Unlimited', 'Chat, 4 h response'] },
      { id: 'free', when: ['any'], then: ['1', '2', 'Community forum'] },
    ],
  },
};

// ── Flows ───────────────────────────────────────────────────────────────────────────────
const features = [
  { id: 'onboarding', title: 'Onboarding' },
  { id: 'payments', title: 'Payments' },
  { id: 'recovery', title: 'Recovery' },
];

const tail = (prefix, emailTitle, emailPayload) => [
  {
    id: `${prefix}-notify`,
    edge: 'entitle-notify',
    title: 'Publish EntitlementsChanged',
    description: 'Also `SET ent:{accountId}` in the entitlement cache (dashed): the gateway enforces the new limits on the next request.',
  },
  {
    id: `${prefix}-email`,
    edge: 'notify-email',
    title: emailTitle,
    sla: '< 1 min',
    ...(emailPayload ? { payload: emailPayload } : {}),
  },
];

const flows = [
  {
    id: 'signup-trial',
    title: 'Sign up with trial',
    feature: 'onboarding',
    trigger: 'Visitor submits the signup form',
    outcome: 'Account exists, a 14-day Trial is running with Trial limits, welcome email sent. No card on file, no invoice.',
    steps: [
      { id: 'su-submit', edge: 'web-gateway', title: 'Submit signup', payload: '{ "email": "ada@example.com", "company": "Northwind Labs", "plan": "trial" }' },
      { id: 'su-route', edge: 'gw-account', title: 'Route to Account API', sla: '< 800 ms end to end' },
      { id: 'su-idp', edge: 'account-idp', title: 'Create login', description: 'Fails with `409` if the email already has a login; the form shows "Sign in instead".' },
      { id: 'su-idp-ok', edge: 'idp-account', title: 'Login created', description: 'Account API inserts the account and owner member (dashed connector to Accounts DB).' },
      { id: 'su-trial', edge: 'account-trial', title: 'Start trial', payload: '{ "accountId": "acc_7Q2", "plan": "trial", "trialDays": 14 }' },
      {
        id: 'su-entitle',
        edge: 'trial-entitle',
        title: 'Publish SubscriptionChanged',
        description: 'Start trial inserts the `trialing` subscription first (dashed connector to Subscriptions DB).',
        payload: '{ "eventId": "evt_01H…", "accountId": "acc_7Q2", "plan": "trial", "status": "trialing", "trialEndsAt": "2026-10-20T09:00:00Z" }',
        rules: ['plan-entitlements'],
        ruleInputs: { 'plan-entitlements': { plan: 'trial' } },
      },
      ...tail('su', 'Send welcome email'),
    ],
  },
  {
    id: 'trial-convert',
    title: 'Trial converts to paid',
    feature: 'payments',
    trigger: 'Trial customer picks Pro and enters a card',
    outcome: 'Invoice paid, subscription active on Pro for one month, Pro limits live, receipt sent. A declined card leaves the trial running.',
    steps: [
      { id: 'cv-submit', edge: 'web-gateway', title: 'Choose Pro, pay' },
      { id: 'cv-route', edge: 'gw-convert', title: 'Convert to paid', payload: '{ "accountId": "acc_7Q2", "plan": "pro", "interval": "month" }' },
      {
        id: 'cv-session',
        edge: 'convert-provider',
        title: 'Create checkout session',
        description: 'Creates an `open` invoice for 4,900 cents first. The customer finishes card entry and 3-D Secure on the provider’s hosted form.',
        payload: '{ "customer": "cus_9K1", "price": "price_pro_month", "invoiceId": "inv_3001", "successUrl": "/billing?ok=1" }',
      },
      {
        id: 'cv-webhook',
        edge: 'provider-wh',
        title: 'Webhook invoice.paid',
        condition: 'charge succeeded',
        payload: '{ "id": "evt_5Rt", "type": "invoice.paid", "data": { "invoice": "pi_inv_3001", "amount_paid": 4900, "currency": "eur" } }',
      },
      { id: 'cv-inbox', edge: 'wh-inbox', title: 'Store in inbox', description: 'A retried delivery with the same `id` is dropped by the primary key.' },
      { id: 'cv-process', edge: 'inbox-events', title: 'Process event', sla: '< 2 s after receipt' },
      { id: 'cv-paid', edge: 'events-paid', title: 'Publish PaymentSucceeded' },
      {
        id: 'cv-entitle',
        edge: 'paid-entitle',
        title: 'Activate subscription',
        description: 'Marks the invoice paid (dashed connector to Invoice store), sets status `active`, period 1 month.',
        rules: ['plan-entitlements'],
        ruleInputs: { 'plan-entitlements': { plan: 'pro' } },
      },
      ...tail('cv', 'Send receipt', '{ "template": "receipt", "to": "ada@example.com", "invoice": "INV-2026-3001", "amount": "€49.00" }'),
    ],
  },
  {
    id: 'renewal-dunning',
    title: 'Renewal fails, dunning',
    feature: 'recovery',
    trigger: 'Monthly renewal is due and the saved card is declined',
    outcome: 'Either a retry succeeds and the subscription is active again, or after the 4th failed attempt it is cancelled and the account drops to Free limits. Data is kept either way.',
    branches: [
      { id: 'recovered', label: 'Recovered', condition: 'a retry is approved' },
      { id: 'cancelled', label: 'Cancelled after retries', condition: 'attempt 4 is declined', errorPath: true },
    ],
    steps: [
      { id: 'dn-renew', edge: 'renew-charge', title: 'Enqueue RENEW', description: 'Charge worker opens the renewal invoice for the new period before charging.' },
      {
        id: 'dn-charge',
        edge: 'charge-provider',
        title: 'Charge saved card',
        payload: '{ "customer": "cus_9K1", "amount": 4900, "currency": "eur", "off_session": true, "idempotencyKey": "inv_3187:1" }',
      },
      { id: 'dn-declined', edge: 'provider-charge', title: 'Card declined', payload: '{ "status": "failed", "decline_code": "insufficient_funds" }' },
      { id: 'dn-failed', edge: 'charge-failed', title: 'Publish PaymentFailed', payload: '{ "invoiceId": "inv_3187", "attempt": 1, "reason": "insufficient_funds" }' },
      {
        id: 'dn-book',
        edge: 'failed-dunning',
        title: 'Book next attempt',
        description: 'Sets the subscription `past_due` and emails `payment-failed-1` (dashed `DunningEmail` to the notifier).',
        rules: ['dunning-schedule'],
        ruleInputs: { 'dunning-schedule': { attempt: '1' } },
      },
      { id: 'dn-retry', edge: 'dunning-charge', title: 'Fire RETRY job', condition: 'run_at reached', description: 'Attempts 2, 3 and 4 each repeat the next two steps; the schedule decides the wait.' },
      { id: 'dn-recharge', edge: 'charge-provider', title: 'Retry the charge', payload: '{ "customer": "cus_9K1", "amount": 4900, "off_session": true, "idempotencyKey": "inv_3187:2" }' },
      { id: 'dn-result', edge: 'provider-charge', title: 'Retry result' },
      { id: 'rc-paid', edge: 'charge-paid', title: 'Publish PaymentSucceeded', branch: 'recovered' },
      {
        id: 'rc-entitle',
        edge: 'paid-entitle',
        title: 'Back to active',
        branch: 'recovered',
        description: 'Marks the invoice paid, deletes the pending `dunning_attempts` row, status `past_due → active`.',
        rules: ['plan-entitlements'],
        ruleInputs: { 'plan-entitlements': { plan: 'pro' } },
      },
      { ...tail('rc', 'Send receipt')[0], branch: 'recovered' },
      { ...tail('rc', 'Send receipt')[1], branch: 'recovered' },
      { id: 'cx-failed', edge: 'charge-failed', title: 'Publish PaymentFailed', branch: 'cancelled', payload: '{ "invoiceId": "inv_3187", "attempt": 4, "reason": "card_expired" }' },
      {
        id: 'cx-cancel',
        edge: 'failed-entitle',
        title: 'Cancel subscription',
        branch: 'cancelled',
        description: 'Voids the open invoice, status `past_due → cancelled`. Plan entitlements fall to the Free row.',
        rules: ['dunning-schedule', 'plan-entitlements'],
        ruleInputs: { 'dunning-schedule': { attempt: '4' }, 'plan-entitlements': { plan: 'free' } },
      },
      { ...tail('cx', 'Send cancellation email')[0], branch: 'cancelled' },
      { ...tail('cx', 'Send cancellation email')[1], branch: 'cancelled' },
    ],
  },
  {
    id: 'upgrade-proration',
    title: 'Upgrade plan with proration',
    feature: 'payments',
    trigger: 'Owner moves from Starter to Pro mid-period',
    outcome: 'Prorated difference charged now, Pro limits live at once, renewal date unchanged. A failed proration charge keeps the account on Starter.',
    steps: [
      { id: 'up-submit', edge: 'web-gateway', title: 'Choose Pro' },
      {
        id: 'up-route',
        edge: 'gw-upgrade',
        title: 'Change plan',
        description: 'Reads both prices from the plan catalog (dashed) and shows the preview: 18 of 30 days left × (4,900 − 1,900) = 1,800 cents.',
      },
      {
        id: 'up-provider',
        edge: 'upgrade-provider',
        title: 'Update subscription',
        payload: '{ "subscription": "sub_44Z", "price": "price_pro_month", "proration_behavior": "always_invoice", "proration_date": 1791100800, "expected_amount": 1800 }',
      },
      { id: 'up-webhook', edge: 'provider-wh', title: 'Webhook invoice.paid', payload: '{ "id": "evt_8Lm", "type": "invoice.paid", "data": { "billing_reason": "subscription_update", "amount_paid": 1800 } }' },
      { id: 'up-inbox', edge: 'wh-inbox', title: 'Store in inbox' },
      { id: 'up-process', edge: 'inbox-events', title: 'Process event' },
      { id: 'up-paid', edge: 'events-paid', title: 'Publish PaymentSucceeded' },
      {
        id: 'up-entitle',
        edge: 'paid-entitle',
        title: 'Switch plan to Pro',
        description: 'Keeps `current_period_end`; only the plan changes.',
        rules: ['plan-entitlements'],
        ruleInputs: { 'plan-entitlements': { plan: 'pro' } },
      },
      ...tail('up', 'Send plan-changed email'),
    ],
  },
];

const deck = {
  $schema: 'https://sododeck.com/schema/v1.json',
  version: 1,
  name: 'SaaS signup and subscription billing',
  description:
    'A fictional SaaS product: signup with a free trial, conversion to paid through a payment provider webhook round trip, renewals with dunning, and plan changes with proration. Billing is shown in detail.',
  packs: ['architecture', 'process'],
  nodes,
  groups,
  edges,
  views: [],
  features,
  flows,
  rules,
  stickies,
};

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'saas-billing.draft.sododeck'), JSON.stringify(deck, null, 2) + '\n');
