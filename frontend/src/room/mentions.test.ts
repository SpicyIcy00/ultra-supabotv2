/**
 * THE `@` DOOR (P2.c), held on the resolution rather than on the wording.
 *
 * Two questions this file answers: what is being completed right now, and what
 * picking one of the answers BINDS. Neither is a matter of taste, and both are
 * read off the served definitions — the trigger, the bounds and which kind
 * binds what all live in `surface.desk.selection.mentions`.
 */
import { describe, expect, it } from 'vitest';
import type { DeskDefinitions } from '../services/deskApi';
import type { MentionCandidate } from '../services/mentionsApi';
import { accept, bind, offered, openMention, trigger, worthReading } from './mentions';

/** `surface.desk.selection`, as the endpoint serves it. */
const DEFS = {
  selection: {
    dimensions: ['store', 'product', 'category', 'supplier'],
    max_subjects: 12,
    identity: { store: 'store_id', product: 'product_id', supplier: 'supplier' },
    mentions: {
      trigger: '@', min_prefix: 0, max_per_kind: 5, max_results: 3,
      kinds: {
        store: { binds: 'selection', dimension: 'store', says: 'shop' },
        product: { binds: 'selection', dimension: 'product', says: 'product' },
        supplier: { binds: 'selection', dimension: 'supplier', says: 'supplier' },
        page: { binds: 'page_scope', says: 'page' },
        rule: { binds: 'named_on_question', says: 'rule' },
      },
    },
  },
} as unknown as DeskDefinitions;

const candidate = (over: Partial<MentionCandidate>): MentionCandidate => ({
  kind: 'store', id: 's-1', label: 'Rockwell', says: 'shop',
  binds: 'selection', dimension: 'store', hint: null, ...over,
});

describe('what is being completed', () => {
  it('is read backwards from the caret, not from the end of the line', () => {
    // Typed a name, clicked back into the middle of it, carried on typing.
    const draft = 'how did @Rock do last week';
    expect(openMention(draft, 13, DEFS)).toEqual({ at: 8, caret: 13, query: 'Rock' });
  });

  it('is nothing once the caret has moved past a space', () => {
    expect(openMention('how did @Rock do', 16, DEFS)).toBeNull();
  });

  it('is nothing for an `@` inside a word — an address is not a mention', () => {
    expect(openMention('mail ice@example', 16, DEFS)).toBeNull();
  });

  it('is the bare trigger, which is a menu rather than an empty list', () => {
    expect(openMention('@', 1, DEFS)).toEqual({ at: 0, caret: 1, query: '' });
  });

  it('takes the trigger and the bound from the definitions', () => {
    expect(trigger(DEFS)).toBe('@');
    expect(worthReading(openMention('@', 1, DEFS), DEFS)).toBe(true);
    const stricter = { selection: { mentions: { trigger: '@', min_prefix: 2 } } } as unknown as DeskDefinitions;
    expect(worthReading(openMention('@Se', 3, stricter), stricter)).toBe(true);
    expect(worthReading(openMention('@S', 2, stricter), stricter)).toBe(false);
    expect(worthReading(openMention('@', 1, stricter), stricter)).toBe(false);
  });

  it('is nothing when there is no `@` at all', () => {
    expect(openMention('how did Rockwell do', 19, DEFS)).toBeNull();
  });
});

describe('accepting one', () => {
  it('puts the NAME in the text and leaves the id to the chip', () => {
    const draft = 'how did @Rock do';
    const open = openMention(draft, 13, DEFS)!;
    expect(accept(draft, open, candidate({ label: 'Rockwell' }), DEFS)).toEqual({
      text: 'how did @Rockwell do', caret: 18,
    });
  });

  it('leaves the caret after the word, not at the end of the sentence', () => {
    const draft = '@Sei and @Rock';
    const open = openMention(draft, 4, DEFS)!;
    const next = accept(draft, open, candidate({ label: 'Seikyo' }), DEFS);
    expect(next.text).toBe('@Seikyo and @Rock');
    expect(next.text.slice(0, next.caret)).toBe('@Seikyo ');
  });
});

describe('what picking one binds', () => {
  it('makes a shop a SUBJECT carrying the id, saying where the id came from', () => {
    expect(bind(candidate({ kind: 'store', id: 's-rock', label: 'Rockwell' }), DEFS))
      .toEqual({
        binds: 'selection',
        subject: { dimension: 'store', id: 's-rock', label: 'Rockwell', from: 'mention' },
      });
  });

  it('makes a supplier a subject of its own dimension', () => {
    // The card's own case: "@Rockwell" can never be read as a product name,
    // because the dimension travels with the id.
    const bound = bind(candidate({
      kind: 'supplier', id: 'Seikyo', label: 'Seikyo', says: 'supplier',
      binds: 'selection', dimension: 'supplier',
    }), DEFS);
    expect(bound).toMatchObject({ binds: 'selection', subject: { dimension: 'supplier' } });
  });

  it('makes a page the SCOPE, which is what injects a reader for it', () => {
    expect(bind(candidate({
      kind: 'page', id: 'page-7', label: 'Replenishment', says: 'page',
      binds: 'page_scope', dimension: null,
    }), DEFS)).toEqual({ binds: 'page_scope', pageId: 'page-7', title: 'Replenishment' });
  });

  it('leaves a rule named and bound to nothing', () => {
    expect(bind(candidate({
      kind: 'rule', id: 'wf-3', label: 'PO Maker', says: 'rule',
      binds: 'named_on_question', dimension: null,
    }), DEFS)).toEqual({ binds: 'named', kind: 'rule', id: 'wf-3', label: 'PO Maker' });
  });

  it('reads what it binds from the DEFINITIONS, over what the server said', () => {
    // A server claiming a page is a subject cannot put a page id in the field
    // the tools read subjects out of.
    const lying = candidate({ kind: 'page', id: 'page-7', label: 'P', binds: 'selection', dimension: 'store' });
    expect(bind(lying, DEFS)).toEqual({ binds: 'page_scope', pageId: 'page-7', title: 'P' });
  });

  it('binds nothing at all for a kind the definitions do not declare', () => {
    expect(bind(candidate({ kind: 'machine', binds: 'selection', dimension: undefined }), DEFS)).toBeNull();
  });
});

describe('what is offered', () => {
  it('is capped by the definitions, whatever the server sent', () => {
    const many = Array.from({ length: 9 }, (_, n) => candidate({ id: `s-${n}` }));
    expect(offered(many, DEFS)).toHaveLength(3);
    expect(offered(many, null)).toHaveLength(9);
  });
});
