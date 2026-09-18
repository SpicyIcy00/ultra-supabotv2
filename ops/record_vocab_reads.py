"""
Record one real read per shape Bob can draw (P2S.3).

WHY. The card's done-when is "each shape has a golden render test off recorded
rows", and no eval has ever recorded a read grouped by two things — store by
hour, store by category, store by week — because Bob has never had a shape
to draw one as. So this runs the vetted tools directly, read-only, with no
model in the loop, and writes what they returned — rows and `meta` whole — to
`frontend/src/room/__fixtures__/vocab-reads.json`. The golden tests
(`vocab.dom.test.tsx`), the shape contract (`tests/test_vocabulary_contract.py`)
and the `vocab` frame (`ops/frames.py`) all draw from that one file.

Nothing here is a definition. Which store a read is filtered to comes out of
`stores.active_retail` in the definitions, never typed.

    .venv\\Scripts\\python.exe ops/record_vocab_reads.py            # read again, then the matrix
    .venv\\Scripts\\python.exe ops/record_vocab_reads.py --matrix   # the matrix only, same rows
    .venv\\Scripts\\python.exe ops/record_vocab_reads.py --only scatter   # one shape again

THE MATRIX. `_drawable` (which shapes each read's rows can make) and `_default`
(the shape `default_composition.shape_for` gives it) are written beside the
rows by the SERVER's rules. `tests/test_vocabulary_contract.py` fails if the
server's rules no longer give them, and `vocab.dom.test.tsx` fails if the
client's do not — so the two implementations are held to one answer. Change a
rule on purpose, run `--matrix`, and read the diff.

Map and funnel are not here: `composition.declined` says why.
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / "backend" / ".env")

from tools._common import load_defs  # noqa: E402
from tools.sales import get_sales  # noqa: E402

OUT = ROOT / "frontend" / "src" / "room" / "__fixtures__" / "vocab-reads.json"

# The meta keys a drawing never reads and a fixture need not carry: the SQL the
# tool ran and where the definitions file sat on the recording machine.
DROP_META = {"metric_sql", "definitions_path"}


def _twelve_weeks() -> list[str]:
    """Twelve closed Monday-to-Monday weeks ending this week, in Manila."""
    today = datetime.now(ZoneInfo("Asia/Manila")).date()
    monday = today - timedelta(days=today.weekday())
    return [(monday - timedelta(weeks=12)).isoformat(), monday.isoformat()]


def matrix(out: dict, defs: dict) -> None:
    """Which shapes each recorded read can make, and its default — by the server's rules."""
    from agent import default_composition, vocabulary

    marks = [k for k, v in defs["composition"]["widgets"].items() if v.get("rows")]
    reads = {k: v for k, v in out.items() if not k.startswith("_")}
    out["_drawable"] = {
        name: [k for k in marks if vocabulary.drawable(k, read["rows"], defs, read["channels"])]
        for name, read in reads.items()
    }
    out["_default"] = {
        name: default_composition.shape_for({"tool": read["tool"], "rows": read["rows"]},
                                            0, "k", "lead")["kind"]
        for name, read in reads.items()
    }


def main() -> None:
    defs = load_defs()
    only = sys.argv[sys.argv.index("--only") + 1:] if "--only" in sys.argv else None
    if "--matrix" in sys.argv:
        out = json.loads(OUT.read_text(encoding="utf-8"))
        matrix(out, defs)
        OUT.write_text(json.dumps(out, indent=1, default=str, ensure_ascii=False) + "\n",
                       encoding="utf-8")
        print(f"matrix rewritten in {OUT.relative_to(ROOT)}")
        return
    first_shop = defs["stores"]["active_retail"][0]["display_name"]
    shop = {"store": first_shop}

    # shape -> (tool function, arguments, the channels a block names, if any)
    plan: dict[str, tuple] = {
        "figure": (get_sales, {"group_by": [], "date_range": "last_month",
                               "compare_to": "previous_period", "filters": shop}, {}),
        "gauge": (get_sales, {"group_by": [], "date_range": "last_month",
                              "compare_to": "previous_period", "filters": shop}, {}),
        "dumbbell": (get_sales, {"group_by": "store", "date_range": "last_month",
                                 "compare_to": "previous_period"}, {}),
        "bar": (get_sales, {"group_by": "store", "date_range": "last_month",
                            "compare_to": "previous_period"}, {}),
        "ranked": (get_sales, {"group_by": "store", "date_range": "last_month"}, {}),
        "pie": (get_sales, {"group_by": "store", "date_range": "last_month"}, {}),
        "treemap": (get_sales, {"group_by": "category", "metric": "product_revenue",
                                "date_range": "last_month"}, {}),
        "contributors": (get_sales, {"group_by": "product", "metric": "product_revenue",
                                     "date_range": "last_month", "compare_to": "previous_period",
                                     "filters": shop, "top_n": 8, "rank_by": "biggest_drop"}, {}),
        "waterfall": (get_sales, {"group_by": "product", "metric": "product_revenue",
                                  "date_range": "last_month", "compare_to": "previous_period",
                                  "filters": shop, "top_n": 8, "rank_by": "biggest_drop"}, {}),
        "line": (get_sales, {"group_by": "day", "date_range": "last_month", "filters": shop}, {}),
        "area": (get_sales, {"group_by": "day", "date_range": "last_month"}, {}),
        "calendar": (get_sales, {"group_by": "day", "date_range": "last_month", "filters": shop}, {}),
        "multiples": (get_sales, {"group_by": ["store", "week"], "date_range": _twelve_weeks()}, {}),
        "stacked": (get_sales, {"group_by": ["store", "category"], "metric": "product_revenue",
                                "date_range": "last_month"}, {}),
        "heatmap": (get_sales, {"group_by": ["store", "hour"], "date_range": "last_month"}, {}),
        # Over the shops, not products: one product sells thirty times the next,
        # and a scatter of that read is one dot and a smudge in a corner.
        "scatter": (get_sales, {"group_by": "store", "date_range": "last_month",
                                "compare_to": "previous_period"},
                    {"field": "value", "against": "baseline"}),
        # Exact pesos someone will act on: the products, not the shops a bar,
        # a dumbbell and a scatter already draw.
        "table": (get_sales, {"group_by": "product", "metric": "product_revenue",
                              "date_range": "last_month", "compare_to": "previous_period",
                              "filters": shop, "top_n": 10}, {}),
    }

    if only:
        # RE-RECORD NAMED SHAPES ONLY, keeping every other read as it was — so
        # the golden snapshots of the rest do not move with the estate's data.
        out = json.loads(OUT.read_text(encoding="utf-8"))
        plan = {k: v for k, v in plan.items() if k in only}
    else:
        out = {
            "_why": ("One real read per shape, recorded by ops/record_vocab_reads.py with "
                     "the vetted tools and no model. Rows and meta as the tool returned them."),
            "_recorded": date.today().isoformat(),
        }
    for shape, (fn, arguments, channels) in plan.items():
        result = fn(**arguments)
        meta = {k: v for k, v in (result.get("meta") or {}).items() if k not in DROP_META}
        out[shape] = {
            "tool": fn.__name__,
            "arguments": arguments,
            "channels": channels,
            "rows": result.get("rows") or [],
            "meta": meta,
        }
        print(f"{shape:13s} {fn.__name__:15s} {len(out[shape]['rows']):4d} rows")

    matrix(out, defs)
    OUT.write_text(json.dumps(out, indent=1, default=str, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
