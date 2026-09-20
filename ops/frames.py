r"""
Frames: the room and the design, rendered side by side in a real browser.

    .venv\Scripts\python.exe ops/frames.py                      # situation, doing, nothing
    .venv\Scripts\python.exe ops/frames.py --scenes draw memory # a later card's scenes
    .venv\Scripts\python.exe ops/frames.py --out verification/frames/p2s1
    .venv\Scripts\python.exe ops/frames.py --scenes doing --voice --out verification/frames/p2s5

WHY THIS EXISTS. Nine cards in a row closed with "nobody has seen it in a
browser", and every layout test in the suite runs in jsdom, which does no
layout at all. NOW.md, Phase 2S: every card's done-when includes a FRAME CHECK —
the scene it owns rendered from a recorded fixture thread in headless Chrome
at 1440 and 1920, sidebar open and closed, saved beside the same scene of the
design rendered the same way, and both images looked at before the card
closes. P2S.1 writes this; every later card reuses it.

WHAT IT DOES, in order:

  1. Builds `frontend/src/frames/scenes.json` from a recorded eval report
     (default `verification/p1close-v2.json`): the question, Bob's answer,
     every read's rows and `meta` exactly as recorded, and the board
     `agent/default_composition.blocks` draws over them — the same conversion
     `ops/recorded_board.py` makes. Bob's own blocks are not in an eval
     report, so a frame shows the loaded default board, which is a real board
     state and says so.
  2. Serves the frontend with Vite and opens `frames.html`, which mounts the
     real `Room` with that turn and no network (src/frames/main.tsx).
  3. Drives the installed Chrome headless over the DevTools protocol: for each
     scene, width and sidebar state it screenshots the room, and the design's
     own scene with its sidebar set the same way.
  4. MEASURES THE ROOM IN THE BROWSER — the numbers jsdom cannot give: the
     composition's centre against the room's, the two column widths, whether
     any scrollbar is drawn, how many leading lines there are, and whether the
     claim starts inside the mark's lower edge. Written to `measure.json`.

WHICH RECORDED TURN STANDS FOR WHICH SCENE is a choice, said here so nobody
has to guess it from a filename:

  situation  "how about rockwell"         (follow-up) — the Rockwell thread
  doing      "how are we doing?"          (vague)
  nothing    "What is running low at Greenhills?" (caveats) — the design's
             `nothing` scene looks at Greenhills and finds little to do
  draw       "add top sellers by sales not units…" (taught) — products drawn
             with their swatches and the verdict on the mark (P2S.2(e))
  memory     ops/frames_fixtures/memory.json — no report has recorded a
             view_memory read; the fixture's own `why` says what it is
  vocab      frontend/src/room/__fixtures__/vocab-reads.json (P2S.3) — one
  vocab2     real read per shape, recorded with the vetted tools and no model
  vocab3     by ops/record_vocab_reads.py, each composed as the shape it was
             recorded for. In three scenes, because the board draws one read
             ONCE ("this is that", board.ts readIdentity) and several shapes
             were recorded over the same read — a bar, a dumbbell, a scatter
             and a table of the same shops — so no scene holds a read twice.
             All three stand beside the design's one `vocab` scene. The question and
             answer are fixture lines. The figures run past one screen, so
             each is also shot a page at a time (`-page2`, `-page3`, …), and
             the design's scene scrolled beside it

Their words are not the design's words and should not be: the LOOK is held on
fixtures, the BEHAVIOUR at the phase close (NOW.md, "LOOK AND BEHAVIOUR ARE TWO
CHECKS").

NO MODEL, NO DATABASE, NO COST.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

FRONTEND = ROOT / "frontend"
SCENES_OUT = FRONTEND / "src" / "frames" / "scenes.json"
DESIGN = ROOT / "ops" / "ideal" / "bob-ahead-of-me.html"
CHROME_CANDIDATES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path("/usr/bin/google-chrome"),
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
]

SCENE_OF = {"situation": "follow-up", "doing": "vague", "nothing": "caveats", "draw": "taught",
            # A gate run records Bob's compose call, so these draw HIS
            # blocks, thoughts and questions (2026-09-17).
            "low": "caveats", "morning": "morning"}
# A scene no eval report has ever recorded, drawn from a checked-in fixture
# that says in its own `why` where its rows came from (P2S.2).
FIXTURE_OF = {"memory": ROOT / "ops" / "frames_fixtures" / "memory.json",
              # The owner's own turn, with real rows off the estate — so it lives
              # in verification/, which is not committed, like every recorded run.
              "shangrila": ROOT / "verification" / "frames_fixtures" / "shangrila.json",
              # The owner's "how are we doing" and "an ordering system" turns of
              # 2026-09-17, after P2S.3 went live — the words column cut at its
              # top, and loop warnings drawn as caveats. Real rows: verification/.
              "howdoing": ROOT / "verification" / "frames_fixtures" / "howdoing.json",
              "ordering": ROOT / "verification" / "frames_fixtures" / "ordering.json",
              # P2S.8's own check. Every recorded run predates `under`, so no
              # recorded turn has a point gathered under another and the browser
              # would only ever exercise the fallback. This is a REAL recorded
              # turn — the Rockwell follow-up, its rows and meta untouched —
              # with the two new fields set to what a composer will say once the
              # grammar is live: read 1 is why, read 2 cuts the other way.
              # Committed, because a frame check nobody else can run is not one.
              "gathered": ROOT / "ops" / "frames_fixtures" / "gathered.json",
              # THE TURN THAT MADE THE CASE FOR THE PAGE (P3.n): the owner's own
              # "whats been down?" of 2026-09-19 18:36 — his words and his
              # composition off the stored post, its five reads run again through
              # the read-only role, because a post keeps arguments and not rows.
              # Real business rows, so it lives in verification/ like the others.
              "whatsdown": ROOT / "verification" / "frames_fixtures" / "whatsdown.json",
              # P3.o's own check, and the same arrangement `gathered` uses for
              # the same reason: no recorded turn carries a `question`, because
              # the field is a day old, so the browser would only ever draw the
              # head as it was. This is `whatsdown` — a REAL recorded turn, its
              # answer, reads and every figure untouched — with the four
              # questions written by the session, which its own `why` states
              # in as many words. It is committed: a frame check nobody else
              # can run is not one.
              "steps": ROOT / "ops" / "frames_fixtures" / "steps.json",
              # P3.p's own check, same arrangement as `gathered` and `steps`
              # and for the same reason: the channel is hours old, so no
              # recorded turn carries one and the browser would only ever draw
              # the packing. `steps` with an `arrangement` the session wrote,
              # which its own `why` states.
              "arranged": ROOT / "ops" / "frames_fixtures" / "arranged.json",
              # THE DEMO (2026-09-20, at his word: "can you show me a demo
              # first?"). The SAME saved turn under four different
              # arrangements, so the space can be seen as a space rather than
              # as one more template. Their `why` says the arrangements are the
              # session's, because no model has composed one.
              "arranged-panels": ROOT / "ops" / "frames_fixtures" / "arranged-panels.json",
              "arranged-column": ROOT / "ops" / "frames_fixtures" / "arranged-column.json",
              "arranged-newest": ROOT / "ops" / "frames_fixtures" / "arranged-newest.json",
              # The identical board with NO arrangement — the packing, for the
              # comparison to be a comparison.
              "packed": ROOT / "ops" / "frames_fixtures" / "steps.json",
              # THE SESSION'S OWN READ of the owner's own question (2026-09-20,
              # at his word: "just get the data and make a conclusion of your
              # own using your new page style"). REAL figures — the vetted read
              # tools run as george_ro that morning, rows and meta recorded
              # whole — with the prose, the claims and the arrangement written
              # by the session. Its `why` says so; Bob did not write it and no
              # model turn was spent on it.
              "mine": ROOT / "ops" / "frames_fixtures" / "mine.json",
              # "how are our stores?", same day, same method — and its lead
              # read is the one the tool refused until 2026-09-20: each day
              # against the SAME WEEKDAY of the baseline week.
              "stores": ROOT / "ops" / "frames_fixtures" / "stores.json",
              # The same treatment on the two broad questions. "doing" leans on
              # the bucket comparison over WEEKS, which is the second half of
              # the 2026-09-20 tool fix — counted in buckets rather than days.
              "doing": ROOT / "ops" / "frames_fixtures" / "doing.json",
              "products": ROOT / "ops" / "frames_fixtures" / "products.json"}
SIZES = {1440: 900, 1920: 1080, 1857: 963}
VOCAB_READS = ROOT / "frontend" / "src" / "room" / "__fixtures__" / "vocab-reads.json"
MAX_ROWS = 200


# ------------------------------------------------------------------ fixtures

def build_scenes(report_path: Path, scenes: list[str]) -> dict[str, Any]:
    from agent import default_composition

    report = json.loads(report_path.read_text(encoding="utf-8"))
    cases = {c.get("scenario"): c for c in report["cases"]}
    out = []
    for scene in scenes:
        if scene in ("vocab", "vocab2", "vocab3"):
            out.append(vocab_scene(scene))
            continue
        if scene in FIXTURE_OF:
            if not FIXTURE_OF[scene].exists():
                print(f"  {scene}: {FIXTURE_OF[scene].relative_to(ROOT)} is not on this machine; skipped")
                continue
            fx = json.loads(FIXTURE_OF[scene].read_text(encoding="utf-8"))
            item = {"scene": scene, "from": str(FIXTURE_OF[scene].relative_to(ROOT)),
                    **{k: fx[k] for k in ("question", "answer", "at", "blocks", "calls")}}
            if fx.get("reading"):
                item["reading"] = fx["reading"]
            if fx.get("notices"):
                item["notices"] = fx["notices"]
            # HIS ARRANGEMENT OF THE RIGHT-HAND SIDE (P3.p), when the fixture
            # carries one. Absent is the packing, which is every other scene.
            if fx.get("arrangement"):
                item["arrangement"] = fx["arrangement"]
            if "default_blocks" in fx:
                # A recorded post: Bob's own blocks that name a read of THIS
                # turn are the composition; the loop's defaults stand beside.
                item["composed"] = [b for b in fx["blocks"] if b.get("seq") is not None]
                item["blocks"] = fx["default_blocks"]
            out.append(item)
            continue
        scenario = SCENE_OF.get(scene)
        case = cases.get(scenario)
        if case is None:
            print(f"  {scene}: no recorded case '{scenario}' in {report_path.name}; skipped")
            continue
        reads = [r for r in case.get("results") or []
                 if not r.get("error") and not str(r.get("tool", "")).startswith("(")]
        seen: dict[int, dict[str, Any]] = {}
        calls = []
        at = None
        for seq, r in enumerate(reads):
            result = r.get("result") or {}
            rows = result.get("rows") or []
            meta = result.get("meta") or {}
            at = at or meta.get("snapshot_timestamp")
            seen[seq] = {"is_read": True, "error": None, "duplicate": False,
                         "tool": r.get("tool"), "rows": rows}
            calls.append({"seq": seq, "tool": r.get("tool"),
                          "arguments": r.get("arguments") or {},
                          "result": {"rows": rows, "meta": meta}})
        # BOB'S OWN COMPOSITION, where the report kept his compose call: his
        # blocks (with their claims and thoughts) and his reading (with its
        # asks). A report that kept none draws the loop's default board.
        composes = [x for x in (case.get("calls") or [])
                    if isinstance(x, dict) and x.get("tool") == "compose"]
        composed = [dict(b) for b in ((composes[0].get("arguments") or {}).get("blocks") or [])
                    if composes and b.get("kind") and b.get("seq") is not None] if composes else []
        for b in composed:
            b.pop("subject", None) if b.get("kind") != "figure" else None
        said = ((composes[-1].get("arguments") or {}).get("reading") if composes else None)
        out.append({
            **({"composed": composed} if composed else {}),
            **({"reading": said} if said else {}),
            "scene": scene,
            "from": f"{report_path.name}/{scenario}",
            "question": case.get("question") or "",
            "answer": case.get("answer") or "",
            "at": at or "2026-09-17T00:00:00Z",
            "blocks": default_composition.blocks(seen, max_rows=MAX_ROWS),
            "calls": calls,
        })
    colours = json.loads((ROOT / "ops" / "frames_fixtures" / "store_colours.json").read_text(encoding="utf-8"))
    return {"from": str(report_path.relative_to(ROOT)), "desk": desk_definitions(),
            "stores": colours["stores"], "scenes": out}


def vocab_scene(scene: str) -> dict[str, Any]:
    """EVERYTHING HE CAN DRAW: one recorded read per shape, composed as that shape."""
    reads = json.loads(VOCAB_READS.read_text(encoding="utf-8"))
    every = [k for k in reads if not k.startswith("_")]
    # Each shape into the first scene that does not already draw its read.
    scenes: list[list[str]] = [[], [], []]
    for name in every:
        same = json.dumps([reads[name]["tool"], reads[name]["arguments"]], sort_keys=True)
        for group in scenes:
            if all(json.dumps([reads[n]["tool"], reads[n]["arguments"]], sort_keys=True) != same
                   for n in group):
                group.append(name)
                break
    names = scenes[{"vocab": 0, "vocab2": 1, "vocab3": 2}[scene]]
    calls, composed = [], []
    for seq, name in enumerate(names):
        read = reads[name]
        calls.append({"seq": seq, "tool": read["tool"], "arguments": read["arguments"],
                      "result": {"rows": read["rows"], "meta": read["meta"]}})
        composed.append({"op": "put", "kind": name, "key": name, "seq": seq, "tool": read["tool"],
                         "weight": "lead" if seq == 0 else "supporting", **read["channels"]})
    # The board puts each new object FIRST, so the shapes are composed last to
    # first and drawn in the order they were recorded.
    composed.reverse()
    at = next((reads[n]["meta"].get("snapshot_timestamp") for n in names), None)
    return {"scene": scene, "from": str(VOCAB_READS.relative_to(ROOT)),
            "question": "show me everything you can draw",
            "answer": "Every shape I can draw, each over the read recorded for it.",
            "at": at or "2026-09-17T00:00:00Z", "blocks": [], "composed": composed, "calls": calls}


def desk_definitions() -> dict[str, Any] | None:
    """The served desk definitions, built by the route's own function, or None."""
    sys.path.insert(0, str(ROOT / "backend"))
    try:
        from app.api.v1.routes import bob  # type: ignore
        got = asyncio.run(bob.desk_definitions(user=None))
        return json.loads(got.model_dump_json())
    except Exception as exc:  # noqa: BLE001 — a frame without tokens still draws
        print(f"  desk definitions not built ({type(exc).__name__}: {exc}); the business switch will say so")
        return None


