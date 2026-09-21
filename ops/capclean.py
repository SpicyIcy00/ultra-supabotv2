"""
Remove every functional row the capability test created, and nothing else.

Rows are matched ONLY by the test user's name in the column that records who
made them. The conversation logs (george.conversations / tool_calls / gaps /
posts) are kept on purpose: they are the evidence of what the test did.

  capclean.py          -> list what would go (dry run, the default)
  capclean.py --delete -> delete it, in one transaction
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from dotenv import load_dotenv  # noqa: E402
import psycopg  # noqa: E402

load_dotenv("C:/ultra-supabotv2-main/backend/.env")
URL = (os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
       .replace("postgresql+psycopg://", "postgresql://"))
U = "bob-capability-test"

# Children before parents, so the foreign keys hold.
STEPS = [
    # Including runs the test asked for on the OWNER's workflows (it ran his
    # "PO Maker" twice) -- matched by who requested them, never by workflow.
    ("workflow_runs", "requested_by=%s or workflow_id in (select id from george.workflows where created_by=%s)"),
    ("workflow_schedules", "created_by=%s or workflow_id in (select id from george.workflows where created_by=%s)"),
    ("workflow_versions", "workflow_id in (select id from george.workflows where created_by=%s)"),
    ("workflows", "created_by=%s"),
    ("pins", "created_by=%s"),
    ("page_events", "page_id in (select id from george.pages where owner=%s)"),
    ("pages", "owner=%s"),
    ("standing_questions", "owner=%s"),
    ("watch_checks", "watch_id in (select id from george.watches where owner=%s)"),
    ("watches", "owner=%s"),
    ("beliefs", "created_by=%s"),
]


def main(delete: bool) -> None:
    with psycopg.connect(URL) as c:
        cols = {t: {r[0] for r in c.execute(
            "select column_name from information_schema.columns "
            "where table_schema='george' and table_name=%s", (t,))} for t, _ in STEPS}
        total = 0
        for table, where in STEPS:
            if not cols[table]:
                continue
            args = (U,) * where.count("%s")
            try:
                n = c.execute(f"select count(*) from george.{table} where {where}", args).fetchone()[0]
            except Exception as e:  # noqa: BLE001  a column this table does not have
                c.rollback()
                print(f"  {table:<20} skipped ({type(e).__name__})")
                continue
            total += n
            print(f"  {table:<20} {n} row(s)")
            if delete and n:
                c.execute(f"delete from george.{table} where {where}", args)
        if delete:
            c.commit()
            print(f"deleted {total} row(s)")
        else:
            print(f"{total} row(s) would go -- run with --delete to remove them")


main("--delete" in sys.argv)
