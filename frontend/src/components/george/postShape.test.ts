/**
 * How a post is drawn, held to UI rules 4, 5 and 6 across ALL EIGHT KINDS.
 *
 * The failure these guard against is the per-kind exception. A brief is long, a
 * pin confirmation is trivial, a system post has no data — each is an argument
 * for treating that one kind specially, and the moment one kind may skip a
 * caveat the guarantee is gone for every kind, because a reader cannot know
 * which kind they are looking at before they read it.
 *
 * So almost every assertion below runs over the whole kind list rather than
 * over an example.
 */
import { describe, expect, it } from 'vitest';
import type { Post, PostKind } from '../../types/river';
import {
  ACCENT_KINDS,
  GROUP_WINDOW_MS,
  KIND_LABEL,
  TIME_UNKNOWN,
  groupsWith,
  postView,
} from './postShape';

/** POST_KINDS in backend/app/models/george_post.py. */
const KINDS: PostKind[] = [
  'brief', 'notice', 'answer', 'question',
  'approval', 'workflow_run', 'pin_confirmation', 'system',
];

function post(over: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    thread_id: 't1',
    parent_id: null,
    kind: 'answer',
    author: 'george',
    author_user: null,
    owner_user: null,
    visibility: 'org',
    mine: false,
    body: 'Rockwell took ₱48,210 on Wed 2 Sep 2026.',
    payload: null,
    receipts: null,
    notices: [],
    conversation_id: null,
    created_at: '2026-09-05T01:00:00+00:00',
    ...over,
  };
}

const NOTICE = { kind: 'low_stock_not_operational', message: 'Threshold not set.' };
const RECEIPTS = { source_table: 'new_transactions', snapshot_timestamp: '2026-09-05T01:00:00Z' };

describe('every kind is drawable', () => {
  it('has a label entry, even when that entry is null', () => {
    for (const kind of KINDS) {
      expect(kind in KIND_LABEL).toBe(true);
    }
  });

  it('produces a complete view for every kind', () => {
    for (const kind of KINDS) {
      const view = postView(post({ kind }));
      expect(view.kind).toBe(kind);
      expect(['george', 'user']).toContain(view.side);
      expect(view.time).toBeTruthy();
    }
  });
});

describe('UI rule 4 — notices always surface, on every kind', () => {
  it('surfaces notices whatever the kind', () => {
    for (const kind of KINDS) {
      const view = postView(post({ kind, notices: [NOTICE] }));
      expect(view.showNotices).toBe(true);
    }
  });

  it('has no kind exempted from carrying a caveat', () => {
    const exempt = KINDS.filter((kind) => !postView(post({ kind, notices: [NOTICE] })).showNotices);
    expect(exempt).toEqual([]);
  });

  it('shows nothing when there is nothing to show', () => {
    expect(postView(post({ notices: [] })).showNotices).toBe(false);
  });
});

describe('UI rule 6 — no post displays without a time', () => {
  it('reports the timestamp when there is one', () => {
    const view = postView(post({ created_at: '2026-09-05T01:00:00+00:00' }));
    expect(view.time).toEqual({ known: true, iso: '2026-09-05T01:00:00+00:00' });
  });

  it('says the time is missing rather than rendering none', () => {
    // A card with no time on it is a claim with no expiry. Saying "not
    // recorded" is worse-looking and more honest.
    for (const kind of KINDS) {
      const view = postView(post({ kind, created_at: null }));
      expect(view.time.known).toBe(false);
      expect(view.time).toEqual({ known: false, label: TIME_UNKNOWN });
    }
  });
});

