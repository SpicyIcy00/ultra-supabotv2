/**
 * One of every kind of post, for the preview route.
 *
 * REAL SHAPES, SYNTHETIC CONTENT. Every field matches RiverPost from
 * backend/app/api/v1/routes/george.py exactly — receipts carry a real
 * `filters_applied` string with its metrics.yaml citation, notices are real
 * {kind, message, source} objects, timestamps are real ISO strings. What is not
 * real is the business data: committing production figures into the repository
 * to make a mockup look convincing would put real numbers somewhere nobody
 * expects to find them, and a preview does not need them to prove a layout.
 *
 * The one post with NO timestamp is deliberate and is the most important row
 * here: UI rule 6 says a card with no time on it is a claim with no expiry, so
 * the preview has to show what that case actually looks like rather than
 * assuming it never happens.
 */
import type { Post } from '../../types/river';

const T = (iso: string) => `2026-09-05T${iso}+08:00`;

export const RIVER_FIXTURE: Post[] = [
  {
    id: 'p1', thread_id: 'p1', parent_id: null,
    kind: 'brief', author: 'george', author_user: null,
    visibility: 'org', owner_user: null, mine: false,
    body:
      'Greenhills took ₱62,410 on Thu 4 Sep 2026 — 34% above the same Thursday ' +
      'last week, when it took ₱46,570. Two other items in this morning’s brief ' +
      '— ask and I’ll run it.',
    payload: { follow_ups: [{ label: 'Why?', question: 'Why was Greenhills up on Thu 4 Sep 2026?' }] },
    receipts: {
      source_table: 'new_transactions',
      filters_applied: [
        't.is_cancelled = false   # metrics.yaml: filters.cancelled',
        "t.transaction_type = 'Sale'   # metrics.yaml: filters.standard_sales_guard",
      ],
      snapshot_timestamp: T('06:00:11.204000'),
      window: { kind: 'preset', name: 'yesterday', start: '2026-09-04', end: '2026-09-05' },
      metric: 'net_sales',
    },
    notices: [],
    conversation_id: null, created_at: T('06:00:12'),
  },
  {
    id: 'p2', thread_id: 'p2', parent_id: null,
    kind: 'notice', author: 'george', author_user: null,
    visibility: 'org', owner_user: null, mine: false,
    body:
      'Hello Panda went out of stock at Fairview overnight — 14 on hand on ' +
      'Wed 3 Sep, none on Thu 4 Sep. Nothing is on order against it.',
    payload: { moves: [{ label: 'On order?', question: 'Is Hello Panda on order for Fairview?' }] },
    receipts: {
      source_table: 'inventory_snapshots',
      filters_applied: ['was quantity_on_hand > 0, now <= 0   # metrics.yaml: brief.stock_crossed_out'],
      snapshot_timestamp: T('06:00:09.881000'),
    },
    notices: [
      {
        kind: 'low_stock_not_operational',
        message:
          'warning_stock is NULL on every row at this location, so "low stock" ' +
          'is not configured here — this list is empty because nobody set a ' +
          'threshold, not because the shelves are full.',
        source: 'metrics.yaml: inventory.states',
      },
    ],
    conversation_id: null, created_at: T('06:00:14'),
  },
  {
    id: 'p3', thread_id: 'p3', parent_id: null,
    kind: 'question', author: 'user', author_user: 'ice',
    visibility: 'private', owner_user: 'ice', mine: true,
    body: 'How did Rockwell do yesterday?',
    payload: null, receipts: null, notices: [],
    conversation_id: 'c-1', created_at: T('08:41:02'),
  },
  {
    id: 'p4', thread_id: 'p3', parent_id: 'p3',
    kind: 'answer', author: 'george', author_user: null,
    visibility: 'private', owner_user: 'ice', mine: false,
    body:
      'Rockwell took **₱28,782** on Thu 4 Sep 2026, net of cancellations and ' +
      'returns.\n\nNo discounts on the day, so product revenue and net sales ' +
      'match exactly.',
    payload: null,
    receipts: {
      source_table: 'new_transactions',
      filters_applied: [
        't.is_cancelled = false   # metrics.yaml: filters.cancelled',
        "s.name = 'Rockwell'   # metrics.yaml: stores.active_retail",
      ],
      snapshot_timestamp: T('08:41:06.417000'),
      window: { kind: 'preset', name: 'yesterday', start: '2026-09-04', end: '2026-09-05' },
      metric: 'net_sales', metric_unit: 'PHP', row_count: 1,
    },
    notices: [],
    conversation_id: 'c-1', created_at: T('08:41:09'),
  },
  {
    id: 'p5', thread_id: 'p5', parent_id: null,
    kind: 'approval', author: 'george', author_user: null,
    visibility: 'org', owner_user: null, mine: false,
    body:
      '**BARN Days of Cover v1** is waiting to be promoted. Never backtested — ' +
      'run it against a past window and look at what it would have produced.',
    payload: { workflow_id: '228ffb91', version: 1 },
    receipts: null, notices: [],
    conversation_id: null, created_at: T('09:02:00'),
  },
  {
    id: 'p6', thread_id: 'p6', parent_id: null,
    kind: 'workflow_run', author: 'george', author_user: null,
    visibility: 'org', owner_user: null, mine: false,
    body:
      '**Monday replenishment v3** ran at 06:00. Four steps, all reproducible ' +
      'in full.',
    payload: { status: 'ok', steps: 4, version: 3 },
    receipts: {
      source_table: 'george.workflow_runs',
      filters_applied: ['version = 3   # metrics.yaml: workflows.promotion'],
      snapshot_timestamp: T('06:00:31.002000'),
    },
    notices: [
      {
        kind: 'version_divergence',
        message:
          'This run used v3; the enabled schedule fires v2 every Monday at 06:00. ' +
          'v3 has not been promoted, so the figures above are not the ones that ' +
          'go out unattended.',
        source: 'metrics.yaml: workflows.divergence',
      },
    ],
    conversation_id: null, created_at: T('06:00:33'),
  },
  {
    id: 'p7', thread_id: 'p3', parent_id: 'p4',
    kind: 'pin_confirmation', author: 'george', author_user: null,
    visibility: 'private', owner_user: 'ice', mine: false,
    body: 'Pinned “Rockwell net sales, yesterday” to **Replenishment**. It re-runs its call each time it loads.',
    payload: { pin_id: 'pin-1', page: 'Replenishment', tool_calls: 1 },
    receipts: null, notices: [],
    conversation_id: 'c-1', created_at: T('08:42:20'),
  },
  {
    id: 'p8', thread_id: 'p8', parent_id: null,
    kind: 'system', author: 'george', author_user: null,
    visibility: 'org', owner_user: null, mine: false,
    // The row that proves UI rule 6 has a rendering and not an omission.
    body: 'Definitions updated to version 2. Figures before and after this point may use different rules.',
    payload: null, receipts: null, notices: [],
    conversation_id: null, created_at: null,
  },
];
