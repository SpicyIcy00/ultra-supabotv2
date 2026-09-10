/**
 * THE ROOM — where the work is.
 *
 * You arrive somewhere rather than starting a session. What is on screen is
 * the board: every object George has put there, still drawing the read it was
 * made from. It is not the last answer, and a follow-up transforms an object
 * rather than drawing a second one beneath it.
 *
 * What is yours: bring something forward, set it aside, sort a table, pick a
 * subject to talk about. All instant, all local, never sent back to George as
 * though he had decided it. Only a new FACT costs a turn.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGeorge } from '../hooks/useGeorge';
import { useThread } from '../hooks/useThread';
import { threadHistory } from '../components/george/threadHistory';
import { restoreFromPosts } from '../workspace/composition';
import { boardContext, buildBoard, type Local } from './board';
import type { AnswerTurn, Dimension } from './data';
import { Board } from './render';
import { Rail } from './Rail';
import type { TileActions } from './tiles';
import './room.css';

export default function Room() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const george = useGeorge();
  const thread = useThread(threadId ?? '');

  const [selection, setSelection] = useState<{ label: string; dimension: Dimension }[]>([]);
  const [local, setLocal] = useState<Record<string, Local>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const opened = useRef<string | null>(null);

  // A stored thread opens once, with its rows and compositions restored from
  // the posts — so the board a reload rebuilds is the board that was there.
  useEffect(() => {
    if (!threadId || !thread.ready || opened.current === threadId) return;
    opened.current = threadId;
    george.open(
      restoreFromPosts(threadHistory(thread.posts, thread.chat, threadId), thread.posts),
      threadId,
    );
  }, [threadId, thread.ready, thread.posts, thread.chat, george]);

  useEffect(() => {
    if (!threadId && george.storedThreadId) navigate(`/w/${george.storedThreadId}`, { replace: true });
  }, [threadId, george.storedThreadId, navigate]);

  const answers = useMemo(
    () => george.turns.filter((t): t is AnswerTurn => t.role === 'george'),
    [george.turns],
  );
  const board = useMemo(() => buildBoard(answers), [answers]);
  const busy = george.busy;
  const latest = answers[answers.length - 1] ?? null;

  const patch = useCallback((key: string, p: Local) => {
    setLocal((s) => ({ ...s, [key]: { ...s[key], ...p } }));
  }, []);

  // George putting an object back is him disagreeing with your setting it
  // aside, deliberately and by name — so it returns. Everything else you did
  // to it survives, because he did not touch that.
  useEffect(() => {
    const newest = answers.length - 1;
    setLocal((s) => {
      let next = s;
      for (const o of board) {
        if (o.touched === newest && s[o.key]?.closed) {
          if (next === s) next = { ...s };
          next[o.key] = { ...next[o.key], closed: false };
        }
      }
      return next;
    });
  }, [answers.length, board]);

  const ask = useCallback((text: string, subjects = selection) => {
    const q = text.trim();
    if (!q) return;
    setDraft('');
    const desk = {
      ...(subjects.length ? {
        selection: {
          dimension: subjects[0].dimension,
          subjects: subjects
            .filter((s) => s.dimension === subjects[0].dimension)
            .map((s) => ({ id: s.label, label: s.label })),
        },
      } : {}),
      ...(board.length ? { board: boardContext(answers, board, local, focused) } : {}),
    };
    void george.ask(q, Object.keys(desk).length ? { desk } : {});
  }, [george, selection, answers, board, local, focused]);

  const on: TileActions = useMemo(() => ({
    open: (key) => setFocused((f) => (f === key ? null : key)),
    pick: (label, dimension) => setSelection((s) => (
      s.some((x) => x.label === label)
        ? s.filter((x) => x.label !== label)
        : [...s, { label, dimension: dimension ?? 'store' }]
    )),
    why: (label, dimension) => ask('why?', [{ label, dimension: dimension ?? 'store' }]),
    aside: (key) => { patch(key, { closed: true }); setFocused((f) => (f === key ? null : f)); },
    patch,
  }), [ask, patch]);

  const aside = board.filter((o) => local[o.key]?.closed);
  const clear = useCallback(() => {
    george.reset(); setSelection([]); setLocal({}); setFocused(null); navigate('/');
  }, [george, navigate]);

  return (
    <div className="room">
      <Rail busy={busy} onNew={clear} />

      <main className="r-main">
        {board.length === 0 ? (
          <Opening loading={Boolean(threadId) && thread.loading} />
        ) : (
          <>
            {busy && latest && latest.toolCalls.length > 0 && (
              <p className="r-label" style={{ color: 'rgb(var(--george))', marginBottom: 16 }}>
                {describe(latest)}
              </p>
            )}
            <Board
              answers={answers}
              board={board}
              local={local}
              focused={focused}
              selection={selection.map((s) => s.label)}
              live={busy}
              on={on}
            />
          </>
        )}

        {latest?.error && <p className="r-note" style={{ marginTop: 18 }}>{latest.error}</p>}

        {aside.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 30 }}>
            <span className="r-label">set aside</span>
            {aside.map((o) => (
              <button key={o.key} type="button" className="r-chip"
                      onClick={() => patch(o.key, { closed: false })}>
                {o.key} ↩
              </button>
            ))}
          </div>
        )}
      </main>

      <div className="r-line-wrap">
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          {selection.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {selection.map((s) => (
                <button key={s.label} type="button" className="r-chip"
                        style={{ pointerEvents: 'auto', borderColor: 'rgba(255,246,230,.3)' }}
                        onClick={() => on.pick(s.label, s.dimension)}>
                  {s.label} ×
                </button>
              ))}
            </div>
          )}
          <div className="r-line">
            <input
              value={draft}
              placeholder={
                selection.length ? 'say what to do with these'
                  : busy ? 'you can redirect while he reads'
                  : 'say something, or touch something above'
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ask(draft);
                if (e.key === 'Escape') { setDraft(''); setSelection([]); }
              }}
              aria-label="Say something to George"
            />
            {busy ? (
              <button type="button" className="r-send" onClick={() => george.cancel()}
                      title="Stop" aria-label="Stop"
                      style={{ background: 'rgba(255,255,255,.12)', color: 'var(--ink)' }}>■</button>
            ) : (
              <button type="button" className="r-send" onClick={() => ask(draft)}
                      disabled={!draft.trim()} title="Send" aria-label="Send">↑</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The cold open. A greeting and nothing else — asked for in those words. The
 * openers below it are the shortest way into the three things he actually does
 * on a normal morning, not a menu.
 */
