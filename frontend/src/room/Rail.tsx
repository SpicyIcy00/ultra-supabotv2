/**
 * The rail — the only permanent thing on screen.
 *
 * George's mark, what needs you, and the pages you kept. Everything else is
 * one surface that becomes whatever you are doing.
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
      <button
        type="button"
        className="r-rail-btn"
        onClick={() => navigate('/george')}
        aria-label="George"
        style={{ marginTop: 2 }}
      >
        <span className={`r-mark ${busy ? 'r-mark--busy' : ''}`} />
      </button>

      {/* THE WAY OUT. George is a page in Supabot BI, not the app, and until
          2026-09-12 this rail offered only George's own screens — so a person
          who landed here had no route back to the dashboard, the warehouse or
          any other page, all of which were still routed and still allowed.
          A surface you cannot leave is not a page. */}
      <NavLink to="/dashboard" className="r-rail-btn" title="Back to Supabot"
               aria-label="Back to Supabot BI">
        <span aria-hidden="true">←</span>
      </NavLink>

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
