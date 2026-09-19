/**
 * THE SIDEBAR — what persists, on the left edge, collapsible (P2S.1(h)).
 *
 * The design's own (`.side` in `ops/ideal/bob-ahead-of-me.html`), after the
 * owner's two fixes: *"too wide … should be space of the sides for a sidebar
 * for pages workflows, automations etc"*, then *"make the sidebar to the left
 * edge and collapseable"*. It is a list of things you OWN — pages, systems,
 * automations, people — with a pip saying running, off or needs you, not a
 * menu of screens. Every item opens what it names.
 *
 * OPEN BY DEFAULT on a window wider than 820px, REMEMBERED per browser, and
 * `[` toggles it anywhere but in a text field. Opening it SLIDES the room and
 * never narrows it (room.css, `beside.composition`).
 *
 * The file keeps its old name so its exemption in `accentUse.test.ts` still
 * reads true: the needs-you count is still here, and still the only accent.
 *
 * NO COUNT AND NO LIST UNTIL SOMETHING IS LOADED (UI rule 8). Each group
 * draws *loading*, *could not be read* and what came back as three different
 * things; "no pages yet" is said only from a loaded, empty result.
 *
 * THE WAY OUT COMES FIRST: Bob takes the whole screen, so the arrow back to
 * Supabot BI is the only route to the Dashboard while you are here.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listPages } from '../services/pagesApi';
import { listWorkflows } from '../services/workflowsApi';
import { listStanding } from '../services/standingApi';
import { listImports } from '../services/storehubImportsApi';
import { useAuthStore } from '../stores/authStore';
import { useRoomTheme } from './theme';

export interface RailProps {
  /** True while a turn is running. */
  busy: boolean;
  /**
   * How many decisions are waiting, once that has actually been read.
   * `undefined` means not yet known — draw nothing rather than a zero.
   */
  needsYou?: number;
  onNew(): void;
  /** The business switch (P2.g), drawn at the top as the design draws it. */
  estate?: ReactNode;
}

const SIDE_KEY = 'bob.side';

/** Open unless the person closed it; closed by default on a narrow window. */
export function restoreSide(width = typeof window === 'undefined' ? 1920 : window.innerWidth): boolean {
  try {
    const got = localStorage.getItem(SIDE_KEY);
    if (got === 'open') return true;
    if (got === 'closed') return false;
  } catch { /* no storage: the width decides */ }
  return width > 820;
}

/** Whether a key press belongs to a field someone is typing in. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useSide(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState<boolean>(() => restoreSide());
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-side', open ? 'open' : 'closed');
    return () => root.removeAttribute('data-side');
  }, [open]);
  const set = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(SIDE_KEY, next ? 'open' : 'closed'); } catch { /* the room still slides */ }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      setOpen((was) => {
        try { localStorage.setItem(SIDE_KEY, was ? 'closed' : 'open'); } catch { /* as above */ }
        return !was;
      });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return [open, set];
}

/** Today, in Manila, as the design writes it: "Tuesday 16 September · 08:04". */
function today(now: Date): string {
  const zone = 'Asia/Manila';
  const day = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone });
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });
  return `${day.replace(',', '')} · ${time}`;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/**
 * WHAT BOB READS THAT ONLY A FILE CAN FILL (P3.h).
 *
 * These are not screens on a menu — they are the records Bob's purchasing,
 * movement and supplier answers stand on, and each is as old as the last file
 * somebody uploaded. The morning of 2026-09-19 said orders were 16 days old and
 * transfers 80; the rail is where that is visible without asking.
 */
const SOURCES: { kind: string; label: string }[] = [
  { kind: 'purchase_orders', label: 'Purchase orders' },
  { kind: 'stock_transfers', label: 'Stock transfers' },
  { kind: 'products', label: 'Products' },
];

/** "3 Sep", in Manila. The heading says what the date is the date OF. */
function imported(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Manila' });
}

/** One group: a heading, and its three renderings. */
function Group<T>({ title, query, empty, children }: {
  title: string;
  query: { isPending: boolean; isError: boolean; data?: T[] };
  empty: string;
  children: (rows: T[]) => ReactNode;
}) {
  return (
    <div className="r-side-grp">
      <h2 className="r-side-h">{title}</h2>
      {query.isPending ? <p className="r-side-quiet">loading</p>
        : query.isError ? <p className="r-side-quiet">could not be read</p>
          : (query.data ?? []).length === 0 ? <p className="r-side-quiet">{empty}</p>
            : children(query.data ?? [])}
    </div>
  );
}

