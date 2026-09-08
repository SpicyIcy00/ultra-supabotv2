/**
 * The order an entry is read in, asserted against the rendered DOM.
 *
 * UI rule 4 says a caveat is read on the way to the number, which is a claim
 * about POSITION and can only be checked against real output — asserting it
 * against a data structure would be asserting this test's own model of the
 * component. So the notice, the answer and the figures are located in the
 * document and their order compared.
 *
 * It is checked on BOTH sources. A live turn and its stored post now go through
 * one renderer (workUnit.ts), and this is what says so about the rendering
 * rather than about the structure: same order, same caveat, either way.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { GeorgeTurn, ToolCall } from '../../types/george';
import type { Post } from '../../types/river';
import { GeorgeStreamProvider } from './GeorgeStreamProvider';
import { RiverEntry } from './RiverEntry';
import { workUnitFromPost, workUnitFromTurn } from './workUnit';

afterEach(cleanup);

const META = {
  source_table: 'new_transactions',
  filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-08T02:00:00+08:00',
  row_count: 1,
  metric_label: 'Net sales',
  window: { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' },
};

const ROWS = [{ store: 'Rockwell', value: 48210, unit: 'PHP' }];
const NOTICE = {
  kind: 'comparison_incomplete',
  message: '2 of 8 rows could not be compared against the earlier week.',
  source: 'definitions/metrics.yaml: comparisons.previous_period.baseline_statuses',
};
const PROSE = 'Rockwell took 48,210 pesos last week.';

const CALL: ToolCall = {
  seq: 1,
  tool: 'get_sales',
  arguments: { metric: 'net_sales', date_range: 'last_week' },
  result: {
    row_count: 1,
    source_table: 'new_transactions',
    truncated: false,
    duration_ms: 42,
    error: null,
    rows: ROWS,
    rows_complete: true,
    meta: META,
    pinnable: true,
  },
};

const TURN: Extract<GeorgeTurn, { role: 'george' }> = {
  role: 'george',
  text: PROSE,
  thinking: '',
  toolCalls: [CALL],
  notices: [NOTICE],
  pinned: [],
  saved: [],
  pageChanges: [],
  receipts: META,
  post: {
    question_post_id: 'q1',
    answer_post_id: 'a1',
    thread_id: 't1',
    conversation_id: 'c1',
    visibility: 'private',
    stored: true,
  },
  done: {
    conversation_id: 'c1',
    iterations: 1,
    tool_calls: 1,
    status: 'ok',
    notice_forced: false,
    usage: { input: 1, output: 1, cache_read: 0 },
    cache_hit: false,
  },
  at: '2026-09-08T02:00:01+08:00',
};

const POST = {
  id: 'a1',
  thread_id: 't1',
  parent_id: 'q1',
  kind: 'answer',
  author: 'george',
  author_user: null,
  visibility: 'private',
  owner_user: 'ice',
  mine: true,
  body: PROSE,
  conversation_id: 'c1',
  created_at: '2026-09-08T02:00:01+08:00',
  notices: [NOTICE],
  receipts: META,
  payload: {
    charted: [{ seq: 1, tool: 'get_sales', arguments: CALL.arguments, rows: ROWS, meta: META }],
    calls: [{ seq: 1, tool: 'get_sales', arguments: CALL.arguments }],
  },
} as unknown as Post;

function mount(which: 'live' | 'stored') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const item =
    which === 'live'
      ? workUnitFromTurn(TURN, 'How did Rockwell do?', 'live-0')
      : workUnitFromPost(POST, 'How did Rockwell do?');
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GeorgeStreamProvider>
          <RiverEntry item={item} />
        </GeorgeStreamProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** True when `a` comes before `b` in document order. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe.each(['live', 'stored'] as const)('an entry, %s', (which) => {
  it('puts the caveat above the answer', () => {
    mount(which);
    // UI rule 4. A caveat that qualifies a number has to be read before the
    // number, not found afterwards.
    expect(precedes(screen.getByRole('note'), screen.getByText(PROSE))).toBe(true);
  });

  it('puts the caveat above the figures it qualifies', () => {
    mount(which);
    expect(precedes(screen.getByRole('note'), screen.getByText('₱48,210'))).toBe(true);
  });

  it('never hides the caveat behind a disclosure', () => {
    mount(which);
    const note = screen.getByRole('note');
    expect(note.textContent).toContain(NOTICE.message);
    // The banner itself is not a button and is not inside one.
    expect(note.closest('button')).toBeNull();
  });

  it('keeps the definitions path off the always-visible surface', () => {
    mount(which);
    // Stage 2: the citation is provenance, not caveat. It was rendered as a
    // third always-visible line on every notice in the app — a file path shown
    // to somebody who asked how a store did.
    expect(screen.getByRole('note').textContent).not.toContain('definitions/metrics.yaml');
  });

  it('still offers the citation, one tap down', () => {
    mount(which);
    // Nothing was removed. UI rule 3: inspectable, in the same panel.
    fireEvent.click(screen.getByRole('button', { name: /Where this comes from/ }));
    expect(screen.getByRole('note').textContent).toContain('definitions/metrics.yaml');
  });

  it('leads the receipts with the scope, not a table name', () => {
    mount(which);
    const receipts = screen.getAllByRole('button', { name: /read / })[0];
    expect(receipts.textContent).toContain('Net sales');
    expect(receipts.textContent).toContain('Last week');
    expect(receipts.textContent).not.toContain('new_transactions');
  });

  it('shows when the figure was read, without any interaction', () => {
    // UI rule 6: no number displays without a timestamp.
    mount(which);
    expect(screen.getAllByText(/read /).length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the label tool out of the always-visible surface too', () => {
    // A turn that recorded roles carries a record_findings call. It has no
    // rows and no receipts, and its name is an identifier; the work line says
    // what it did in words (cognition.ts) and the rows behind the disclosure
    // are the only place the name appears.
    const turn = {
      ...TURN,
      toolCalls: [
        CALL,
        { seq: 2, tool: 'record_findings', arguments: { findings: [{ seq: 1, role: 'primary' }] },
          result: { row_count: 0, source_table: null, truncated: false, duration_ms: 1,
                    error: null, rows: [], rows_complete: false, meta: null, pinnable: false } },
      ],
      findings: [{ seq: 1, role: 'primary' as const, of: null, tool: 'get_sales' }],
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <GeorgeStreamProvider>
            <RiverEntry item={workUnitFromTurn(turn, 'How did Rockwell do?', 'live-0')} />
          </GeorgeStreamProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container.textContent).not.toContain('record_findings');
    // And the ladder is drawn: the primary figure sits under its rung.
    expect(container.textContent).toContain('The figure');
  });

  it('keeps the tool name out of the always-visible surface', () => {
    const { container } = mount(which);
    // The activity line says what George did in words; `get_sales` lives in
    // the rows behind it (turnShape.workLine, ActivityDisclosure).
    expect(container.textContent).not.toContain('get_sales');
  });
});
