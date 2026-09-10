/**
 * The workspace: a board you work on, with George.
 *
 * WHAT IS ON SCREEN. The board — every object George has put there, still
 * drawing the read it was made from, at the weight he gave it. It is not the
 * last answer. Ask about Seikyo, then ask about North Edsa, and the draft
 * order is still there; that is the difference between a place and a screen,
 * and until 2026-09-10 this page had the screen.
 *
 * WHAT IS YOURS. Bring something forward, set something aside, sort a table.
 * Instant, local, and never sent to George as though he had decided it. Only a
 * new FACT costs a turn.
 *
 * WHAT IS NOT HERE. No stack of past answers — the conversation is not the
 * visual history of the work, and a follow-up transforms an object rather than
 * drawing a second one beneath it. What you asked is kept as a trail at the
 * foot, in your own words, because knowing where you have been is not the same
 * as re-reading it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGeorge } from '../hooks/useGeorge';
import { useThread } from '../hooks/useThread';
import { threadHistory } from '../components/george/threadHistory';
import type { GeorgeTurn } from '../types/george';
import { boardContext, buildBoard, type Local } from './board';
import { restoreFromPosts, type Dimension } from './composition';
import { Board } from './render';
import './workspace.css';

type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

export default function WorkspacePage() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const george = useGeorge();
  const thread = useThread(threadId ?? '');
  // A selected subject travels with WHAT KIND OF THING IT IS, read out of the
  // column its name came from. Sending every one of them as a store — which
  // this did until 2026-09-10 — told George a shop had moved when a product
  // had.
  const [selection, setSelection] = useState<{ label: string; dimension: Dimension }[]>([]);
  const [local, setLocal] = useState<Record<string, Local>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const opened = useRef<string | null>(null);

  // A stored thread opens once into the stream, with its rows and its
  // compositions restored from the posts — so the board a reload rebuilds is
  // the board that was there.
  useEffect(() => {
    if (!threadId || !thread.ready || opened.current === threadId) return;
    opened.current = threadId;
    george.open(restoreFromPosts(threadHistory(thread.posts, thread.chat, threadId), thread.posts), threadId);
  }, [threadId, thread.ready, thread.posts, thread.chat, george]);

  useEffect(() => {
    if (!threadId && george.storedThreadId) navigate(`/w2/${george.storedThreadId}`, { replace: true });
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

  // George putting an object back is him disagreeing with your having set it
  // aside, deliberately and by name — so it comes back. Everything else you
  // did to it (a sort, a fold) survives, because he did not touch that.
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

  const aside = board.filter((o) => local[o.key]?.closed);

  const say = useCallback((text: string) => {
    const q = text.trim();
    if (!q) return;
    setDraft('');
    // The board travels with every question, whether or not anything is
    // selected: "why?" asked with nothing clicked still means the thing that
    // is leading, and George could not know what that was until now.
    const desk = {
      ...(selection.length ? {
        selection: {
          // One dimension per selection, and it is the first thing touched —
          // "compare these" over a shop and a product is not a comparison the
          // definitions have, so the first choice sets what is being compared.
          dimension: selection[0].dimension,
          subjects: selection
            .filter((s) => s.dimension === selection[0].dimension)
            .map((s) => ({ id: s.label, label: s.label })),
        },
      } : {}),
      ...(board.length ? { board: boardContext(answers, board, local, focused) } : {}),
    };
    void george.ask(q, Object.keys(desk).length ? { desk } : {});
  }, [george, selection, answers, board, local, focused]);

  const toggle = useCallback((subject: string, dimension: Dimension | null) => {
    setSelection((s) => (s.some((x) => x.label === subject)
      ? s.filter((x) => x.label !== subject)
      : [...s, { label: subject, dimension: dimension ?? 'store' }]));
  }, []);

  const asked = useMemo(
    () => george.turns.filter((t) => t.role === 'user').map((t) => t.text),
    [george.turns],
  );

  return (
    <div className="ws" style={{ display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px clamp(18px,4vw,48px) 0' }}>
        <span className={`ws-mark ${busy ? 'ws-mark--busy' : ''}`} />
        <span className="ws-mk" style={{ color: 'var(--ws-ink-2)' }}>Aji Ichiban</span>
        {board.length > 0 && (
          <span className="ws-mk">{board.length} on the board</span>
        )}
        <span style={{ flex: 1 }} />
        <button className="ws-word" style={{ margin: 0 }} onClick={() => {
          george.reset(); setSelection([]); setLocal({}); setFocused(null); navigate('/w2');
        }}>clear the board</button>
      </header>

      <main style={{ flex: 1, padding: '18px clamp(18px,4vw,48px) 150px', maxWidth: 1240, width: '100%', margin: '0 auto' }}>
        {busy && latest && latest.toolCalls.length > 0 && (
          <p className="ws-mk" style={{ color: 'var(--ws-george)', marginBottom: 14 }}>{describe(latest)}</p>
        )}

        {board.length > 0 ? (
          <Board
            answers={answers}
            board={board}
            local={local}
            focused={focused}
            selection={selection.map((s) => s.label)}
            live={busy}
            onSelect={toggle}
            onFocus={(key) => setFocused((f) => (f === key ? null : key))}
            onClose={(key) => { patch(key, { closed: true }); setFocused((f) => (f === key ? null : f)); }}
            onLocal={patch}
          />
        ) : (
          <Quiet loading={Boolean(threadId) && thread.loading} />
        )}

        {latest?.error && <p className="ws-note" style={{ marginTop: 16 }}>{latest.error}</p>}

        {aside.length > 0 && (
          <div className="ws-aside">
            <span className="ws-mk">set aside</span>
            {aside.map((o) => (
              <button key={o.key} className="ws-pill" style={{ border: 0, cursor: 'pointer' }}
                onClick={() => patch(o.key, { closed: false })}>
                {o.key} ↩
              </button>
            ))}
          </div>
        )}

        {asked.length > 1 && (
          <div style={{ marginTop: 40 }}>
            <p className="ws-mk">what you asked</p>
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              {asked.slice().reverse().map((q, i) => (
                <p key={`${i}-${q}`} className="ws-src">{q}</p>
              ))}
            </div>
          </div>
        )}
      </main>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '0 clamp(18px,4vw,48px) 22px', pointerEvents: 'none' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
            {selection.map((s) => (
              <button key={s.label} className="ws-pill ws-pill--george" onClick={() => toggle(s.label, s.dimension)} style={{ border: 0, cursor: 'pointer' }}>
                {s.label} ×
              </button>
            ))}
            {!selection.length && !busy && board.length === 0 && ['how are we doing?', 'what do I need to order from Seikyo?', 'what is out of stock longest?'].map((w) => (
              <button key={w} className="ws-word" onClick={() => say(w)}>{w}</button>
            ))}
          </div>
          <div className="ws-line">
            <input
              value={draft}
              placeholder={selection.length ? 'say what to do with these' : busy ? 'you can redirect while George reads' : 'say something, or touch something above'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') say(draft); if (e.key === 'Escape') { setDraft(''); setSelection([]); } }}
            />
            {busy ? (
              <button className="ws-send" onClick={() => george.cancel()} title="stop" style={{ background: 'var(--ws-ink-2)' }}>■</button>
            ) : (
              <button className="ws-send" onClick={() => say(draft)} disabled={!draft.trim()} title="send">↑</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Quiet({ loading }: { loading: boolean }) {
  return (
    <div style={{ paddingTop: '18vh', textAlign: 'center' }}>
      <p className="ws-say" style={{ margin: '0 auto', color: 'var(--ws-ink-2)' }}>{loading ? 'Opening…' : ''}</p>
    </div>
  );
}

/**
 * WHAT GEORGE IS DOING, IN WORDS, from the calls and never from his prose.
 *
 * Everything in it is derived from frames, so it may be read as fact — unlike
 * the model's own account of itself. It names every read IN FLIGHT rather than
 * the last one, because two reads running together looked like one, and it
 * says what he is doing with them once they land: the objects that appear on
 * the board are the rest of the answer to "is anything happening?".
 */
const READING: Record<string, string> = {
  get_sales: 'reading sales', get_stock: 'counting stock', get_stock_history: 'reading stock over time',
  get_replenishment: 'reading the replenishment plan', get_purchase_plan: 'drafting the order',
  get_purchasing: 'reading purchase orders', get_movement: 'reading transfers', get_product: 'looking up a product',
  get_vending: 'reading vending', get_vending_stock: 'reading vending stock', get_dead_stock: 'finding dead stock',
  get_cost_history: 'reading costs', get_brief: 'reading the morning brief', view_page: 'reading the page',
};

function describe(turn: AnswerTurn): string {
  const inFlight = turn.toolCalls.filter((c) => !c.result && READING[c.tool]);
  if (inFlight.length) {
    const words = [...new Set(inFlight.map((c) => READING[c.tool]))];
    return `${words.join(', ')}…`;
  }
  // Everything is back and he is deciding what it means and where it goes.
  const landed = turn.toolCalls.filter((c) => c.result && !c.result.error && READING[c.tool]).length;
  if (landed) return turn.text ? 'writing…' : 'working out what this means…';
  return 'thinking…';
}
