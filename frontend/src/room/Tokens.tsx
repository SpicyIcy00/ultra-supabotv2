/**
 * THE SCOPE OF THE WORK ON SCREEN, DRAWN — and movable (P1.j).
 *
 * One row under the reading: the window these figures are over, the shop they
 * are filtered to, how they are cut, how many there are. Each is an argument
 * the loop accepted, read back off the record; tapping one offers what it
 * could be instead and choosing costs a replay, not a question.
 *
 * IT IS NOT A CLAIM ABOUT ANYTHING. A token is an argument's own value and a
 * list the definitions bound — never a figure, never a word George wrote, and
 * never a count of something loaded (UI rule 8). Nothing is drawn until a
 * read is on screen carrying the argument, and a token whose reads disagree
 * about the value is not drawn at all.
 *
 * TWO THINGS WEAR NO COLOUR HERE. A moved token is marked by its border and
 * its word, and the one token that costs a turn — "not what I meant" — is
 * drawn like every other one: the accent means "needs you" and nothing else
 * (UI rule 5).
 */
import { useState } from 'react';
import type { DeskAlternative } from '../services/deskApi';
import type { DrawnToken } from './tokenShape';

export interface TokensProps {
  tokens: DrawnToken[];
  /** The word for the one token that costs a turn, from the definitions. */
  correction?: string;
  /** True while a replay is in flight — the row says so rather than freezing. */
  moving?: boolean;
  /**
   * The tool's own sentence when a replay was refused, whole. A window still
   * in progress is refused by name, and a refusal that says nothing would
   * leave the old figures under a new label (UI rule 4).
   */
  refusal?: string | null;
  onMove(token: DrawnToken, alternative: DeskAlternative): void;
  onCorrect(): void;
}

export function Tokens(p: TokensProps) {
  const [open, setOpen] = useState<string | null>(null);
  if (!p.tokens.length && !p.correction) return null;
  const chosen = p.tokens.find((t) => t.argument === open) ?? null;

  return (
    <div className="r-tokens">
      <div className="r-token-row">
        {p.tokens.map((token) => (
          <button
            key={token.argument}
            type="button"
            className="r-token"
            aria-pressed={open === token.argument}
            aria-label={`${token.label}: ${token.valueLabel}`}
            onClick={() => setOpen((o) => (o === token.argument ? null : token.argument))}
          >
            <span className="r-token-what">{token.label}</span>
            <span className="r-token-is">{token.valueLabel}</span>
          </button>
        ))}
        {p.correction && (
          // THE ONE THAT COSTS A TURN, and it says so. Everything else in
          // this row answers without asking him; this one exists because he
          // got it wrong, and the only thing worth doing with that is telling
          // him so and having him keep it.
          <button type="button" className="r-token r-token--ask" onClick={p.onCorrect}>
            <span className="r-token-is">{p.correction}</span>
          </button>
        )}
        {p.moving && <span className="r-label r-token-busy">reading…</span>}
      </div>

      {chosen && (
        <div className="r-token-open">
          {chosen.alternatives.map((alternative) => (
            <button
              key={alternative.label}
              type="button"
              className="r-chip"
              aria-pressed={alternative.label === chosen.valueLabel}
              disabled={alternative.label === chosen.valueLabel}
              onClick={() => { setOpen(null); p.onMove(chosen, alternative); }}
            >
              {alternative.label}
            </button>
          ))}
        </div>
      )}

      {/* The tool's own words, unrephrased. It sits above the figures it is
          about, like every other caveat on this page. */}
      {p.refusal && <p className="r-caveat r-token-refusal">{p.refusal}</p>}
    </div>
  );
}
