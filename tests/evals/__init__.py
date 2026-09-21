"""
Behavioural evaluations of Bob — live model, live database, opt in.

These are not unit tests. Each runs one question through agent.loop.run with
the real tools and the real model, then asserts STRUCTURE: which tools were
called with what, whether the windows agree, whether the reads fanned out,
whether every notice reached the answer, whether every figure in the prose
came from a row, and whether an inference was phrased as one. Wording is not
asserted where a semantic check exists; a rubric judge is optional and never
gates.

Run with:

    set -a; . backend/.env; set +a
    export ENVIRONMENT=production GEORGE_EVALS=1
    pytest tests/evals -q -s

Without GEORGE_EVALS=1, GEORGE_DATABASE_URL and the answering provider's key
(DEEPSEEK_API_KEY by default; see agent/provider.py) the suite skips. GEORGE_EVAL_JUDGE=1 adds the rubric judge; GEORGE_EVAL_REPORT=<path>
writes the per-scenario record as JSON.
"""
