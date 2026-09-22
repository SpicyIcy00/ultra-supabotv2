"""
THE CAPABILITY TEST — every save, automation, build and approval the owner asked
for in ops/STANDARD.md sections 9 and 11-15, driven in his own phrases through
the SAME wiring the HTTP route uses (backend/app/api/v1/routes/bob.py: the
eight writers, recall, beliefs, page references), as a separate test user so
nothing lands in his account.

Writes to the live george.* tables. Nothing is switched on: no phrase below
asks for a schedule to be enabled. Cleanup is a separate script, by created_by.

Usage (from backend/, so app imports resolve):
  cd backend && ../.venv/Scripts/python.exe ../ops/captest.py <scenario|all>
  -> verification/captest/captest_<name>.json
Then ALWAYS: .venv/Scripts/python.exe ops/capclean.py (dry run), then --delete.
First run: 2026-09-22, 21 turns, $0.76, median 108 s a turn.
"""
import asyncio
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = "C:/ultra-supabotv2-main"
sys.path.insert(0, ROOT)
sys.path.insert(0, ROOT + "/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT + "/backend/.env")
os.environ.setdefault("ENVIRONMENT", "production")

from app.api.v1.routes import bob as route  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.services import page_writer as pw  # noqa: E402

USER, ROLE = "bob-capability-test", "admin"
# verification/ is gitignored: a run records real rows off the estate.
OUT = ROOT + "/verification/captest"
os.makedirs(OUT, exist_ok=True)

SCENARIOS = {
    # §12 TEMPORARY WORK CAN BECOME PERMANENT
    "keep": [
        "how did Rockwell do last week?",
        "Keep this.",
        "Make this a page.",
        "Watch this.",
        "I want this every Monday.",
        "Turn this into a workflow.",
    ],
    # §13 BOB CAN AUTOMATE
    "automate": [
        "Check stockouts at AJI BARN every morning at 7.",
        "Tell me if any shop's sales drop more than they usually do.",
        "Prepare a replenishment list for the shops every week.",
        "Don't ask me unless it exceeds ₱20,000.",
    ],
    # §11 BOB CAN BUILD THINGS WITH ME
    "build": [
        "I think our purchasing system sucks.",
        "Build it — a weekly purchase plan for our top Seikyo products.",
        "Add supplier lead time.",
        "Include warehouse inventory.",
        "Use 30-day velocity.",
        "Managers can request but I approve.",
    ],
    # §14 BOB CAN RUN THINGS / §15 BOB KNOWS WHEN HE NEEDS ME
    "run": [
        "What needs my approval right now?",
        "Handle the AJI BARN reorder.",
        "You don't need my approval for this anymore unless it's above ₱20,000.",
    ],
    # §9 BOB REMEMBERS AND BUILDS UNDERSTANDING OVER TIME
    "remember": [
        "Remember that Rockwell is under renovation until October.",
        "What do you remember about Rockwell?",
    ],
}

QUIET = {"text", "thinking", "tool_call", "tool_result"}


async def turn(question, history, thread):
    recall = await route._recall_for(USER, history, thread)
    held, bound = await route._beliefs_for()
    async with AsyncSessionLocal() as s:
        refs = [{"page_id": str(p.id), "title": p.title}
                for p in (await pw.list_pages(s, USER))[:pw.MAX_PAGES_PER_OWNER]]
    stream = route._safe_stream(
        question, user_id=USER, page_context=None,
        pin_writer=route._pin_writer(USER), history=history,
        workflow_writer=(route._WorkflowWriter(USER, ROLE)
                         if settings.GEORGE_ENABLE_WORKFLOW_WRITES else None),
        workflow_runner=route._workflow_runner(USER, ROLE),
        thread_id=thread, recall=recall, beliefs=held,
        belief_store=route._belief_store(USER, thread), parent_id=None,
        page_reader=None, page_scope=None, page_references=refs,
        memory_reader=route._memory_reader(USER),
        automations_reader=route._automations_reader(USER),
        decisions_reader=route._decisions_reader(),
        standing_writer=route._standing_writer(USER),
        watch_writer=route._watch_writer(USER),
        desk=None, bound_settings=bound or None,
        page_writer=route._PageWriter(USER, None),
        # W2.2: the line and the queue, as the route injects them. The test
        # user is linked to nobody, so it submits as a requester and any
        # change to the line is refused — as it would be for anyone not Joy.
        authority=route._authority_writer(USER, ROLE),
    )
    t0 = time.monotonic()
    rec = {"q": question, "calls": [], "errors": [], "warnings": [], "events": [],
           "answer": "", "thread": thread}
    answer = []
    async for frame in stream:
        frame = frame.decode() if isinstance(frame, bytes) else frame
        head, _, body = frame.partition("\n")
        kind = head.replace("event: ", "").strip()
        try:
            data = json.loads(body.replace("data: ", "", 1).strip() or "{}")
        except Exception:  # noqa: BLE001
            continue
        if kind == "start":
            rec["thread"] = data.get("thread_id") or rec["thread"]
        elif kind == "text":
            answer.append(data.get("delta") or "")
        elif kind == "answer_reset":
            answer = []
        elif kind == "tool_call":
            rec["calls"].append({"seq": data.get("seq"), "tool": data.get("tool"),
                                 "arguments": data.get("arguments")})
        elif kind == "tool_result":
            if data.get("error"):
                rec["errors"].append({"seq": data.get("seq"), "error": str(data.get("error"))[:400]})
        elif kind == "warning":
            rec["warnings"].append(data.get("reason"))
        elif kind not in QUIET:
            rec["events"].append({"kind": kind, "data": json.dumps(data, default=str)[:600]})
    rec["answer"] = "".join(answer).strip()
    rec["seconds"] = round(time.monotonic() - t0, 1)
    return rec


async def scenario(name):
    history, thread, out = [], None, []
    for q in SCENARIOS[name]:
        print(f"[{name}] {q}", flush=True)
        try:
            r = await turn(q, history, thread)
        except Exception as e:  # noqa: BLE001
            r = {"q": q, "crash": f"{type(e).__name__}: {str(e)[:400]}"}
            out.append(r)
            print(f"   CRASH {r['crash']}", flush=True)
            break
        thread = r["thread"]
        out.append(r)
        writes = [c["tool"] for c in r["calls"]
                  if c["tool"] and not c["tool"].startswith("get_") and c["tool"] != "compose"]
        print(f"   {r['seconds']}s  writes/views={writes}  errors={len(r['errors'])}  "
              f"-> {r['answer'][:150]!r}", flush=True)
        history += [{"role": "user", "text": q, "tool_calls": []},
                    {"role": "bob", "text": r["answer"][:19000],
                     "tool_calls": [{"tool": c["tool"], "arguments": c["arguments"] or {}}
                                    for c in r["calls"]
                                    if c["tool"] and c["seq"] not in {e["seq"] for e in r["errors"]}
                                    and c["tool"] != "compose"][-20:]}]
    json.dump(out, open(f"{OUT}/captest_{name}.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, default=str)


async def main():
    names = list(SCENARIOS) if sys.argv[1] == "all" else [sys.argv[1]]
    for n in names:
        await scenario(n)


asyncio.run(main())
