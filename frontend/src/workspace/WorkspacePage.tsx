/**
 * The workspace: one piece of work, composed by George, on a calm ground.
 *
 * WHAT IS ON SCREEN. The newest answer's composition, at full size. Earlier
 * turns of the same thread sit beneath it, folded to one line each — history,
 * not a feed. Your own words are small and marginal; the things George made
 * take the room.
 *
 * WHAT IS NOT HERE. No home screen and no dashboard: when nothing has been
 * asked the ground is quiet with the mark and a line, because George at rest
 * is quiet presence, not an empty state asking to be filled. No chat bubbles.
 * No layout the client decides — every widget on screen is one George chose.
 *
 * Built beside the desk at /w2. It uses the same stream, the same thread
 * loading and the same passcode session; only the surface is new.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGeorge } from '../hooks/useGeorge';
import { useThread } from '../hooks/useThread';
import { threadHistory } from '../components/george/threadHistory';
import type { GeorgeTurn } from '../types/george';
import { restoreFromPosts } from './composition';
import { Composition } from './render';
import './workspace.css';

type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

export default function WorkspacePage() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const george = useGeorge();
  const thread = useThread(threadId ?? '');
  const [selection, setSelection] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const opened = useRef<string | null>(null);

  // A stored thread opens once into the stream, exactly as the desk does.
  useEffect(() => {
    if (!threadId || !thread.ready || opened.current === threadId) return;
    opened.current = threadId;
    george.open(restoreFromPosts(threadHistory(thread.posts, thread.chat, threadId), thread.posts), threadId);
  }, [threadId, thread.ready, thread.posts, thread.chat, george]);

  // A new thread started here gets its own address, so a reload keeps it.
  useEffect(() => {
    if (!threadId && george.storedThreadId) navigate(`/w2/${george.storedThreadId}`, { replace: true });
  }, [threadId, george.storedThreadId, navigate]);

  const answers = useMemo(() => george.turns.filter((t): t is AnswerTurn => t.role === 'george'), [george.turns]);
  const latest = answers[answers.length - 1] ?? null;
  const earlier = answers.slice(0, -1);
  const busy = george.busy;
  const asked = useMemo(() => {
    const users = george.turns.filter((t) => t.role === 'user');
    return users[users.length - 1]?.text ?? '';
  }, [george.turns]);

  const say = useCallback((text: string) => {
    const q = text.trim();
    if (!q) return;
    setDraft('');
    void george.ask(q, selection.length ? {
      desk: { selection: { dimension: 'store', subjects: selection.map((s) => ({ id: s, label: s })) } },
    } : {});
  }, [george, selection]);

  const toggle = useCallback((subject: string) => {
    setSelection((s) => (s.includes(subject) ? s.filter((x) => x !== subject) : [...s, subject]));
  }, []);

  return (
    <div className="ws" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* The top line: who, where, and the mark. Nothing else. */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px clamp(18px,4vw,48px) 0' }}>
        <span className={`ws-mark ${busy ? 'ws-mark--busy' : ''}`} />
        <span className="ws-mk" style={{ color: 'var(--ws-ink-2)' }}>Aji Ichiban</span>
        {asked && <span className="ws-mk" style={{ marginLeft: 6 }}>› {asked.length > 60 ? asked.slice(0, 60) + '…' : asked}</span>}
        <span style={{ flex: 1 }} />
        <button className="ws-word" onClick={() => { george.reset(); setSelection([]); navigate('/w2'); }}>new</button>
      </header>

      <main style={{ flex: 1, padding: '22px clamp(18px,4vw,48px) 140px', maxWidth: 1240, width: '100%', margin: '0 auto' }}>
        {latest ? (
          <>
            {busy && latest.toolCalls.length > 0 && (
              <p className="ws-mk" style={{ color: 'var(--ws-george)', marginBottom: 14 }}>
                {describe(latest)}
              </p>
            )}
            <Composition turn={latest} selection={selection} onSelect={toggle} live={busy} />
            {latest.error && <p className="ws-note" style={{ marginTop: 16 }}>{latest.error}</p>}
          </>
        ) : (
          <Quiet loading={Boolean(threadId) && thread.loading} />
        )}

        {earlier.length > 0 && (
          <div style={{ marginTop: 44 }}>
            <p className="ws-mk">earlier in this work</p>
            {earlier.slice().reverse().map((t, i) => (
              <Earlier key={t.at + i} turn={t} question={questionBefore(george.turns, t)} selection={selection} onSelect={toggle} />
            ))}
          </div>
        )}
      </main>

      {/* The line. Small, at the foot, with what is selected beside it. */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '0 clamp(18px,4vw,48px) 22px', pointerEvents: 'none' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
            {selection.map((s) => (
              <button key={s} className="ws-pill ws-pill--george" onClick={() => toggle(s)} style={{ border: 0, cursor: 'pointer' }}>{s} ×</button>
            ))}
            {!selection.length && !busy && !latest && ['how are we doing?', 'what do I need to order from Seikyo?', 'what is out of stock longest?'].map((w) => (
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

function Earlier({ turn, question, selection, onSelect }: { turn: AnswerTurn; question: string; selection: string[]; onSelect: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button className="ws-word" onClick={() => setOpen((o) => !o)} style={{ color: open ? 'var(--ws-ink)' : undefined }}>
        {open ? '▾' : '▸'} {question || 'earlier'}
      </button>
      {open && (
        <div style={{ marginTop: 10, opacity: 0.92 }}>
          <Composition turn={turn} selection={selection} onSelect={onSelect} live={false} />
        </div>
      )}
    </div>
  );
}

function questionBefore(turns: GeorgeTurn[], answer: AnswerTurn): string {
  const i = turns.indexOf(answer);
  for (let j = i - 1; j >= 0; j--) if (turns[j].role === 'user') return turns[j].text;
  return '';
}

/** What George is doing, in words, from the calls — never from his prose. */
function describe(turn: AnswerTurn): string {
  const names: Record<string, string> = {
    get_sales: 'reading sales', get_stock: 'counting stock', get_stock_history: 'reading stock over time',
    get_replenishment: 'reading the replenishment plan', get_purchase_plan: 'drafting the order',
    get_purchasing: 'reading purchase orders', get_movement: 'reading transfers', get_product: 'looking up a product',
    get_vending: 'reading vending', get_vending_stock: 'reading vending stock', get_dead_stock: 'finding dead stock',
    get_cost_history: 'reading costs', get_brief: 'reading the morning brief',
  };
  const pending = turn.toolCalls.filter((c) => !c.result && names[c.tool]);
  const last = pending[pending.length - 1] ?? turn.toolCalls[turn.toolCalls.length - 1];
  return last ? `${names[last.tool] ?? 'working'}…` : 'working…';
}
