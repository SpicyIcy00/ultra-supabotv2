r"""
FOUR WAYS TO DRAW ONE SAVED ANSWER, so the shape can be chosen by looking.

    .venv\Scripts\python.exe ops/variants.py
    .venv\Scripts\python.exe ops/variants.py --fixture ops/frames_fixtures/steps.json

WHY THIS EXISTS. The owner, 2026-09-19, of the shipped right-hand side: *"It
looks like ours just a little changed, still some widgets not page … Im willing
to fully revamp it"* — and then: *"can you make a revamp version instead but
still keep our original … i dont want to keep asking new questions to test it,
can you just use old saved answers and reengineer it with the new style?"*

So: one answer he has already been given, drawn four ways on one page. Nothing
is asked of the model, nothing costs a turn, and the room that ships is not
touched — it is the first panel, as a screenshot of the real thing.

**NO FIGURE IS WRITTEN HERE.** Every number on the page is read out of the
recorded `result.rows` of the turn, and every panel carries the source line and
the read time that row arrived with (UI rule 6). There is no arithmetic in this
file: no sum, no ratio, no rounding of a value. `_fmt` chooses how a number the
rows already hold is spelled, and nothing else.

**AND THE QUESTIONS ARE NOT BOB'S, WHICH THE PAGE ITSELF SAYS.** The step form
heads each block with the question it answers; the field is one day old and no
recorded turn carries one. The four in the fixture were written by the session
(`ops/frames_fixtures/steps.json`, its own `why`), and every panel that draws
one prints that above it — a screen that implies he said something he did not
is the one thing a prototype must not do.

HIS PROSE IS HIS. The paragraphs are sliced out of the recorded answer
verbatim; which paragraph sits with which read is this file's arrangement, and
it is declared in `ARRANGEMENT` rather than inferred, because an inference
nobody can see is how five layout rounds went wrong.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE = ROOT / "ops" / "frames_fixtures" / "steps.json"
OUT = ROOT / "verification" / "variants"
# The room that ships, photographed rather than re-implemented — a hand-made
# copy of it would be a strawman, and the comparison is the whole point.
NOW_SHOT = "../frames/p3o-steps/steps-1440-open-room.png"


# ---------------------------------------------------------------------------
# Reading the recorded turn
# ---------------------------------------------------------------------------

def _calls(fx: dict) -> dict[int, dict]:
    return {c["seq"]: c for c in fx.get("calls") or []}


def _rows(call: Optional[dict]) -> list[dict]:
    return ((call or {}).get("result") or {}).get("rows") or []


def _meta(call: Optional[dict]) -> dict:
    return ((call or {}).get("result") or {}).get("meta") or {}


def _subject(row: dict) -> str:
    """The row's own name for itself, in the order a read's subject columns run."""
    for key in ("store", "product", "supplier", "category", "subject", "sku"):
        if isinstance(row.get(key), str) and row[key].strip():
            return row[key]
    return ""


def _fmt(value: Any, unit: str) -> str:
    """
    HOW A NUMBER THE ROWS ALREADY HOLD IS SPELLED. No arithmetic: the value is
    the row's, and this only chooses a currency mark, a thousands separator and
    whether a decimal is shown.
    """
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return ""
    if unit == "PHP":
        return f"₱{value:,.0f}" if abs(value) >= 1000 else f"₱{value:,.2f}"
    return f"{value:,.0f}"


def _read_at(meta: dict) -> str:
    stamp = str(meta.get("snapshot_timestamp") or "")
    m = re.search(r"T(\d{2}:\d{2})", stamp)
    return m.group(1) if m else ""


def _source_line(call: dict, index: int) -> str:
    meta = _meta(call)
    parts = [f"read {index}"]
    if meta.get("metric_label"):
        parts.append(str(meta["metric_label"]))
    args = call.get("arguments") or {}
    if args.get("group_by"):
        # THE EIGHT WORDS ARE THE PRODUCT'S (CLAUDE.md): a read grouped by the
        # `store` column is drawn as "per shop", which is what the room says.
        said = {"store": "shop"}.get(str(args["group_by"]), str(args["group_by"]))
        parts.append(f"per {said}")
    if args.get("date_range"):
        parts.append(str(args["date_range"]).replace("_", " "))
    if _read_at(meta):
        parts.append(f"read {_read_at(meta)}")
    return " · ".join(parts)


# ---------------------------------------------------------------------------
# The marks. Every bar's WIDTH is a value the rows carry, scaled to the widest
# one in the same read — a proportion, not a figure, and nothing is printed
# from it. The printed figure is always `_fmt` of the row's own value.
# ---------------------------------------------------------------------------

def _dumbbell(call: dict, emphasise: list[str], limit: Optional[int] = None) -> str:
    rows = _rows(call)
    unit = str(_meta(call).get("metric_unit") or "")
    shown = rows[:limit] if limit else rows
    span = max([abs(float(r.get("value") or 0)) for r in rows] +
               [abs(float(r.get("baseline") or 0)) for r in rows] or [1]) or 1
    out = []
    for row in shown:
        name = _subject(row)
        now = float(row.get("value") or 0)
        was = float(row.get("baseline") or 0)
        down = row.get("direction") == "down"
        lit = not emphasise or name in emphasise
        a, b = sorted((now / span * 100, was / span * 100))
        out.append(
            f'<div class="row{" lit" if lit else ""}">'
            f'<span class="nm">{html.escape(name)}</span>'
            f'<span class="track">'
            f'<i class="seg{" dn" if down else " up"}" style="left:{a:.1f}%;right:{100 - b:.1f}%"></i>'
            f'<i class="dot was" style="left:{was / span * 100:.1f}%"></i>'
            f'<i class="dot now{" dn" if down else " up"}" style="left:{now / span * 100:.1f}%"></i>'
            f'</span>'
            f'<span class="fig">{_fmt(now, unit)}<s>was {_fmt(was, unit)}</s></span>'
            f'</div>'
        )
    if limit and len(rows) > limit:
        out.append(f'<div class="more">{len(rows) - limit} more · show</div>')
    return f'<div class="mk">{"".join(out)}</div>'


def _contributors(call: dict, emphasise: list[str], limit: Optional[int] = None) -> str:
    """What MOVED a thing: the change each row carries, drawn from zero."""
    rows = _rows(call)
    unit = str(_meta(call).get("metric_unit") or "")
    shown = rows[:limit] if limit else rows
    span = max([abs(float(r.get("change") or 0)) for r in rows] or [1]) or 1
    out = []
    for row in shown:
        name = _subject(row)
        change = float(row.get("change") or 0)
        lit = not emphasise or name in emphasise
        out.append(
            f'<div class="row{" lit" if lit else ""}">'
            f'<span class="nm">{html.escape(name)}</span>'
            f'<span class="track">'
            f'<i class="bar {"dn" if change < 0 else "up"}" '
            f'style="width:{abs(change) / span * 100:.1f}%"></i>'
            f'</span>'
            f'<span class="fig">{_fmt(change, unit)}</span>'
            f'</div>'
        )
    if limit and len(rows) > limit:
        out.append(f'<div class="more">{len(rows) - limit} more · show</div>')
    return f'<div class="mk">{"".join(out)}</div>'


def _figure(call: dict, subject: str) -> str:
    """One number, for the one row it is about."""
    row = next((r for r in _rows(call) if _subject(r) == subject), None)
    if row is None:
        return ""
    unit = str(row.get("unit") or _meta(call).get("metric_unit") or "")
    return (f'<div class="mk one"><span class="big">{_fmt(row.get("size", row.get("value")), unit)}</span>'
            f'<span class="nm">{html.escape(subject)}</span></div>')


MARKS = {"dumbbell": _dumbbell, "contributors": _contributors}


def _draw(block: dict, calls: dict[int, dict], limit: Optional[int] = None) -> str:
    call = calls.get(block.get("seq"))
    if call is None:
        return ""
    kind = block.get("kind")
    if kind == "figure" and block.get("subject"):
        return _figure(call, str(block["subject"]))
    fn = MARKS.get(str(kind), _dumbbell)
    return fn(call, list(block.get("emphasise") or []), limit)


# ---------------------------------------------------------------------------
# HIS PARAGRAPHS, sliced verbatim out of the recorded answer.
#
# THE ARRANGEMENT IS THIS FILE'S AND THE WORDS ARE HIS. Which paragraph sits
# with which read is declared here, by the block's key, rather than matched by
# a heuristic — the same decision `frontend/src/room/page.ts` makes from the
# superscripts, written down so it can be argued with.
# ---------------------------------------------------------------------------

ARRANGEMENT = [
    # (block key, paragraph, first sentence, last sentence or None for the rest)
    #
    # A BEAT IS SENTENCES, NOT A PARAGRAPH. His shops paragraph holds two
    # thoughts over two different reads — the three that fell, then OPUS and
    # Greenhills taken apart — which is exactly the split `page.ts` makes from
    # the superscripts. Mapping a block to a whole paragraph put his products
    # sentence over the basket chart in the first pass.
    ("stores-week", 1, 0, 1),
    ("basket-split", 1, 2, None),
    ("fallers", 2, 0, None),
    ("fairview-thu", 3, 0, None),
]


def _sentences(text: str) -> list[str]:
    """
    Split only where a stop is followed by the start of a new sentence — never
    inside "−15.9%" or "31 Aug–6 Sep", which a bare `[.!?]` splitter cuts in
    half (it did, in the first pass).
    """
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z“‘\"'])", text.strip()) if s.strip()]


def _slice(paras: list[str], at: int, first: int, last: Optional[int]) -> str:
    if at >= len(paras):
        return ""
    said = _sentences(paras[at])
    return " ".join(said[first:(None if last is None else last + 1)])


def _paragraphs(answer: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", answer.strip()) if p.strip()]


def _marked(text: str) -> str:
    """His own emphasis, kept: `**x**` is a span he bolded, nothing else."""
    out = html.escape(text)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", out, flags=re.S)


# ---------------------------------------------------------------------------
# The four panels
# ---------------------------------------------------------------------------

def _step_note(fx: dict) -> str:
    """Said on every panel that draws a question, because they are not his."""
    if not any(b.get("question") for b in fx.get("blocks") or []):
        return ""
    return ('<p class="warn">The questions on this panel were written by the session, '
            'not by Bob — the field is one day old and no recorded turn carries one. '
            'Every figure, every row and every word of his prose is the saved turn.</p>')


def _now_src() -> str:
    """
    THE SCREENSHOT, CARRIED INSIDE THE PAGE. One self-contained file opens on
    any machine he happens to be at; a relative path to `verification/frames`
    opens as a broken image everywhere but this one.
    """
    shot = (ROOT / "verification" / "frames" / "p3o-steps" / "steps-1440-open-room.png")
    if not shot.exists():
        return ""
    import base64
    return "data:image/png;base64," + base64.b64encode(shot.read_bytes()).decode("ascii")


def _panel_now(fx: dict) -> str:
    src = _now_src()
    if not src:
        return ('<section class="panel"><header><span class="tag">now</span>'
                '<h2>What ships today</h2><p class="sub">The screenshot of the live room is '
                'not on this machine — run <code>ops/frames.py --scenes steps</code> first.'
                '</p></header></section>')
    return (
        '<section class="panel"><header><span class="tag">now</span>'
        '<h2>What ships today</h2>'
        '<p class="sub">The real room, photographed rather than re-drawn — a hand-made copy '
        'would be a strawman. His paragraphs run down the right with the reads each one '
        'cites under it.</p></header>'
        f'<img class="shot" src="{src}" alt="the room as it ships">'
        '</section>'
    )


def _panel_document(fx: dict, calls: dict[int, dict]) -> str:
    """A — one column at reading width: his words and the evidence interleaved."""
    paras = _paragraphs(fx["answer"])
    by_key = {b["key"]: b for b in fx["blocks"]}
    body = [
        '<p class="ask">you asked · <b>' + html.escape(fx["question"]) + '</b></p>',
        f'<h3 class="claim">{_marked(paras[0])}</h3>',
    ]
    caveat = (fx.get("reading") or {}).get("caveat")
    if caveat:
        body.append(f'<p class="caveat">{html.escape(caveat)}</p>')
    for key, at, first, last in ARRANGEMENT:
        block = by_key.get(key)
        said = _slice(paras, at, first, last)
        if not block or not said:
            continue
        call = calls.get(block.get("seq"))
        body.append(f'<p class="say">{_marked(said)}</p>')
        body.append(f'<div class="ev">{_draw(block, calls, limit=8)}'
                    f'<p class="src">{_source_line(call, block["seq"])}</p></div>')
    nxt = (fx.get("reading") or {}).get("next")
    if nxt:
        body.append(f'<p class="next"><span class="lab">what I\'d do next</span>{html.escape(nxt)}</p>')
    return ('<section class="panel"><header><span class="tag">A</span>'
            '<h2>One document</h2>'
            '<p class="sub">No columns. One reading width, his words and the evidence '
            'interleaved the way an article runs — the claim, the caveat, then each thought '
            'with the read it rests on directly beneath it.</p></header>'
            f'<div class="doc">{"".join(body)}</div></section>')


def _panel_steps(fx: dict, calls: dict[int, dict], folded: bool = False) -> str:
    """B and C — numbered steps, his connected prose short and on the left."""
    paras = _paragraphs(fx["answer"])
    by_key = {b["key"]: b for b in fx["blocks"]}
    reading = fx.get("reading") or {}
    left = [f'<h3 class="claim">{_marked(paras[0])}</h3>']
    if reading.get("caveat"):
        left.append(f'<p class="caveat">{html.escape(reading["caveat"])}</p>')
    if reading.get("next"):
        left.append(f'<p class="next"><span class="lab">what I\'d do next</span>'
                    f'{html.escape(reading["next"])}</p>')

    steps = []
    for n, (key, at, first, last) in enumerate(ARRANGEMENT, start=1):
        block = by_key.get(key)
        if not block:
            continue
        call = calls.get(block.get("seq"))
        out = block.get("ruled_out")
        head = (f'<p class="say"><b>{html.escape(str(block.get("question") or ""))}</b> '
                f'{html.escape(str(block.get("claim") or ""))}</p>')
        thought = (f'<p class="thought">{html.escape(str(block.get("thought") or ""))}</p>'
                   if block.get("thought") else "")
        ev = (f'<div class="ev">{_draw(block, calls, limit=8)}'
              f'<p class="src">{_source_line(call, block["seq"])}</p></div>')
        if folded:
            ev = (f'<details class="fold"><summary>show the read · '
                  f'{len(_rows(call))} rows</summary>{ev}</details>')
        steps.append(
            f'<div class="step">'
            f'<span class="n">{n}{" · ruled out" if out else ""}</span>'
            f'<div>{head}{thought}{ev}</div></div>'
        )

    tag, title, sub = (
        ("C", "Steps, evidence folded",
         "The same steps, but each read stays closed until you want it. The page becomes the "
         "argument on its own — four questions and four answers — and the figures are one tap "
         "away rather than three screens of scrolling."),
    )[0] if folded else (
        ("B", "Steps",
         "The design's own form: his connected prose short and on the left, and the right-hand "
         "side nothing but numbered steps — the question each read answered, in bold, answered "
         "in the same breath. Read the questions down the page and you have the investigation."),
    )[0]
    return (f'<section class="panel"><header><span class="tag">{tag}</span>'
            f'<h2>{title}</h2><p class="sub">{sub}</p></header>'
            f'{_step_note(fx)}'
            f'<div class="beside"><div class="words">{"".join(left)}</div>'
            f'<div class="steps">{"".join(steps)}</div></div></section>')


# ---------------------------------------------------------------------------

CSS = """
:root{--bg:#0a0b0d;--ink:#e8eaed;--ink-2:#c9ced6;--ink-3:#8a8f98;--ink-4:#5d626b;
--line:#1e2126;--up:#3fb27f;--dn:#e5594f;
--serif:'Newsreader',Georgia,serif;--mono:'Geist Mono',ui-monospace,Consolas,monospace;
--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);
-webkit-font-smoothing:antialiased}
.wrap{max-width:1500px;margin:0 auto;padding:48px 24px 120px}
.lede{max-width:760px;margin:0 0 56px}
.lede h1{font:400 34px/1.2 var(--serif);margin:0 0 14px}
.lede p{color:var(--ink-3);font-size:14.5px;line-height:1.65;margin:0 0 10px}
.panel{border-top:1px solid var(--line);padding:40px 0 8px;margin:0 0 24px}
.panel header{max-width:760px;margin:0 0 28px}
.tag{font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;
color:var(--ink-4);display:block;margin:0 0 10px}
.panel h2{font:600 20px/1.3 var(--sans);margin:0 0 8px}
.sub{color:var(--ink-3);font-size:14px;line-height:1.6;margin:0}
.warn{font:400 12.5px/1.6 var(--mono);color:var(--ink-3);border-left:2px solid var(--line);
padding:8px 0 8px 14px;margin:0 0 26px;max-width:760px}
.shot{width:100%;max-width:1440px;border:1px solid var(--line);border-radius:4px;display:block}

