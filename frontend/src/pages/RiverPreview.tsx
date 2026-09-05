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
import { StatusBand } from '../components/george/StatusBand';
import type { StatusQuery } from '../components/george/statusState';
import { MarkAvatar } from '../components/george/PostCard';
import { RIVER_FIXTURE } from '../components/george/riverFixture';

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

/**
 * A loaded status result, so the preview shows the band's KNOWN state. The
 * unknown states are covered by statusState.test.ts, which is where they can
 * be asserted rather than eyeballed.
 */
const PREVIEW_STATUS: StatusQuery = {
  status: 'success',
  data: {
    stores: [
      { name: 'Rockwell', flagged: false }, { name: 'Greenhills', flagged: true },
      { name: 'Magnolia', flagged: false }, { name: 'North Edsa', flagged: false },
      { name: 'Fairview', flagged: true }, { name: 'Opus', flagged: false },
      { name: 'Shang', flagged: false },
    ],
    stores_known: true,
    sources: [
      { table: 'new_transactions', read_at: '2026-09-05T06:00:11Z' },
      { table: 'inventory_snapshots', read_at: '2026-09-04T22:00:09Z' },
    ],
    as_of: '2026-09-05',
  },
};

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
        <StatusBand query={PREVIEW_STATUS} needsYou={1} onOpenApprovals={() => {}} />
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
