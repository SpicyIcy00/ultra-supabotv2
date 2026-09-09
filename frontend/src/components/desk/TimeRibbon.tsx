/**
 * Time as a control over the work, not a filter in a form.
 *
 * A WINDOW CHANGE IS A REPLAY, NOT A QUESTION. Choosing another window
 * re-runs the calls already on screen with the window argument moved and
 * nothing else, through the validation a pin passes — no model, no turn, no
 * new answer (metrics.yaml surface.desk.replay). The figures that come back
 * carry their own receipts and their own read time.
 *
 * A PARTIAL WINDOW IS OFFERED ONLY WHERE IT IS HONEST. A comparison against a
 * window still in progress is a fall by construction, and the tool refuses it
 * by name; so where the work is compared, the presets that include today are
 * drawn as unavailable with the closed one they name instead. That refusal is
 * the definitions', read from the server, and never a rule written here.
 *
 * THE READING IS NOT REPLAYED. George has not looked at the new figures, so
 * the work says its reading belongs to the earlier window until he is asked.
 */
import type { DeskWindow } from '../../types/george';
import type { DeskWindowDef } from '../../services/deskApi';

/** The preset's name in a reader's words. "last_7_days" is not a word. */
export function windowWords(name: string): string {
  const words = name.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

export interface TimeRibbonProps {
  windows: DeskWindowDef[];
  /** The window the work is on now: the replay's, or the work's own. */
  current: DeskWindow | null;
  /**
   * The window being READ, whose rows have not arrived. Drawn as pending and
   * never as current: a chip that moved before the figures did put a window
   * label over figures read for another one, which is the "mixed old and new
   * data" a person cannot detect and must never be shown.
   */
  pending?: DeskWindow | null;
  /** True when the figures on screen carry a comparison. */
  compared: boolean;
  onChoose: (window: DeskWindow) => void;
  busy?: boolean;
}

export function TimeRibbon({ windows, current, pending = null, compared, onChoose, busy = false }: TimeRibbonProps) {
  if (windows.length === 0) return null;
  const currentName = current?.kind === 'preset' ? current.name : undefined;
  const pendingName = pending?.kind === 'preset' ? pending.name : undefined;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1" role="group" aria-label="Window" data-ribbon>
      {windows.map((w) => {
        // The tool refuses a comparison over a window still in progress.
        const refused = compared && w.includes_partial_day;
        const here = w.name === currentName;
        const reading = w.name === pendingName;
        const title = refused
          ? w.closed_alternative
            ? `That window is still in progress, so a comparison against it is a fall by construction. ${windowWords(w.closed_alternative)} compares whole periods.`
            : 'That window is still in progress, so a comparison against it is a fall by construction.'
          : windowWords(w.name);
        return (
          <button
            key={w.name}
            type="button"
            disabled={refused || busy}
            aria-current={here ? 'true' : undefined}
            aria-busy={reading ? 'true' : undefined}
            data-reading={reading ? 'true' : undefined}
            title={title}
            data-window={w.name}
            data-refused={refused ? 'true' : undefined}
            onClick={() => onChoose({ kind: 'preset', name: w.name })}
            className={`min-h-touch rounded-full px-3 py-1 text-[12px] transition-colors ${
              here
                ? 'bg-george-navy text-george-cream'
                : reading
                  ? 'bg-george-paper text-george-navy'
                  : refused
                    ? 'cursor-not-allowed text-george-muted/60'
                    : 'text-george-slate hover:bg-george-paper hover:text-george-navy'
            }`}
          >
            {windowWords(w.name)}
          </button>
        );
      })}
      {/* The figures on screen are still the OLD window's until the rows
          land, and the line says exactly that rather than leaving a reader to
          assume the numbers already moved. */}
      {busy && (
        <span className="ml-2 text-[12px] text-george-muted">
          Reading{pendingName ? ` ${windowWords(pendingName).toLowerCase()}` : ''}… figures below are still the earlier window’s
        </span>
      )}
    </div>
  );
}
