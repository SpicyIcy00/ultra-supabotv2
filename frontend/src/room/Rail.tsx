/**
 * The rail — the only permanent thing on screen.
 *
 * The way back to Supabot, George's mark, what needs you, the pages you kept
 * and the rules that run. Everything else is one surface that becomes
 * whatever you are doing.
 *
 * GEORGE TAKES THE WHOLE SCREEN (the owner, 2026-09-13: "when you open george
 * in supabot tab it should cover the whole screen, no more supabot, but there
 * should be a back button on sidebar"). Opening George from the Supabot
 * sidebar leaves that chrome behind entirely, so this rail is the only
 * navigation there is while you are here — which is why the back arrow is its
 * first item rather than an afterthought at the bottom.
 *
 * Drawing George inside the Supabot chrome was tried for one commit and
 * reverted: two vertical rails side by side, and the board — which wants the
 * width of the screen — squeezed into a content column.
 *
 * The mark draws a real state and nothing else: it breathes while a turn is
 * running and is still when it is not. There is no caption under it — its
 * behaviour is the caption. "Waiting for you" has no frame behind it and is
 * not drawn.
 *
 * NO COUNT UNTIL SOMETHING IS LOADED. "Nothing needs you" is an assertion
 * about the world, and this rail never makes one it has not checked — the
 * badge appears when the approvals query has answered, and not before.
 */
import { NavLink, useNavigate } from 'react-router-dom';
import { useRoomTheme } from './theme';

export interface RailProps {
  /** True while a turn is running. The mark's only input. */
  busy: boolean;
  /**
   * How many decisions are waiting, once that has actually been read.
   * `undefined` means not yet known — draw nothing rather than a zero.
   */
  needsYou?: number;
  onNew(): void;
}

export function Rail({ busy, needsYou, onNew }: RailProps) {
  const navigate = useNavigate();
  const [theme, toggleTheme] = useRoomTheme();
  return (
    <nav className="r-rail" aria-label="George">
      {/* THE WAY OUT, AND IT COMES FIRST. George takes the whole screen — the
          Supabot chrome is not drawn behind it — so this is the only route
          back to the Dashboard, the Warehouse and every other page. It sits
          at the top because that is where a person looks for a way back, and
          it is the one item here that leaves George at all.
          Before 2026-09-12 it did not exist, and the rest of Supabot BI was
          reachable from nowhere a person stood: still routed, still allowed,
          and invisible. A surface you cannot leave is not a page. */}
      <NavLink to="/dashboard" className="r-rail-btn" title="Back to Supabot"
               aria-label="Back to Supabot BI" style={{ marginTop: 2 }}>
        <span aria-hidden="true">←</span>
      </NavLink>

      <button
        type="button"
        className="r-rail-btn"
        onClick={() => navigate('/george')}
        aria-label="George — the board"
        title="The board"
      >
        <span className={`r-mark ${busy ? 'r-mark--busy' : ''}`} />
      </button>

      <NavLink to="/inbox" className="r-rail-btn" title="Needs you"
               aria-label={needsYou ? `Needs you, ${needsYou} waiting` : 'Needs you'}>
        {({ isActive }) => (
          <>
            <span aria-hidden="true" style={{ opacity: isActive ? 1 : 0.85 }}>▲</span>
            {needsYou !== undefined && needsYou > 0 && (
              <span className="r-rail-count">{needsYou}</span>
            )}
          </>
        )}
      </NavLink>

      <NavLink to="/pages" className="r-rail-btn" title="Kept" aria-label="Kept pages">
        <span aria-hidden="true">▣</span>
      </NavLink>

      {/* Running — the saved rules and what they last did. It was routed but
          reachable only from one link inside Inbox, which is not navigation:
          a person who had not opened an approval could not find it at all. */}
      <NavLink to="/workflows" className="r-rail-btn" title="Running"
               aria-label="Running — saved rules">
        <span aria-hidden="true">⟳</span>
      </NavLink>

      <span style={{ flex: 1 }} />

      <button type="button" className="r-rail-btn r-rail-btn--theme" onClick={toggleTheme}
              title={theme === 'dark' ? 'Lights on' : 'Lights off'}
              aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              aria-pressed={theme === 'light'}>
        <span aria-hidden="true">{theme === 'dark' ? '\u263c' : '\u263e'}</span>
      </button>

      <button type="button" className="r-rail-btn" onClick={onNew} title="Clear the board"
              aria-label="Clear the board">
        <span aria-hidden="true">＋</span>
      </button>
    </nav>
  );
}