function Opening({ loading }: { loading: boolean }) {
  if (loading) return <p className="r-label" style={{ paddingTop: '16vh' }}>Opening…</p>;
  return (
    <div style={{ paddingTop: '14vh', maxWidth: 640 }}>
      <p className="r-greeting">{greeting()}</p>
      <p className="r-greeting-sub">What are we looking at?</p>
      {/*
        NOTHING SUGGESTED HERE. Three example questions used to sit on this
        screen — mine, not George's. Proposing what to ask is his job and he
        has the whole business to draw on; a hardcoded list is me pretending to
        be him, and it is exactly the habit this build keeps falling into.
        Until he speaks first (the briefing), the door stays open and empty.
      */}
    </div>
  );
}

function greeting(): string {
  const hour = Number(new Date().toLocaleString('en-PH', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));
  if (hour < 12) return 'Morning.';
  if (hour < 18) return 'Afternoon.';
  return 'Evening.';
}

/**
 * What George is doing, in words, from the frames — never from his prose, so
 * it may be read as fact. Names every read in flight, because two running
 * together used to look like one.
 */
const READING: Record<string, string> = {
  get_sales: 'reading sales', get_stock: 'counting stock', get_stock_history: 'reading stock over time',
  get_replenishment: 'reading the replenishment plan', get_purchase_plan: 'drafting the order',
  get_purchasing: 'reading purchase orders', get_movement: 'reading transfers',
  get_product: 'looking up a product', get_vending: 'reading vending',
  get_vending_stock: 'reading vending stock', get_dead_stock: 'finding dead stock',
  get_cost_history: 'reading costs', get_brief: 'reading the morning brief',
  view_page: 'reading the page',
};

function describe(turn: AnswerTurn): string {
  const inFlight = turn.toolCalls.filter((c) => !c.result && READING[c.tool]);
  if (inFlight.length) {
    return `${[...new Set(inFlight.map((c) => READING[c.tool]))].join(', ')}…`;
  }
  const landed = turn.toolCalls.filter((c) => c.result && !c.result.error && READING[c.tool]).length;
  if (landed) return turn.text ? 'writing…' : 'working out what this means…';
  return 'thinking…';
}
