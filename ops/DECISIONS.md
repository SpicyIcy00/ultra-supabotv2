# Decisions

Append-only. One entry per session, ten lines or fewer. The reasoning that the
code cannot say, and nothing else. CLAUDE.md holds the standing rules; this
holds why they got there.

---

## 2026-09-12 — The cut (Phase 0, session 2)

Deleted 100 files, 16,660 lines, from `feature/workspace`. What went: the desk
(`components/desk`, `DeskPage`), the retired `/w2` renderer (`workspace/`), the
shell chrome the room replaced (`GeorgeShell`, `shellNav`, `shellLayout`), the
mark and greeting nothing rendered, the river/auto-follow hooks the room does
not use, and 29 legacy Operations files (older chart, preset and replenishment
components, `services/api.ts`, `types/index.ts`) that no page imported. Two
backend orphans went too: `schema_builder.py` (the old chatbot's, nothing
imported it) and `chart_image.py` (Telegram PNGs, nothing imported it).

Nothing was deleted on judgement. An import graph from `main.tsx` (with the
`@/` alias) decided it: 340 code files, 194 production-reachable. After the cut,
245 files and the same 194 — the proof that only dead code went. Two files the
graph could not see were caught by the suites, because they name source by
string path, not by import (`workUnit.test.ts`, `accentUse.test.ts`).

`workspace/composition.ts` was the one live thing in a dead folder; only
`restoreFromPosts` survives, now `room/restore.ts`, because `room/data.ts`
already duplicated the rest.

**Coverage genuinely lost, not renamed.** 18 backend contract tests and ~200
frontend tests asserted properties of deleted files. Two were repointed where
the same claim holds (`RiverEntry`, and the room for smooth-scrolling). The
rest were dropped rather than aimed at the room, because asserting them of the
room is a new claim about untested code. Notably: the desk's identity-key check
does not transfer — the room identifies a subject by the column its name came
from, never by `store_id`. If the room deserves these guarantees they are a
task, not a rename.

The accent allowlist fell 7 → 4 without a decision being reversed: three
entries named chromes that no longer exist.
