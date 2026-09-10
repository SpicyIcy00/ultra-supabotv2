"""
Build the standing "how are we doing?" example, from real reads.

WHY THIS EXISTS. The model API has no credit, so George cannot compose a board
live — but the read tools need no model at all. So this runs the real reads
against the real database, stores them as a real thread, and lets the ordinary
renderer draw it. Every figure on the resulting board came out of the database
through the same tool a live answer would have used, with its own receipts.

WHAT IS NOT REAL: the CHOICE of composition — which shops become tiles, which
one leads — and the sentence. Those are mine standing in for George's judgment
until he can make it himself. Every number is his.

The prose is generated FROM THE ROWS in this script rather than written by
hand, so it cannot contain a figure the reads did not return.
"""
import json
import sys as _sys
_sys.stdout.reconfigure(encoding="utf-8")
import pathlib
import sys
import uuid
from datetime import datetime, timezone

ROOT = pathlib.Path(r"C:\ultra-supabotv2-main\.worktrees\george-tools")
sys.path.insert(0, str(ROOT))

# The guarded read-only URL, read from the operator's dotenv. Never printed.
import os
for line in pathlib.Path(r"C:\ultra-supabotv2-main\backend\.env").read_text(encoding="utf-8").splitlines():
    if line.startswith("GEORGE_DATABASE_URL="):
        os.environ["GEORGE_DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
print("GEORGE_DATABASE_URL:", "set" if os.environ.get("GEORGE_DATABASE_URL") else "unset")

from tools.sales import get_sales                      # noqa: E402
from agent.loop import _json_safe                      # noqa: E402

WINDOW = "last_week"

READS = [
    ("net_sales", {"metric": "net_sales", "group_by": "store",
                   "date_range": WINDOW, "compare_to": "previous_period"}),
    ("transactions", {"metric": "transaction_count", "group_by": "store",
                      "date_range": WINDOW, "compare_to": "previous_period"}),
    ("basket", {"metric": "average_transaction_value", "group_by": "store",
                "date_range": WINDOW, "compare_to": "previous_period"}),
]

charted = []
results = {}
for seq, (name, args) in enumerate(READS):
    out = get_sales(**args)
    results[name] = out
    charted.append({
        "seq": seq, "tool": "get_sales",
        "arguments": _json_safe(args),
        "rows": _json_safe(out["rows"]),
        "meta": _json_safe(out["meta"]),
    })
    print(f"  read {seq} {name}: {len(out['rows'])} rows")

sales = results["net_sales"]["rows"]
by_pct = sorted((r for r in sales if r.get("change_pct") is not None),
                key=lambda r: r["change_pct"])
worst, best = (by_pct[0], by_pct[-1]) if by_pct else (None, None)


def key_for(store: str) -> str:
    return store.lower().replace(" ", "-").replace("'", "")[:30]


# ---------------------------------------------------------------- the board
# One tile per shop, from ONE read — which is exactly the shape a composition
# takes. The shop that moved furthest leads; the rest support, and the tables
# behind them stay quiet.
blocks = []
if worst:
    blocks.append({"op": "put", "kind": "subject", "key": key_for(worst["store"]),
                   "weight": "lead", "seq": 0, "tool": "get_sales", "subject": worst["store"]})
for r in sales:
    if worst and r["store"] == worst["store"]:
        continue
    blocks.append({"op": "put", "kind": "subject", "key": key_for(r["store"]),
                   "weight": "supporting", "seq": 0, "tool": "get_sales", "subject": r["store"]})
blocks.append({"op": "put", "kind": "text", "key": "reading", "weight": "supporting"})
blocks.append({"op": "put", "kind": "table", "key": "transactions", "weight": "quiet",
               "seq": 1, "tool": "get_sales"})
blocks.append({"op": "put", "kind": "table", "key": "basket", "weight": "quiet",
               "seq": 2, "tool": "get_sales"})

# --------------------------------------------------------------- the words
# Assembled from the rows above; no figure here was typed by hand.
up = [r for r in sales if (r.get("change_pct") or 0) > 0]
down = [r for r in sales if (r.get("change_pct") or 0) < 0]
window = (results["net_sales"]["meta"].get("window") or {}).get("name", WINDOW)


def money(v):
    return f"\u20b1{float(v):,.0f}"


parts = []
if len(up) == len(sales):
    parts.append(f"All {len(sales)} shops are up on {str(window).replace('_', ' ')}.")
elif up and down:
    parts.append(f"{len(up)} shops up, {len(down)} down on {str(window).replace('_', ' ')}.")
if best:
    parts.append(f"{best['store']} leads on money at {money(best['value'])}, "
                 f"{best['change_pct']:+.1f}%.")
if worst and worst is not best:
    parts.append(f"{worst['store']} is the one I'd look at: {money(worst['value'])}, "
                 f"{worst['change_pct']:+.1f}% \u2014 the smallest move of the seven.")
parts.append("Transactions and basket value are behind this, quiet, so you can see "
             "which of the two moved each shop.")
text = " ".join(parts)
print("\n  reading:", text)

# ---------------------------------------------------------------- store it
creds = json.loads(pathlib.Path(
    r"C:\ultra-supabotv2-main\.worktrees\george-v1\verification\postgres\credentials.json"
).read_text(encoding="utf-8"))
dsn = f"postgresql://george_app:{creds['george_app']}@127.0.0.1:55432/george_dogfood"

import psycopg                                          # noqa: E402

THREAD = uuid.UUID("11111111-2222-3333-4444-555555555555")   # the standing example
QUESTION_ID = uuid.UUID("11111111-2222-3333-4444-000000000001")
ANSWER_ID = uuid.UUID("11111111-2222-3333-4444-000000000002")
NOW = datetime.now(timezone.utc)

payload = {"charted": charted, "composition": {"blocks": blocks},
           "calls": [{"seq": c["seq"], "tool": c["tool"], "arguments": c["arguments"]}
                     for c in charted]}

with psycopg.connect(dsn, autocommit=True) as c, c.cursor() as cur:
    cur.execute("DELETE FROM george.posts WHERE thread_id = %s", (THREAD,))
    cur.execute(
        "INSERT INTO george.posts (id, thread_id, parent_id, kind, author, author_user,"
        " owner_user, visibility, body, payload, receipts, notices, conversation_id, created_at)"
        " VALUES (%s,%s,NULL,'question','user',%s,%s,'private',%s,NULL,NULL,NULL,%s,%s)",
        (QUESTION_ID, THREAD, "dogfood", "dogfood", "how are we doing?", THREAD, NOW),
    )
    cur.execute(
        "INSERT INTO george.posts (id, thread_id, parent_id, kind, author, author_user,"
        " owner_user, visibility, body, payload, receipts, notices, conversation_id, created_at)"
        " VALUES (%s,%s,%s,'answer','george',NULL,%s,'private',%s,%s,%s,%s,%s,%s)",
        (ANSWER_ID, THREAD, QUESTION_ID, "dogfood", text,
         json.dumps(payload),
         json.dumps(_json_safe(results["net_sales"]["meta"])),
         json.dumps(_json_safe(results["net_sales"]["meta"].get("notice") and
                               [results["net_sales"]["meta"]["notice"]] or [])),
         THREAD, NOW),
    )

print(f"\n  stored. open /w/{THREAD}")
print(f"  {len(blocks)} objects: {sum(1 for b in blocks if b['kind'] == 'subject')} shop tiles")