.doc{max-width:760px}
.ask{font:400 11px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
color:var(--ink-4);margin:0 0 20px}
.ask b{color:var(--ink-2);font-weight:500;text-transform:none;letter-spacing:0;font-size:13px}
.claim{font:400 27px/1.32 var(--serif);margin:0 0 20px;text-wrap:pretty}
.claim b{font-weight:400;font-style:italic}
.caveat{font-size:14px;line-height:1.65;color:var(--ink);margin:0 0 30px;
border-left:2px solid var(--line);padding-left:14px}
.say{font:400 16px/1.62 var(--serif);margin:34px 0 14px;text-wrap:pretty}
.say b{font-weight:600}
/* HIS PROSE IS ALWAYS --ink (DECISIONS, 2026-09-18). What is chrome — a
   source line, a step number, a label — is ink-3 or ink-4; nothing he SAID is. */
.thought{font:400 14.5px/1.6 var(--serif);color:var(--ink);margin:0 0 14px}
.next{font-size:14.5px;line-height:1.6;color:var(--ink);margin:36px 0 0;
border-left:2px solid var(--line);padding-left:14px}
.lab{display:block;font:500 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;
color:var(--ink-4);margin:0 0 6px}
.ev{margin:0 0 8px}
.src{font:400 10px/1.5 var(--mono);color:var(--ink-4);margin:10px 0 0}