# ------------------------------------------------------------------- servers

def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_http(url: str, seconds: float) -> None:
    end = time.time() + seconds
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status < 500:
                    return
        except Exception:  # noqa: BLE001
            time.sleep(0.4)
    raise RuntimeError(f"nothing answered at {url} in {seconds:.0f}s")


def start_vite(port: int) -> subprocess.Popen:
    npx = shutil.which("npx.cmd") or shutil.which("npx") or "npx"
    return subprocess.Popen(
        [npx, "vite", "--port", str(port), "--strictPort", "--host", "127.0.0.1"],
        cwd=FRONTEND, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
    )


def start_chrome(port: int, profile: str) -> subprocess.Popen:
    chrome = next((c for c in CHROME_CANDIDATES if c.exists()), None)
    if chrome is None:
        raise RuntimeError("no Chrome found; looked in " + ", ".join(map(str, CHROME_CANDIDATES)))
    return subprocess.Popen([
        str(chrome), "--headless=new", f"--remote-debugging-port={port}",
        f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
        "--hide-scrollbars=false", "--force-device-scale-factor=1", "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ----------------------------------------------------------------------- cdp

class Page:
    def __init__(self, ws):
        self.ws = ws
        self.n = 0

    async def call(self, method: str, **params: Any) -> dict[str, Any]:
        self.n += 1
        mid = self.n
        await self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    async def eval(self, expression: str) -> Any:
        got = await self.call("Runtime.evaluate", expression=expression,
                              returnByValue=True, awaitPromise=True)
        return (got.get("result") or {}).get("value")

    async def goto(self, url: str, width: int, height: int, settle: float) -> None:
        await self.call("Emulation.setDeviceMetricsOverride", width=width, height=height,
                        deviceScaleFactor=1, mobile=False)
        await self.call("Page.navigate", url=url)
        await asyncio.sleep(settle)

    async def shot(self, path: Path) -> None:
        got = await self.call("Page.captureScreenshot", format="png")
        path.write_bytes(base64.b64decode(got["data"]))


MEASURE = r"""
(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
  const main = document.querySelector('.r-main'), comp = document.querySelector('.r-beside');
  const him = document.querySelector('.r-him'), canvas = document.querySelector('.r-him canvas');
  const words = document.querySelector('.r-words'), claim = document.querySelector('.r-say--claim');
  const figs = document.querySelector('.r-figs'), right = document.querySelector('.r-right');
  const m = box(main), c = box(comp);
  const cols = comp ? getComputedStyle(comp).gridTemplateColumns.split(' ').map(parseFloat) : [];
  const bars = [...document.querySelectorAll('*')].filter((el) => {
    const s = getComputedStyle(el);
    return (el.scrollHeight > el.clientHeight + 1 && ['auto', 'scroll'].includes(s.overflowY)
            && el.offsetWidth - el.clientWidth > 0);
  }).map((el) => el.className || el.tagName);
  return {
    viewport: [innerWidth, innerHeight],
    side: document.documentElement.getAttribute('data-side'),
    room: m, composition: c,
    centre_offset_px: m && c ? (c.left + c.width / 2) - (m.left + m.width / 2) : null,
    columns_px: cols,
    him: box(him), mark: box(canvas), words: box(words), claim: box(claim),
    claim_starts_inside_mark_lower_edge: claim && canvas ? box(claim).top <= box(canvas).bottom : null,
    figures: document.querySelectorAll('[data-figure]').length,
    // HOW MANY CHARTS A PERSON SEES WITHOUT SCROLLING: wholly inside the
    // figures area as it opens (the owner, 2026-09-17: one chart fit).
    figures_fully_visible: (() => {
      const area = document.querySelector('.r-figs');
      if (!area) return 0;
      const a = area.getBoundingClientRect();
      return [...document.querySelectorAll('[data-figure][data-arrived="yes"]')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= a.top - 1 && r.bottom <= a.bottom + 1;
      }).length;
    })(),
    // HIS REACH vs THE WORDS AND THE WINDOW: the ring he draws while working
    // reaches ~87% of the canvas's half-height; the words must start below it
    // and the window's top must not cut it.
    mark_reach: (() => {
      const c = document.querySelector('.r-him canvas'); const w = document.querySelector('.r-words');
      if (!c || !w) return null;
      const r = c.getBoundingClientRect(); const mid = r.top + r.height / 2; const reach = r.height / 2 * 0.87;
      return { ring_top: Math.round(mid - reach), ring_bottom: Math.round(mid + reach), words_top: Math.round(w.getBoundingClientRect().top) };
    })(),
    band_px: (() => { const b = document.querySelector('.r-say-band'); const h = document.querySelector('.r-him'); return h ? Math.round(h.getBoundingClientRect().height) : null; })(),
    // CLIPPED: any dot, ring, swatch or mark inside a figure whose drawn box —
    // a ringed swatch's ring included — reaches past an ancestor that clips
    // (the log, 2026-09-17: "these things keep getting slightly cut").
    clipped: (() => {
      const out = [];
      const clips = (el) => { const s = getComputedStyle(el); return s.overflowX !== 'visible' || s.overflowY !== 'visible'; };
      for (const el of document.querySelectorAll('[data-figure] .r-sw, [data-figure] .r-mk-dot, [data-figure] .r-mk-seg, [data-figure] .r-mk-bar i, [data-figure] .r-mk-num, [data-figure] .r-fig-lbl')) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const ring = el.classList.contains('r-sw') && getComputedStyle(el).boxShadow !== 'none' ? 3 : 0;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (!clips(a)) continue;
          const c = a.getBoundingClientRect();
          if (r.left - ring < c.left - 0.5 || r.right + ring > c.right + 0.5) {
            out.push(`${el.className} in ${a.className}`); break;
          }
        }
      }
      return out;
    })(),
    // WHAT THE HEADLINE READS AS, rendered — a swallowed space shows here (2026-09-17).
    claim_text: claim ? claim.innerText : null,
    words_scroll_top: words ? words.scrollTop : null,
    mark_state: canvas ? canvas.getAttribute('data-state') : null,
    mark_form: canvas ? canvas.getAttribute('data-form') : null,
    swatches: document.querySelectorAll('.r-sw').length,
    touchable_marks: document.querySelectorAll('[data-v]').length,
    receipts: document.querySelectorAll('button.r-src').length,
    figure_columns: [...document.querySelectorAll('[data-figure]')].map((el) => Number(el.getAttribute('data-col'))),
    wires: document.querySelectorAll('.r-wires line').length,
    arrows_shown: [...document.querySelectorAll('.r-arr')].filter((a) => !a.hidden).map((a) => a.className),
    page_scrolls: document.documentElement.scrollHeight > innerHeight + 1,
    visible_scrollbars: bars,
    figures_area: box(figs), right: box(right),
  };
})()
"""


async def run(scenes: list[str], out: Path, sizes: dict[int, int], cdp_port: int, base: str,
              lit: str | None = None, layout: str | None = None, voice: bool = False) -> dict:
    import websockets

    def new_tab() -> str:
        req = urllib.request.Request(f"http://127.0.0.1:{cdp_port}/json/new?about:blank", method="PUT")
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())["webSocketDebuggerUrl"]

    measured: dict[str, Any] = {}
    design = DESIGN.resolve().as_uri()
    async with websockets.connect(new_tab(), max_size=64 * 2**20) as ws:
        page = Page(ws)
        await page.call("Page.enable")
        await page.call("Runtime.enable")
        for scene in scenes:
            for width, height in sizes.items():
                for rail in ("open", "closed"):
                    stem = f"{scene}-{width}-{rail}"
                    # THE ROOM
                    lit_q = (f"&lit={urllib.parse.quote(lit)}" if lit else "") + (f"&layout={layout}" if layout else "")
                    await page.goto(f"{base}/frames.html?scene={scene}&rail={rail}{lit_q}", width, height, 0.5)
                    # Vite compiles on first request; wait for the room itself,
                    # then for every figure to land (the last at 200 + 260·n ms).
                    for _ in range(120):
                        if await page.eval("!!document.querySelector('.r-beside canvas')"):
                            break
                        await asyncio.sleep(0.5)
                    await asyncio.sleep(3.5)
                    await page.shot(out / f"{stem}-room.png")
                    measured[stem] = await page.eval(MEASURE)
                    # TOUCH (P2S.2(f)): one mark tapped and its receipt opened,
                    # so the tip and the receipts in place are seen, not assumed.
                    if rail == "open" and await page.eval(
                            "(() => { const m = document.querySelector('[data-figure] [data-v]');"
                            " const r = document.querySelector('[data-figure] button.r-src');"
                            " if (r) r.click(); if (m) m.dispatchEvent(new MouseEvent('click', {bubbles: true}));"
                            " return !!m; })()"):
                        await asyncio.sleep(0.6)
                        await page.shot(out / f"{stem}-touch.png")
                    # VOICE (P2S.5): two shops tapped, the mic held, a phrase
                    # half heard — the composer listening, beside the design's mic.
                    if voice and rail == "open":
                        await page.goto(f"{base}/frames.html?scene={scene}&rail={rail}&voice=listening",
                                        width, height, 0.5)
                        for _ in range(120):
                            if await page.eval("!!document.querySelector('.r-mic')"):
                                break
                            await asyncio.sleep(0.5)
                        await asyncio.sleep(3.5)
                        await page.eval(
                            "(() => { const names = [...document.querySelectorAll('button.r-mk-name--tap')];"
                            " const seen = new Set(); for (const b of names) {"
                            "   if (seen.size >= 2 || seen.has(b.textContent)) continue;"
                            "   seen.add(b.textContent); b.click(); }"
                            " const m = document.querySelector('.r-mic');"
                            " m.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerId: 1}));"
                            " return true; })()")
                        await asyncio.sleep(1.0)
                        await page.shot(out / f"{stem}-voice.png")
                        measured[f"{stem}-voice"] = await page.eval(
                            "(() => ({ mic: document.querySelector('.r-mic')?.getAttribute('data-state'),"
                            " line: document.querySelector('.r-line input')?.value,"
                            " chips: [...document.querySelectorAll('.r-chip--subject')].map(c => c.textContent) }))()")
                    # THE DESIGN, the same scene, the sidebar set the same way
                    await page.goto(design, width, height, 2.5)
                    await page.eval(
                        "(() => { const want = %s;"
                        " const open = document.documentElement.getAttribute('data-side') === 'open';"
                        " if (want !== open) document.getElementById(want ? 'reopen' : 'collapse').click();"
                        " const b = document.querySelector('.strip [data-scene=\"%s\"]'); if (b) b.click();"
                        " return true; })()" % ("true" if rail == "open" else "false",
                                                "vocab" if scene.startswith("vocab") else scene))
                    await asyncio.sleep(3.0)
                    await page.shot(out / f"{stem}-design.png")
                    print(f"  {stem}: room + design")
                    # A SCENE LONGER THAN A SCREEN (vocab): the figures area and
                    # the design's scene, a page at a time, so every shape is seen.
                    if scene.startswith("vocab") and rail == "open":
                        await page.goto(f"{base}/frames.html?scene={scene}&rail={rail}", width, height, 0.5)
                        for _ in range(120):
                            if await page.eval("!!document.querySelector('.r-beside canvas')"):
                                break
                            await asyncio.sleep(0.5)
                        await asyncio.sleep(6.0)
                        for n in range(2, 12):
                            moved = await page.eval(
                                "(() => { const a = document.querySelector('.r-figs'); if (!a) return false;"
                                " const was = a.scrollTop; a.scrollTop = was + a.clientHeight * 0.9;"
                                " return a.scrollTop > was; })()")
                            if not moved:
                                break
                            await asyncio.sleep(1.2)
                            await page.shot(out / f"{stem}-room-page{n}.png")
                        await page.goto(design, width, height, 2.5)
                        await page.eval(
                            "(() => { const b = document.querySelector('.strip [data-scene=\"vocab\"]');"
                            " if (b) b.click(); return true; })()")
                        await asyncio.sleep(3.0)
                        for n in range(2, 8):
                            moved = await page.eval(
                                "(() => { const was = scrollY; scrollBy(0, innerHeight * 0.9);"
                                " return scrollY > was; })()")
                            if not moved:
                                break
                            await asyncio.sleep(1.0)
                            await page.shot(out / f"{stem}-design-page{n}.png")
    return measured


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenes", nargs="+", default=["situation", "doing", "nothing"])
    ap.add_argument("--report", default="verification/p1close-v2.json")
    ap.add_argument("--out", default="verification/frames/p2s1")
    ap.add_argument("--widths", nargs="+", type=int, default=[1440, 1920])
    ap.add_argument("--lit", default=None, help="a name to emphasise on every block (draws ringed swatches)")
    ap.add_argument("--layout", default=None, choices=["beside", "speak"], help="which composition to render")
    ap.add_argument("--voice", action="store_true",
                    help="also shoot the composer listening: two shops tapped, the mic held (P2S.5)")
    args = ap.parse_args(argv)

    out = ROOT / args.out
    out.mkdir(parents=True, exist_ok=True)
    print(f"building {SCENES_OUT.relative_to(ROOT)} from {args.report}")
    fixture = build_scenes(ROOT / args.report, args.scenes)
    SCENES_OUT.parent.mkdir(parents=True, exist_ok=True)
    SCENES_OUT.write_text(json.dumps(fixture, indent=1, ensure_ascii=False), encoding="utf-8")
    scenes = [s["scene"] for s in fixture["scenes"]]

    vite_port, cdp_port = free_port(), free_port()
    profile = tempfile.mkdtemp(prefix="bob-frames-")
    vite = start_vite(vite_port)
    chrome = None
    try:
        base = f"http://127.0.0.1:{vite_port}"
        wait_http(f"{base}/frames.html", 90)
        chrome = start_chrome(cdp_port, profile)
        wait_http(f"http://127.0.0.1:{cdp_port}/json/version", 30)
        sizes = {w: SIZES.get(w, 1080) for w in args.widths}
        measured = asyncio.run(run(scenes, out, sizes, cdp_port, base, args.lit, args.layout, args.voice))
    finally:
        if chrome:
            chrome.terminate()
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(vite.pid)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            vite.terminate()
        shutil.rmtree(profile, ignore_errors=True)

    (out / "measure.json").write_text(json.dumps(measured, indent=1), encoding="utf-8")
    print(f"\n{out.relative_to(ROOT)}: {len(measured) * 2} images, measure.json")
    print(f"{'frame':<24} {'centre px':>9} {'columns':>16} figs wires bars scrolls")
    for stem, m in measured.items():
        if not m:
            print(f"{stem:<24} (nothing measured)")
            continue
        if stem.endswith("-voice"):
            print(f"{stem:<24} mic {m.get('mic')} · line {m.get('line')!r} · chips {m.get('chips')}")
            continue
        cols = "/".join(str(round(c)) for c in m.get("columns_px") or [])
        off = m.get("centre_offset_px")
        print(f"{stem:<24} {'-' if off is None else round(off, 1):>9} {cols:>16} "
              f"{m.get('figures'):>4} {m.get('wires'):>5} {len(m.get('visible_scrollbars') or []):>4} "
              f"{m.get('page_scrolls')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
