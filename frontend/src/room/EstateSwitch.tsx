/**
 * THE ESTATE SWITCH (P2.g) — which business the next question is about.
 *
 * One row, at the top of the column, before anything about the world: it is
 * the thing you set BEFORE you ask, and the Ideal UI puts it exactly there.
 * Pressing a pill costs no model turn and moves no figure — it is scope on the
 * NEXT question, which is why nothing below it redraws when it changes.
 *
 * NOTHING HERE IS A CLAIM ABOUT STATE (UI rule 8). The pills are the served
 * definitions and the count in front of "shops" is a count of places in
 * metrics.yaml, not of anything read: three renderings, and the first two
 * never borrow the third's. Not-yet-loaded draws nothing, because an absent
 * control asserts nothing; a failed read SAYS so, because a switch that is
 * silently missing is a capability a person cannot know they have lost.
 *
 * AND NO COLOUR. The part that is on is marked by its border and its weight.
 * One colour means "needs you" (UI rule 5) and a scope is not an approval.
 */
import type { DeskDefinitions } from '../services/deskApi';
import { pillsFor } from './estate';

export interface EstateSwitchProps {
  defs: DeskDefinitions | null | undefined;
  /** The part picked, or null for the definitions' default. */
  picked: string | null;
  /** True when the definitions could not be read at all. */
  failed?: boolean;
  onPick(key: string): void;
}

export function EstateSwitch(p: EstateSwitchProps) {
  const pills = pillsFor(p.defs, p.picked);

  if (!pills.length) {
    if (!p.failed) return null;
    return (
      <p className="r-label r-estate-out">
        estate · the businesses could not be read, so a question covers all of them
      </p>
    );
  }

  return (
    <div className="r-estate" role="group" aria-label={p.defs?.estate.label ?? 'estate'}>
      <span className="r-label">{p.defs?.estate.label}</span>
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          className={`r-est${pill.on ? ' r-est--on' : ''}`}
          aria-pressed={pill.on}
          onClick={() => p.onPick(pill.key)}
        >
          {pill.label}
          {pill.says && <small>{pill.says}</small>}
        </button>
      ))}
    </div>
  );
}