describe('UI rule 5 — one colour means "needs you"', () => {
  it('is worn by NO post kind at all', () => {
    // The rail carries "needs you"; a post is the record that it happened.
    // The same fact shouting in two places locates nothing.
    const wearing = KINDS.filter((kind) => postView(post({ kind })).accent);
    expect(wearing).toEqual([]);
  });

  it('is not worn by an approval post either', () => {
    expect(postView(post({ kind: 'approval' })).accent).toBe(false);
  });

  it('is not lent to a failed workflow run', () => {
    // The pressure is always to add a second use: a failure feels urgent. The
    // rule is that the colour's meaning is destroyed by a second USE, not by a
    // second feeling.
    const view = postView(post({
      kind: 'workflow_run',
      payload: { status: 'failed' },
      notices: [{ kind: 'workflow_step_failed', message: 'The workflow could not run.' }],
    }));
    expect(view.accent).toBe(false);
    expect(view.showNotices).toBe(true);
  });

  it('is not lent to a notice post', () => {
    expect(postView(post({ kind: 'notice', notices: [NOTICE] })).accent).toBe(false);
  });

  it('declares its accent list as a list, so any entry is a visible edit', () => {
    expect(ACCENT_KINDS).toEqual([]);
  });
});

describe('receipts', () => {
  it('render on any kind that carries them', () => {
    for (const kind of KINDS) {
      expect(postView(post({ kind, receipts: RECEIPTS })).showReceipts).toBe(true);
    }
  });

  it('are not claimed when the post has none', () => {
    expect(postView(post({ receipts: null })).showReceipts).toBe(false);
  });
});

describe('sides and sharing', () => {
  it('draws a person on the user side and George on his', () => {
    expect(postView(post({ author: 'user', author_user: 'ice', kind: 'question' })).side)
      .toBe('user');
    expect(postView(post({ author: 'george' })).side).toBe('george');
  });

  it('offers a share only on the viewer’s own private post', () => {
    expect(postView(post({ mine: true, visibility: 'private' })).canShare).toBe(true);
  });

  it('does not offer a share on somebody else’s post', () => {
    expect(postView(post({ mine: false, visibility: 'private' })).canShare).toBe(false);
  });

  it('does not offer a share on something already shared', () => {
    expect(postView(post({ mine: true, visibility: 'org' })).canShare).toBe(false);
  });

  it('never offers a share on one of George’s posts', () => {
    // His are org-level already; there is nothing to share.
    for (const kind of KINDS) {
      const view = postView(post({ kind, author: 'george', mine: false }));
      expect(view.canShare).toBe(false);
    }
  });
});

describe('grouping is presentation only', () => {
  const t = (ms: number) => new Date(Date.parse('2026-09-05T01:00:00Z') + ms).toISOString();

  it('groups consecutive posts by the same author within the window', () => {
    const a = post({ created_at: t(0) });
    const b = post({ created_at: t(60_000) });
    expect(groupsWith(a, b)).toBe(true);
  });

  it('does not group across authors', () => {
    const a = post({ author: 'user', author_user: 'ice', kind: 'question', created_at: t(0) });
    const b = post({ author: 'george', created_at: t(1000) });
    expect(groupsWith(a, b)).toBe(false);
  });

  it('does not group across two different people', () => {
    const a = post({ author: 'user', author_user: 'ice', kind: 'question', created_at: t(0) });
    const b = post({ author: 'user', author_user: 'sam', kind: 'question', created_at: t(1000) });
    expect(groupsWith(a, b)).toBe(false);
  });

  it('does not group past the window', () => {
    const a = post({ created_at: t(0) });
    const b = post({ created_at: t(GROUP_WINDOW_MS + 1) });
    expect(groupsWith(a, b)).toBe(false);
  });

  it('never groups a labelled kind, so its label cannot attach to the wrong thing', () => {
    for (const kind of KINDS.filter((k) => KIND_LABEL[k] !== null)) {
      const a = post({ created_at: t(0) });
      const b = post({ kind, created_at: t(1000) });
      expect(groupsWith(a, b)).toBe(false);
    }
  });

  it('never groups the first post', () => {
    expect(groupsWith(undefined, post())).toBe(false);
  });

  it('does not group when either time is missing', () => {
    // Grouping asserts closeness in time. With no time there is no claim to
    // make, and guessing would put two unrelated posts in one block.
    expect(groupsWith(post({ created_at: null }), post())).toBe(false);
    expect(groupsWith(post(), post({ created_at: null }))).toBe(false);
  });
});
