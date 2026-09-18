# The identity palette — validated on the room's two grounds

P2S.2(e): a store keeps one hue everywhere, on its **swatch** only; the mark
beside it carries the verdict. The eight slots are the dataviz skill's
validated categorical palette (the same eight the design,
`ops/ideal/bob-ahead-of-me.html`, draws its `--c-*` from), stepped per
theme, and re-run here against the room's OWN grounds rather than the skill's
default surfaces. `validate_palette.js` is the skill's validator, copied in so
this can be re-run from the repo.

`frontend/src/room/palette.test.ts` reads the two hex lists below and fails if
`room.css` declares anything else.

## Dark — ground `#0f1011`

    node ops/palette/validate_palette.js "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767" --mode dark --surface "#0f1011"

All five checks pass (`dark.txt`). Worst adjacent CVD ΔE 8.4, worst
normal-vision ΔE 19.3, every slot ≥ 3:1 on the ground.

## Light — ground `#f7f8f8`

    node ops/palette/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948" --mode light --surface "#f7f8f8"

Passes, with one WARN (`light.txt`): slots 3, 4 and 5 sit below 3:1 on the
light ground (2.65, 2.04, 2.53). The relief the validator requires is a visible
label, and the swatch is never drawn without one — it sits before the name it
stands for, by construction (`swatch.tsx`, and `RowName` in `marks.tsx`).

## What the validator cannot check, said here

- **Order.** Slot N is the Nth store of `stores.active_retail` as served by
  `/definitions/desk`. Past the eighth store there is no swatch; the palette
  folds, it does not generate.
- **Products** take slots 5–8 by a stable hash, so a product can share a hue
  with the 5th–7th store. A figure groups by one dimension, so the two rarely
  meet; where they do, the name beside each swatch is what tells them apart.
- **Identity against the verdict.** Slots 3 and 6 are greens and slot 8 a red,
  near `--up` and `--down`. They are different channels in different places —
  an 8px dot before a name against the segment, bar or line — which is the
  design's own arrangement; nothing measured here says a reader cannot confuse
  them, and the owner looking at the frames is the check.

## The stores' own colours, toned — 2026-09-17

The owner: *"color mapping should be more like these colors but in our theme
style"*, pointing at Supabot's Settings. A store's swatch now takes the colour
set there (`stores.color`, matched by id), toned by `identity.toned`: hue kept,
OKLCH lightness 0.60–0.66 and chroma 0.10–0.14 on the dark ground, 0.52–0.62
and 0.10–0.15 on paper. The eight slots above remain the fallback for a store
with no colour set. Every run is in `stores.txt`.

**Toned, they pass the lightness band, the chroma floor, the normal-vision
floor and contrast on both grounds. They FAIL colour-blind separation, and so
do his raw colours:** OPUS teal (`#14b8a6`) against Shangri-La pink
(`#ec4899`) is ΔE 3.7 under deuteranopia raw and 1.2–1.3 toned — toning cannot
separate two hues a deutan sees as one, and changing a hue would no longer be
his colour. The validator's required relief is secondary encoding, and it is
there by construction: a swatch is never drawn without the store's name beside
it. Recorded rather than silently re-coloured; if the pair ever confuses him,
the fix is one colour in Settings.