.beside{display:grid;grid-template-columns:minmax(260px,380px) minmax(0,1fr);gap:56px;
align-items:start}
.words{position:sticky;top:32px}
.words .claim{font-size:23px}
.step{display:grid;grid-template-columns:54px minmax(0,1fr);gap:8px;margin:0 0 44px}
.step .n{font:500 10px/1.9 var(--mono);letter-spacing:.11em;text-transform:uppercase;
color:var(--ink-4)}
.fold{margin:6px 0 0}
.fold summary{font:400 11px/1.6 var(--mono);color:var(--ink-3);cursor:pointer;
padding:6px 0;list-style:none}
.fold summary::-webkit-details-marker{display:none}
.fold summary::before{content:'▸ ';color:var(--ink-4)}
.fold[open] summary::before{content:'▾ '}

.mk{display:grid;gap:3px;margin:14px 0 0}
.row{display:grid;grid-template-columns:minmax(96px,150px) minmax(0,1fr) minmax(96px,132px);
gap:14px;align-items:center;padding:5px 0}
/* EMPHASIS ADDS, IT NEVER DIMS (DECISIONS, 2026-09-18 — the owner refused a
   band and refused fading the rest). A row his claim names gets WEIGHT and a
   ring; every other row keeps full ink and full size. */
.row.lit .nm{font-weight:700}
.row.lit .dot.now{box-shadow:0 0 0 3px rgba(232,234,237,.16)}
.row.lit .bar{box-shadow:0 0 0 2px rgba(232,234,237,.16)}
.nm{font:500 13.5px/1.4 var(--sans);color:var(--ink)}
.track{position:relative;height:12px}
.track::after{content:'';position:absolute;left:0;right:0;top:50%;height:1px;
background:var(--line)}
.seg{position:absolute;top:50%;height:1.5px;transform:translateY(-50%)}
.seg.up{background:var(--up)}.seg.dn{background:var(--dn)}
.dot{position:absolute;top:50%;width:8px;height:8px;border-radius:50%;
transform:translate(-50%,-50%)}
.dot.was{background:transparent;border:1.5px solid var(--ink-4)}
.dot.now.up{background:var(--up)}.dot.now.dn{background:var(--dn)}
.bar{position:absolute;top:50%;height:7px;transform:translateY(-50%);border-radius:1px}
.bar.up{background:var(--up)}.bar.dn{background:var(--dn)}
.fig{font:500 13px/1.3 var(--mono);text-align:right;color:var(--ink)}
.fig s{display:block;text-decoration:none;font-weight:400;font-size:10.5px;color:var(--ink-4)}
.more{font:400 10.5px/1.6 var(--mono);color:var(--ink-4);padding:6px 0 0}
.one{padding:10px 0}
.one .big{font:500 32px/1.1 var(--mono);display:block}
.one .nm{color:var(--ink-3);font-size:12.5px}
@media (max-width:900px){.beside{grid-template-columns:1fr;gap:32px}
.words{position:static}.step{grid-template-columns:34px minmax(0,1fr)}}
"""


def build(fixture: Path, only: Optional[str] = None) -> Path:
    """
    All four on one page, or one panel on its own (`--only b`) — a panel below
    the fold cannot be screenshot, and every panel has to be LOOKED at.
    """
    fx = json.loads(fixture.read_text(encoding="utf-8"))
    calls = _calls(fx)
    OUT.mkdir(parents=True, exist_ok=True)
    panels = {"now": lambda: _panel_now(fx),
              "a": lambda: _panel_document(fx, calls),
              "b": lambda: _panel_steps(fx, calls, folded=False),
              "c": lambda: _panel_steps(fx, calls, folded=True)}
    if only:
        chosen = "".join(panels[k]() for k in [only.lower()])
    else:
        chosen = "".join(fn() for fn in panels.values())
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Four ways to draw one answer</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><div class="wrap">
<div class="lede">
<h1>Four ways to draw one answer</h1>
<p>One saved turn — <b>{html.escape(fx['question'])}</b>, answered {html.escape(str(fx.get('at', ''))[:10])} —
drawn four ways. Nothing was asked of Bob to make this page: every figure, every row and
every word of his prose comes out of the recorded turn, and the room that ships is the
first panel, photographed.</p>
<p>The questions heading the steps in <b>B</b> and <b>C</b> were written by the session, not by
Bob. The field is one day old and no saved turn carries one. Whether he writes them is
behaviour, and only a live turn answers it.</p>
<p>Pick one and I'll build it into the app behind a switch, with the original kept.</p>
</div>
{chosen}
</div></body></html>"""
    out = OUT / (f"{only.lower()}.html" if only else "index.html")
    out.write_text(page, encoding="utf-8")
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fixture", default=str(DEFAULT_FIXTURE),
                    help="a recorded turn with its blocks and calls")
    ap.add_argument("--only", choices=["now", "a", "b", "c"],
                    help="one panel on its own, so it can be screenshot whole")
    args = ap.parse_args(argv)
    path = Path(args.fixture)
    if not path.is_absolute():
        path = ROOT / path
    if not path.exists():
        print(f"{path} is not on this machine", file=sys.stderr)
        return 1
    out = build(path, args.only)
    print(f"wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