export function Rail({ busy, needsYou, onNew, estate }: RailProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useSide();
  const [theme, toggleTheme] = useRoomTheme();
  const now = useNow();
  const user = useAuthStore((s) => s.user);

  const pages = useQuery({ queryKey: ['pages'], queryFn: listPages, staleTime: 30_000, retry: false });
  const systems = useQuery({ queryKey: ['workflows'], queryFn: listWorkflows, staleTime: 30_000, retry: false });
  const standing = useQuery({ queryKey: ['standing'], queryFn: listStanding, staleTime: 60_000, retry: false });

  // The import ledger is behind its own page key. A role without it is not
  // shown the group at all — a link that bounces is worse than no link — and
  // the read is not attempted, so nobody collects a 403 for opening the room.
  const mayImport = user?.allowed_pages.includes('storehub_imports') ?? false;
  const imports = useQuery({
    queryKey: ['storehub-imports'],
    queryFn: () => listImports(),
    staleTime: 60_000,
    retry: false,
    enabled: mayImport,
  });

  return (
    <>
      <nav className="r-side" aria-label="Bob" data-open={open ? 'yes' : 'no'} aria-hidden={!open}>
        <button type="button" className="r-side-collapse" title="Collapse the sidebar  ["
                aria-label="Collapse the sidebar" onClick={() => setOpen(false)}>‹</button>

        {/* THE WAY OUT, FIRST. See the header. */}
        <NavLink to="/dashboard" className="r-side-back" title="Back to Supabot"
                 aria-label="Back to Supabot BI">← Supabot</NavLink>

        <button type="button" className="r-side-name" onClick={() => navigate('/bob')}
                title="The room" aria-label="Bob — the room">
          Bob{busy && <span className="r-side-busy" aria-label="reading"> · reading</span>}
        </button>
        <p className="r-side-date">{today(now)}</p>

        {estate}

        {/* NEEDS YOU — the one accent on this side of the room, and only for a
            loaded, non-zero count. */}
        <NavLink to="/inbox" className="r-side-it r-side-need" title="Needs you"
                 aria-label={needsYou ? `Needs you, ${needsYou} waiting` : 'Needs you'}>
          <i className={needsYou ? 'r-pip r-pip--need' : 'r-pip'} />
          <span>Needs you</span>
          {needsYou !== undefined && needsYou > 0 && <small className="r-side-count">{needsYou}</small>}
        </NavLink>

        <Group title="Pages" query={pages} empty="nothing kept yet">
          {(rows) => rows.map((page) => (
            <NavLink key={page.id} to={`/pages/${page.id}`} className="r-side-it" title={page.purpose ?? page.title}>
              <i className="r-pip" />
              <span>{page.title}</span>
              <small>{page.pins}</small>
            </NavLink>
          ))}
        </Group>

        <Group title="Systems" query={systems} empty="none built yet">
          {(rows) => rows.map((w) => {
            const v = w.current_version?.version;
            return (
              <NavLink key={w.id} to="/workflows" className="r-side-it" title={w.name}>
                <i className={w.status === 'active' ? 'r-pip r-pip--run' : 'r-pip r-pip--off'} />
                <span>{w.name}</span>
                <small>{[v ? `v${v}` : null, w.status].filter(Boolean).join(' · ')}</small>
              </NavLink>
            );
          })}
        </Group>

        <Group title="Automations · watches" query={standing} empty="none switched on">
          {(rows) => rows.map((q) => (
            <NavLink key={q.id} to="/workflows" className="r-side-it" title={q.question}>
              <i className={q.state === 'switched off' ? 'r-pip r-pip--off' : 'r-pip r-pip--run'} />
              <span>{q.question}</span>
              <small>{q.state === 'switched off' ? 'off' : q.when}</small>
            </NavLink>
          ))}
        </Group>

        {/* SOURCES — the records that arrive as files, and when each last
            did. NOT the `Group` above: that swaps its rows for a line when
            there is nothing, and the way IN to the upload page would vanish
            on the one day it is most needed — the day nothing has been
            imported. So the links are always drawn and only the DATE is a
            loaded thing: loading, not read, a date, or never (UI rule 8). */}
        {mayImport && (
          <div className="r-side-grp">
            <h2 className="r-side-h">Sources · last import</h2>
            {SOURCES.map(({ kind, label }) => {
              const newest = imported(
                (imports.data ?? []).find((row) => row.kind === kind)?.uploaded_at ?? null,
              );
              const said = imports.isPending ? 'loading'
                : imports.isError ? 'not read'
                  : newest ?? 'never';
              return (
                <NavLink key={kind} to="/storehub-imports" className="r-side-it"
                         title={newest ? `${label}: last imported ${newest}` : `${label}: import an export`}>
                  <i className="r-pip" />
                  <span>{label}</span>
                  <small>{said}</small>
                </NavLink>
              );
            })}
          </div>
        )}

        {/* PEOPLE — whoever the system already knows, which today is the person
            signed in. Nobody else is invented to fill the list (S.6). */}
        <div className="r-side-grp">
          <h2 className="r-side-h">People</h2>
          {user ? (
            <NavLink to="/settings" className="r-side-it" title="Your account">
              <i className="r-pip" />
              <span>{user.display_name || user.username}</span>
              <small>{user.role}</small>
            </NavLink>
          ) : <p className="r-side-quiet">nobody signed in</p>}
        </div>

        <div className="r-side-foot">
          <button type="button" className="r-side-tool" onClick={onNew} title="Clear the room"
                  aria-label="Clear the room">＋ new</button>
          <button type="button" className="r-side-tool" onClick={toggleTheme}
                  title={theme === 'dark' ? 'Lights on' : 'Lights off'}
                  aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
                  aria-pressed={theme === 'light'}>
            {theme === 'dark' ? '☼' : '☾'}
          </button>
        </div>
      </nav>
      <button type="button" className="r-side-reopen" title="Open the sidebar  ["
              aria-label="Open the sidebar" hidden={open} onClick={() => setOpen(true)}>›</button>
    </>
  );
}
