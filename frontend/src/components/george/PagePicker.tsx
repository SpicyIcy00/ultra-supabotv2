/**
 * Choose a page: an existing one, a new one, or none.
 *
 * THE ONE PICKER. The Pin dialog and the Move control both render this, so
 * a person who has chosen a page once has chosen a page everywhere. The
 * decision it collects is pageChoice.ts; this only draws it.
 *
 * QUIET BY CONSTRUCTION. Radio rows, no icons, no chips, no colour — a list
 * of names and one text box that appears when "New page" is chosen. Nothing
 * here may wear the approvals colour (UI rule 5): choosing a page is
 * something you are doing, not something waiting on you.
 *
 * THREE STATES FOR THE LIST (UI rule 8). The existing pages come from a
 * query, and until it has answered the picker must not imply there are none:
 * loading says it is checking, failed says the lookup failed, and only a
 * loaded empty list says there are no pages yet.
 */
import { useId } from 'react';
import type { PageChoice } from './pageChoice';

export function PagePicker({
  pages,
  loading,
  failed,
  value,
  onChange,
}: {
  /** The caller's existing page names, once loaded. */
  pages: string[];
  loading: boolean;
  failed: boolean;
  value: PageChoice;
  onChange: (choice: PageChoice) => void;
}) {
  const group = useId();
  const row = 'flex min-h-touch cursor-pointer items-center gap-2 py-1 text-[13px] text-george-navy';
  const radio = 'h-3.5 w-3.5 accent-george-navy';

  return (
    <fieldset className="mt-2.5">
      <legend className="text-[12px] text-george-slate">Page</legend>

      <label className={row}>
        <input
          type="radio"
          name={group}
          className={radio}
          checked={value.kind === 'none'}
          onChange={() => onChange({ kind: 'none' })}
        />
        No page
      </label>

      {loading && <p className="py-1 text-[12px] text-george-muted">Checking your pages…</p>}
      {failed && (
        <p className="py-1 text-[12px] text-george-slate">Couldn’t read your pages.</p>
      )}

      {pages.map((page) => (
        <label key={page} className={row}>
          <input
            type="radio"
            name={group}
            className={radio}
            checked={value.kind === 'existing' && value.page === page}
            onChange={() => onChange({ kind: 'existing', page })}
          />
          {page}
        </label>
      ))}

      <label className={row}>
        <input
          type="radio"
          name={group}
          className={radio}
          checked={value.kind === 'new'}
          onChange={() => onChange({ kind: 'new', name: value.kind === 'new' ? value.name : '' })}
        />
        New page
      </label>

      {value.kind === 'new' && (
        <input
          type="text"
          autoFocus
          value={value.name}
          onChange={(e) => onChange({ kind: 'new', name: e.target.value })}
          placeholder="FFR Overview"
          aria-label="New page name"
          maxLength={100}
          className="mt-1 w-full rounded-lg border border-george-line bg-george-paper px-2.5 py-1.5 text-[13px] text-george-navy outline-none focus:border-george-slate"
        />
      )}
    </fieldset>
  );
}
