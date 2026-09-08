# River V2 — measurements and the virtualization threshold

Recorded 2026-09-08, Stage 1 of UI System V2.

## What was measured

`RiverEntries` rendering a thread of N stored answers plus one live turn, then
40 streamed text deltas against it. Each stored answer carries prose, a notice,
a charted result and its receipts — the heaviest realistic entry. jsdom, so the
absolute numbers are pessimistic against a browser (no layout, but far slower
DOM operations); the SHAPE is what matters.

| entries | first mount | per streamed delta |
|--------:|------------:|-------------------:|
| 20      | 204 ms      | 2.7 ms             |
| 80      | 517 ms      | 3.5 ms             |
| 200     | 530 ms      | 9.2 ms             |
| 400     | 1018 ms     | 10.9 ms            |

## What the numbers cost, and what they bought

The first run of this measurement reported 12.4 / 21.0 / 43.9 / 74.1 ms per
delta — about eight times the slope above. That was the harness building a new
`QueryClient` on every render, which remounts the whole tree; it is recorded
here because it is exactly the failure the split below prevents, and it looked
like a real result until it was read.

Two things make the numbers above what they are:

- **`RiverEntry` is memoized on its props.** `patchLast` replaces the turns
  array on every SSE delta, so without this every entry in the thread
  re-renders for content that did not change.
- **The stored half and the live half are built separately**
  (`workUnit.storedItems` / `workUnit.liveItems`, memoized apart in AskPage,
  RiverFeed and AnswerTurns). A single builder over both would hand every
  stored entry a brand-new object on every delta and memoization would never
  fire — the same 8x, in production rather than in a test harness.

## The decision: no virtualization yet

At 200 entries the per-delta cost is 9.2 ms in jsdom, comfortably inside a
frame in a browser, and the slope after memoization is ~0.02 ms per entry per
delta. Windowing a list costs real things — scroll anchoring, find-in-page,
`Ctrl+F`, screen-reader traversal of the whole document, and the auto-follow
hook's `scrollHeight` becoming an estimate rather than a measurement — and
none of that is worth paying for a cost that is not yet being felt.

**Revisit when either is true:**

1. A single thread or river page routinely exceeds **400 entries**, or
2. per-delta cost measured **in a browser** exceeds **8 ms** (half a frame).

**The plan when it is time.** Window the stored half only, never the live half:
the live entry must stay mounted so its state, its disclosure and its scroll
position survive. `RiverEntries` already takes the two halves as one array and
is the only place that maps over them, so the change is contained there. The
`useAutoFollow` container measures `scrollHeight`, so any windowing has to
reserve real height for what it does not render, or following will land short.
