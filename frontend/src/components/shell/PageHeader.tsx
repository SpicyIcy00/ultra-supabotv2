/**
 * The top of a Bob page.
 *
 * ONE HEADER, so Inbox, Pages and Workflows read as rooms in one place
 * rather than three screens that happen to share a rail. Each was setting
 * its own title size and its own explanatory paragraph, and the three had
 * drifted apart by a few pixels and a lot of tone.
 *
 * HIERARCHY WITHOUT FURNITURE. A serif title, an optional line of standing
 * fact beneath it, and a hairline rule to close the header — that is the
 * whole vocabulary. No cards, no badges, no icons, no coloured chips: the
 * levels are carried by size, weight and the space between them, which is
 * what lets the page below stay quiet.
 *
 * THE `meta` LINE IS FOR STANDING FACTS, not for findings. "Re-runs when
 * opened" belongs here; a count that came back from a query does not,
 * because a claim about the world has to render from a loaded result and
 * say so while it does not know (UI rule 8). Those belong in the page body
 * where the loading and failed states can be told apart.
 */
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  meta,
  children,
}: {
  title: string;
  /** A standing fact about the page. Never a number from a query. */
  meta?: string;
  /** Anything that belongs beside the title — an action, a back link. */
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 border-b border-bob-line pb-5">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-bob-serif text-[30px] leading-none tracking-[-0.01em] text-bob-navy md:text-[34px]">
          {title}
        </h1>
        {children}
      </div>
      {meta && (
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-bob-slate">{meta}</p>
      )}
    </header>
  );
}

/**
 * A small-caps label over a group of things.
 *
 * The only sectioning device on these pages. It is a LABEL, not a heading:
 * it names what follows and gets out of the way, so a page can have two or
 * three groups without acquiring two or three boxes.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] uppercase tracking-[0.12em] text-bob-muted">{children}</p>
  );
}
