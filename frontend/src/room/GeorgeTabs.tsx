/**
 * George's own tabs, inside the Supabot chrome.
 *
 * WAS A FIXED VERTICAL RAIL (`Rail.tsx`, deleted 2026-09-13). George used to
 * own the whole viewport, so a rail pinned to the left edge was the only
 * navigation it needed. George is a page in Supabot BI now — one item in the
 * sidebar, like Dashboard or Warehouse — and a second vertical rail beside the
 * app's own would be chrome inside chrome. The owner: "can you put george just
 * in the tabs of the main page."
 *
 * So George's screens become tabs on George's page, which is the pattern the
 * app already uses: Dashboard owns Stores and Vending, Warehouse owns
 * Replenishment and Barcodes. Each tab keeps its own URL, so links, bookmarks
 * and the back button all still work.
 *
 * Workflows joins them. It was routed but reachable only from one link inside
 * Inbox, which is not navigation.
 */
import { NavLink } from 'react-router-dom';
import { useRoomTheme } from './theme';

interface GeorgeTabsProps {
  /** True while a turn is running — the mark beside the name breathes. */
  busy?: boolean;
  /** Approvals waiting. A loaded, non-zero count only (UI rule 8). */
  needsYou?: number;
  /** Clear the board. Kept objects survive it. */
  onNew: () => void;
}

const TABS = [
  { to: '/george', label: 'Board', end: true },
  { to: '/inbox', label: 'Needs you', end: true },
  { to: '/pages', label: 'Kept', end: false },
  { to: '/workflows', label: 'Running', end: true },
];

export function GeorgeTabs({ busy, needsYou, onNew }: GeorgeTabsProps) {
  const [theme, toggleTheme] = useRoomTheme();
  return (
    <div className="r-tabs">
      <nav className="r-tabs-list" aria-label="George">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `r-tab${isActive ? ' r-tab--on' : ''}`}
          >
            {tab.label === 'Board' && (
              <span className={`r-mark ${busy ? 'r-mark--busy' : ''}`} aria-hidden="true" />
            )}
            {tab.label}
            {/* The one reserved colour, on a loaded and non-zero count only
                (CLAUDE.md UI rule 5, and rule 8 for the "loaded" half). */}
            {tab.label === 'Needs you' && needsYou !== undefined && needsYou > 0 && (
              <span className="r-tab-count">{needsYou}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="r-tabs-acts">
        <button type="button" className="r-tab-btn" onClick={toggleTheme}
                title={theme === 'dark' ? 'Lights on' : 'Lights off'}
                aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
                aria-pressed={theme === 'light'}>
          <span aria-hidden="true">{theme === 'dark' ? '☼' : '☾'}</span>
        </button>
        <button type="button" className="r-tab-btn" onClick={onNew}
                title="Clear the board" aria-label="Clear the board">
          <span aria-hidden="true">＋</span>
        </button>
      </div>
    </div>
  );
}
