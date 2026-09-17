r"""
Frames: the room and the design, rendered side by side in a real browser.

    .venv\Scripts\python.exe ops/frames.py                      # situation, doing, nothing
    .venv\Scripts\python.exe ops/frames.py --scenes draw memory # a later card's scenes
    .venv\Scripts\python.exe ops/frames.py --out verification/frames/p2s1

WHY THIS EXISTS. Nine cards in a row closed with "nobody has seen it in a
browser", and every layout test in the suite runs in jsdom, which does no
layout at all. NOW.md, Phase 2S: every card's done-when includes a FRAME CHECK —
the scene it owns rendered from a recorded fixture thread in headless Chrome
at 1440 and 1920, sidebar open and closed, saved beside the same scene of the
design rendered the same way, and both images looked at before the card
closes. P2S.1 writes this; every later card reuses it.

WHAT IT DOES, in order:

  1. Builds `frontend/src/frames/scenes.json` from a recorded eval report
     (default `verification/p1close-v2.json`): the question, George's answer,
     every read's rows and `meta` exactly as recorded, and the board
     `agent/default_composition.blocks` draws over them — the same conversion
     `ops/recorded_board.py` makes. George's own blocks are not in an eval
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
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

FRONTEND = ROOT / "frontend"
SCENES_OUT = FRONTEND / "src" / "frames" / "scenes.json"
DESIGN = ROOT / "ops" / "ideal" / "george-ahead-of-me.html"
CHROME_CANDIDATES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path("/usr/bin/google-chrome"),
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
]

SCENE_OF = {"situation": "follow-up", "doing": "vague", "nothing": "caveats"}
SIZES = {1440: 900, 1920: 1080}
MAX_ROWS = 200


# ------------------------------------------------------------------ fixtures

def build_scenes(report_path: Path, scenes: list[str]) -> dict[str, Any]:
    from agent import default_composition

    report = json.loads(report_path.read_text(encoding="utf-8"))
    cases = {c.get("scenario"): c for c in report["cases"]}
    out = []
    for scene in scenes:
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
        out.append({
            "scene": scene,
            "from": f"{report_path.name}/{scenario}",
            "question": case.get("question") or "",
            "answer": case.get("answer") or "",
            "at": at or "2026-09-17T00:00:00Z",
            "blocks": default_composition.blocks(seen, max_rows=MAX_ROWS),
            "calls": calls,
        })
    return {"from": str(report_path.relative_to(ROOT)), "desk": desk_definitions(), "scenes": out}


def desk_definitions() -> dict[str, Any] | None:
    """The served desk definitions, built by the route's own function, or None."""
    sys.path.insert(0, str(ROOT / "backend"))
    try:
        from app.api.v1.routes import george  # type: ignore
        got = asyncio.run(george.desk_definitions(user=None))
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
    figure_columns: [...document.querySelectorAll('[data-figure]')].map((el) => Number(el.getAttribute('data-col'))),
    wires: document.querySelectorAll('.r-wires line').length,
    arrows_shown: [...document.querySelectorAll('.r-arr')].filter((a) => !a.hidden).map((a) => a.className),
    page_scrolls: document.documentElement.scrollHeight > innerHeight + 1,
    visible_scrollbars: bars,
    figures_area: box(figs), right: box(right),
  };
})()
"""


async def run(scenes: list[str], out: Path, sizes: dict[int, int], cdp_port: int, base: str) -> dict:
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
                    await page.goto(f"{base}/frames.html?scene={scene}&rail={rail}", width, height, 0.5)
                    # Vite compiles on first request; wait for the room itself,
                    # then for every figure to land (the last at 200 + 260·n ms).
                    for _ in range(120):
                        if await page.eval("!!document.querySelector('.r-beside canvas')"):
                            break
                        await asyncio.sleep(0.5)
                    await asyncio.sleep(3.5)
                    await page.shot(out / f"{stem}-room.png")
                    measured[stem] = await page.eval(MEASURE)
                    # THE DESIGN, the same scene, the sidebar set the same way
                    await page.goto(design, width, height, 2.5)
                    await page.eval(
                        "(() => { const want = %s;"
                        " const open = document.documentElement.getAttribute('data-side') === 'open';"
                        " if (want !== open) document.getElementById(want ? 'reopen' : 'collapse').click();"
                        " const b = document.querySelector('.strip [data-scene=\"%s\"]'); if (b) b.click();"
                        " return true; })()" % ("true" if rail == "open" else "false", scene))
                    await asyncio.sleep(3.0)
                    await page.shot(out / f"{stem}-design.png")
                    print(f"  {stem}: room + design")
    return measured


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenes", nargs="+", default=["situation", "doing", "nothing"])
    ap.add_argument("--report", default="verification/p1close-v2.json")
    ap.add_argument("--out", default="verification/frames/p2s1")
    ap.add_argument("--widths", nargs="+", type=int, default=[1440, 1920])
    args = ap.parse_args(argv)

    out = ROOT / args.out
    out.mkdir(parents=True, exist_ok=True)
    print(f"building {SCENES_OUT.relative_to(ROOT)} from {args.report}")
    fixture = build_scenes(ROOT / args.report, args.scenes)
    SCENES_OUT.parent.mkdir(parents=True, exist_ok=True)
    SCENES_OUT.write_text(json.dumps(fixture, indent=1, ensure_ascii=False), encoding="utf-8")
    scenes = [s["scene"] for s in fixture["scenes"]]

    vite_port, cdp_port = free_port(), free_port()
    profile = tempfile.mkdtemp(prefix="george-frames-")
    vite = start_vite(vite_port)
    chrome = None
    try:
        base = f"http://127.0.0.1:{vite_port}"
        wait_http(f"{base}/frames.html", 90)
        chrome = start_chrome(cdp_port, profile)
        wait_http(f"http://127.0.0.1:{cdp_port}/json/version", 30)
        sizes = {w: SIZES.get(w, 1080) for w in args.widths}
        measured = asyncio.run(run(scenes, out, sizes, cdp_port, base))
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
        cols = "/".join(str(round(c)) for c in m.get("columns_px") or [])
        off = m.get("centre_offset_px")
        print(f"{stem:<24} {'-' if off is None else round(off, 1):>9} {cols:>16} "
              f"{m.get('figures'):>4} {m.get('wires'):>5} {len(m.get('visible_scrollbars') or []):>4} "
              f"{m.get('page_scrolls')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
