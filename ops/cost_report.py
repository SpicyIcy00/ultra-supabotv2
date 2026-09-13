"""What George costs, from what he already records. Read-only, one statement.

WHY THIS EXISTS. Cost was invisible in exactly the way turn time was before
`turn_clock.py`: every token count has been written to `george.conversations`
since the first commit — `input_tokens`, `output_tokens`, `cache_read_tokens`,
`cache_creation_tokens` — and nothing had ever read them. The first run, on
2026-09-13 over 30 days, found 193 turns at **$0.23 each** with a **26.2% cache
hit rate**, and 76% of the bill in uncached input. None of that was known.

WHAT IT DOES NOT DO. It does not estimate, model or project. It multiplies
recorded tokens by a published rate and says what the rate was. A turn that
never reached the API recorded no tokens and costs nothing here.

THE RATES ARE A CONSTANT IN THIS FILE, not a lookup, and they are stamped on
every report with the date they were taken. A price that changes silently
under a report is worse than no report: the number keeps looking authoritative
while meaning something else. If Anthropic's pricing moves, change RATES and
change RATES_AS_OF in the same edit.

    .venv\\Scripts\\python.exe ops/cost_report.py --days 30

Connects with the value of a NAMED environment variable (`DATABASE_URL` by
default, read from `backend/.env` if it is not already set). **The value is
never printed** — CLAUDE.md's hard rule. Only the variable's name and whether
it is set.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Iterable, Optional

# Claude Opus 5, US dollars per million tokens. Cache read is 0.1x input and
# cache write 1.25x input at the default 5-minute TTL; a 1-hour TTL writes at
# 2x. `--ttl 1h` prices writes at the longer rate.
RATES = {"input": 5.00, "output": 25.00, "cache_read": 0.50, "cache_write": 6.25}
CACHE_WRITE_1H = 10.00
RATES_AS_OF = "2026-06-24 (claude-api skill model table)"

QUERY = """
    SELECT count(*)                                      AS turns,
           sum(coalesce(input_tokens, 0))                AS input,
           sum(coalesce(output_tokens, 0))               AS output,
           sum(coalesce(cache_read_tokens, 0))           AS cache_read,
           sum(coalesce(cache_creation_tokens, 0))       AS cache_write,
           avg(coalesce(iterations, 0))::numeric(10, 2)  AS iterations
    FROM george.conversations
    WHERE asked_at >= now() - make_interval(days => %s)
"""


def connection_url(var: str) -> str:
    """The connection string from a NAMED variable. The value is never printed."""
    if not os.environ.get(var):
        env = Path("backend/.env")
        if env.is_file():
            for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if line.startswith(var + "="):
                    os.environ[var] = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    url = os.environ.get(var)
    print(f"{var}: {'set' if url else 'unset'}")
    if not url:
        print(f"Set {var}, or pass --url-env with the name of the variable holding it.")
        sys.exit(2)
    # SQLAlchemy's driver suffix is not psycopg's business.
    for prefix in ("postgresql+psycopg://", "postgresql+asyncpg://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql://" + url[len(prefix):]
    return url


def report(row: dict, days: int, ttl: str) -> int:
    turns = int(row["turns"] or 0)
    if not turns:
        print(f"\nNo turns recorded in the last {days} days.")
        return 0

    write_rate = CACHE_WRITE_1H if ttl == "1h" else RATES["cache_write"]
    tokens = {k: int(row[k] or 0) for k in ("input", "output", "cache_read", "cache_write")}
    rates = dict(RATES, cache_write=write_rate)
    costs = {k: tokens[k] / 1e6 * rates[k] for k in tokens}
    total = sum(costs.values())
    presented = tokens["input"] + tokens["cache_read"] + tokens["cache_write"]

    print(f"\n=== George, last {days} days — rates as of {RATES_AS_OF} ===")
    print(f"turns: {turns}    mean iterations/turn: {row['iterations']}    "
          f"cache write priced at {ttl} TTL\n")
    print(f"{'':16}{'tokens':>14}{'$/MTok':>9}{'cost':>10}{'share':>8}")
    for key, label in (("input", "uncached input"), ("cache_read", "cache READ"),
                       ("cache_write", "cache WRITE"), ("output", "output")):
        share = costs[key] / total * 100 if total else 0.0
        print(f"{label:16}{tokens[key]:>14,}{rates[key]:>9.2f}{costs[key]:>10.2f}{share:>7.1f}%")
    print(f"{'TOTAL':16}{presented + tokens['output']:>14,}{'':>9}{total:>10.2f}")
    print(f"\nper turn: ${total / turns:.4f}    per 100 turns: ${total / turns * 100:.2f}")

    if presented:
        hit = tokens["cache_read"] / presented * 100
        # The counterfactual is what the SAME presented input would cost at the
        # full input rate — not a guess about a different conversation.
        naive = presented / 1e6 * RATES["input"] + costs["output"]
        print(f"\ncache hit rate (read / all presented input): {hit:.1f}%")
        print(f"the same traffic uncached would be ${naive:.2f} — "
              f"caching saves ${naive - total:.2f} ({(1 - total / naive) * 100:.0f}%)")
        if hit < 60:
            print("\nBELOW 60%. The prefix is being rebuilt rather than read. The usual "
                  "cause is TTL: a 5-minute window expires between sessions, so a "
                  "prefix that never changed is paid for at full price on most turns.")
    return 0


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--ttl", choices=("5m", "1h"), default="5m",
                        help="price cache WRITES at this TTL's rate (1h writes at 2x)")
    parser.add_argument("--url-env", default="DATABASE_URL",
                        help="NAME of the variable holding the connection string; "
                             "its value is never printed")
    args = parser.parse_args(list(argv) if argv is not None else None)

    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(connection_url(args.url_env), connect_timeout=20,
                         row_factory=dict_row) as conn:
        row = conn.execute(QUERY, (args.days,)).fetchone()
    return report(row, args.days, args.ttl)


if __name__ == "__main__":
    sys.exit(main())
