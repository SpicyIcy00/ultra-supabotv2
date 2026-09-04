/**
 * /george/preview — the river's two layouts, side by side, from fixtures.
 *
 * OUTSIDE THE APP CHROME, exactly as /packing/:listId/print is: this renders
 * without the sidebar, without auth, and without a backend, so a layout can be
 * looked at and argued about before any of it is wired up. It is a design
 * surface and nothing links to it.
 *
 * MOBILE IS THE TRUTH (UI rule 7). The phone frame on the left is the real
 * layout; the desktop frame is the same column with room either side. They
 * render the SAME components from the SAME fixture, so a difference between
 * them is a real responsive difference and never two implementations drifting.
 *
 * The fixture is one of every kind — including a post with no timestamp, which
 * is the case UI rule 6 exists for and therefore the case a preview must show.
 */
import { RiverFeed } from '../components/george/RiverFeed';
import { MarkAvatar } from '../components/george/PostCard';
import { RIVER_FIXTURE } from '../components/george/riverFixture';

/**
 * The status band: store health, per-source freshness, and what needs you.
 *
 * Static here — C.4 wires it. It is in the preview because its HEIGHT is the
 * question: it sits above the river on a phone, and anything more than one
 * line pushes the newest post off the first screen.
 */
function StatusBand({ needsYou }: { needsYou: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-george-line px-3 py-2">
      <div className="flex items-center gap-1" title="7 active retail stores">
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-george-slate/50"
            aria-hidden
          />
        ))}
      </div>
      <span className="text-[11px] text-george-muted">read 06:00</span>
      <span className="flex-1" />
      {/* The one place the accent is allowed on this band, and only when the
          count came back non-zero (UI rules 5 and 8). */}
      {needsYou > 0 && (
        <span className="flex items-center gap-1 text-[11px] text-george-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-george-accent" aria-hidden />
          {needsYou} needs you
        </span>
      )}
    </div>
  );
}

function Composer() {
  return (
    <div className="flex items-center gap-2 border-t border-george-line px-3 py-2.5">
      <MarkAvatar className="h-8 w-8" />
      <div className="flex-1 rounded-full border border-george-line bg-george-paper px-3.5 py-2 text-[14px] text-george-muted">
        Tell George…
      </div>
    </div>
  );
}

function Frame({
  title,
  note,
  width,
  height,
}: {
  title: string;
  note: string;
  width: number;
  height: number;
}) {
  return (
    <div>
      <p className="mb-1 font-george-serif text-[14px] text-george-navy">{title}</p>
      <p className="mb-2 max-w-[26rem] text-[11px] leading-relaxed text-george-slate">{note}</p>
      <div
        className="flex flex-col overflow-hidden rounded-xl border border-george-line bg-george-cream"
        style={{ width, height }}
      >
        <StatusBand needsYou={1} />
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mx-auto max-w-2xl">
            <RiverFeed posts={RIVER_FIXTURE} hasOlder />
          </div>
        </div>
        <Composer />
      </div>
    </div>
  );
}

export default function RiverPreview() {
  return (
    <div className="min-h-screen bg-george-paper p-6 font-sans text-george-navy">
      <h1 className="font-george-serif text-xl">The river</h1>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-george-slate">
        One of every post kind, from a fixture with real field shapes. Notices sit
        above the body on every kind; receipts sit beneath; every post carries a
        time, including the last one, whose time was never recorded and which says
        so rather than showing an empty slot.
      </p>

      <div className="mt-6 flex flex-wrap items-start gap-8">
        <Frame
          title="Phone — the real layout"
          note="Status band, the river, and “Tell George…”. The centre column is the whole screen."
          width={390}
          height={780}
        />
        <Frame
          title="Desktop — the same column with room either side"
          note="Not a different layout. Pages, workflows and watches become a panel when reached for."
          width={760}
          height={780}
        />
      </div>
    </div>
  );
}
