r"""
The boards the recorded gate runs produced, as a fixture the room can draw.

    .venv\Scripts\python.exe ops/recorded_board.py ^
        verification/p1c-gate-2.json verification/dogfood-remainder-caveats.json

WHY THIS EXISTS. P1.e's Done-when is "every block in four recorded runs renders
as one of the six with a source line", and the renderer is TypeScript while the
runs are a Python report. Both recordings of the four gate scenarios are passed,
which is eight runs — the newest, and the one before it, because between them
they put one more shape on the board than either does alone. So this converts one into the other: it reads a
recorded run, rebuilds the blocks that board held, and writes them beside the
rows and the `meta` they were drawn over, into a fixture the vitest suite
renders for real. No model, no database, no cost.

WHAT IT CAN AND CANNOT RECOVER, said plainly because it bounds what the test
proves. An eval report records every read's rows and `meta` whole, so the DATA
is exactly what was on screen. It does NOT record the blocks Bob composed —
the `compose` calls are in the call list with a row count and nothing else — so
the blocks here are the LOADED DEFAULT (`agent/default_composition.py`), which
is the board from the moment the reads land until his composition supersedes
the reads he touched. That is a real board state and not a reconstruction of
one: it is the same validated shape, through the same `compose.validate`, and
it is what the screen actually held from the moment the rows landed.

What it therefore does not cover is a kind the default composer never emits —
`hero`, `subject`, `distribution`, `timeline`, `recommendation`, `draft`,
`state`, `system`, `control`. Those are covered by exhaustion over the
vocabulary instead, in `catalogue.test.ts`, which walks every kind in
`composition.widgets` and fails on one that is neither a mark nor a named
object.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent import default_composition  # noqa: E402

OUT = Path("frontend/src/room/__fixtures__/recorded-runs.json")
# compose.MAX_ROWS_TO_CLIENT's role here: a read whose rows the client never
# received whole draws nothing, so the default skips it. The recorded reports
# carry the rows the client got, so every row here is one the screen had.
MAX_ROWS = 200


def board_of(case: dict) -> tuple[list[dict], list[dict]]:
    """(blocks, calls) for one recorded case — the reads only, in seq order."""
    reads = [r for r in case.get("results") or [] if not r.get("error")]
    calls: dict[int, dict[str, Any]] = {}
    out_calls: list[dict] = []
    for seq, r in enumerate(reads):
        result = r.get("result") or {}
        rows = result.get("rows") or []
        calls[seq] = {
            "is_read": True,
            "error": None,
            "duplicate": False,
            "tool": r.get("tool"),
            "rows": rows,
        }
        out_calls.append({
            "seq": seq,
            "tool": r.get("tool"),
            "arguments": r.get("arguments") or {},
            "result": {"rows": rows, "meta": result.get("meta") or {}},
        })
    return default_composition.blocks(calls, max_rows=MAX_ROWS), out_calls


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    runs = []
    for path in argv[1:]:
        report = json.loads(Path(path).read_text(encoding="utf-8"))
        cases = report["cases"] if isinstance(report, dict) else report
        for case in cases:
            blocks, calls = board_of(case)
            runs.append({
                "run": f"{Path(path).stem}/{case.get('scenario')}",
                "scenario": case.get("scenario"),
                "question": case.get("question"),
                "blocks": blocks,
                "calls": calls,
            })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "from": list(argv[1:]),
        "how": "agent/default_composition.blocks over the recorded reads; "
               "Bob's own blocks are not recorded in an eval report",
        "runs": runs,
    }, indent=1), encoding="utf-8")
    total = sum(len(r["blocks"]) for r in runs)
    print(f"{OUT}: {len(runs)} runs, {total} blocks")
    for r in runs:
        print(f"  {r['run']:<38} {[b['kind'] for b in r['blocks']]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
