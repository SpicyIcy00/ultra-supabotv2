"""
WHICH MODEL ANSWERS, AND WHERE THE REQUEST GOES.

Added 2026-09-21, when the owner ran out of Anthropic credit mid-session and
asked to try DeepSeek: *"try this deepseek api for abit ... but make it easy to
swap."* Measured the same day, then made the default by his decision — *"go
with the flash as default"*:

                        broad turn        mean        notice_forced
    claude-opus-5       136 s  $1.010     136 s       8 of 197 turns (4%)
    deepseek-chat       229 s  $0.082     130 s       2 of 3
    deepseek-v4-pro     647 s  $0.289     647 s       1 of 1

Same wall-clock as Opus for about a twenty-third of the money, and its work
won a blind eight-judge comparison against Opus 5-3 (four lenses, both reading
orders, neither page naming its model; page design was unanimous). It reads
wider and decides more — it refused to ship a replenishment plan built on stock
counts recorded below zero, which Opus filed as a mere qualification. What it is
WORSE at is carrying a required caveat in its own prose, so the loop appends
one: the figure it must beat is that 4%.

`deepseek-chat` is an ALIAS for `deepseek-v4-flash`, their cheap tier, and it is
the one to use. The API offers exactly two models — `deepseek-flash` and
`deepseek-v4-pro` — and pro is five times slower, six times the price of flash
and tripped MORE of this loop's gates, the page gate among them.

WHY THIS IS A SWITCH AND NOT A PORT. DeepSeek publishes an ANTHROPIC-shaped
endpoint, probed feature by feature against the exact request this loop sends:
tool use, streaming with tool_use blocks, a `system` list, `cache_control` at
both TTLs on tools and on system, the top-level `cache_control`, `thinking`
(adaptive and budgeted), `output_config` and the beta header — every one
accepted, and cache hits are really reported (470,144 on the first live turn).
Nothing has to be stripped for the request to be legal, so there is no second
request shape to keep working, and going back to Anthropic is one variable.

    BOB_PROVIDER       which set of defaults below. "deepseek" (the default) or
                       "anthropic". THE WAY BACK TO OPUS IS BOB_PROVIDER=anthropic.
    BOB_API_BASE_URL   override just the endpoint.
    BOB_MODEL          override just the model name.
    BOB_API_KEY_VAR    override which environment variable holds the key.
    BOB_MAX_TOKENS     a smaller output ceiling; it only ever comes DOWN.

THE KEY IS READ BY NAME, NEVER HELD. Every provider below names the VARIABLE
that holds its key, never a key; `client_kwargs` looks it up at call time.
Nothing here returns, prints or stores one, and `describe()` — which is what
reaches a log — gives the host and the model and nothing else (CLAUDE.md,
"Never print a secret's value").
"""
from __future__ import annotations

import os
from typing import Any, Optional
from urllib.parse import urlsplit

#: One entry per place a request can go. `base_url: None` means Anthropic's own
#: endpoint, where the SDK builds the client exactly as it did before this file.
PROVIDERS: dict[str, dict[str, Any]] = {
    "deepseek": {
        "base_url": "https://api.deepseek.com/anthropic",
        "model": "deepseek-chat",          # -> deepseek-v4-flash
        "key_var": "DEEPSEEK_API_KEY",
        "max_tokens": 64000,
    },
    "anthropic": {
        "base_url": None,
        "model": "claude-opus-5",
        "key_var": "ANTHROPIC_API_KEY",
        "max_tokens": 64000,
    },
}

#: WHAT A MILLION TOKENS COSTS, in USD, for whatever answers (2026-09-22). The
#: eval harness priced every turn at Opus's rates after Bob moved to DeepSeek,
#: so a run would have reported ~20x what it cost — and it was the $4.79 Opus
#: price of a full run that made "no live tests until the phase closes" a rule.
#: DeepSeek at its PEAK (the worse) half, from api-docs.deepseek.com/quick_start/
#: pricing, re-read 2026-09-22 (off-peak is half); no separate cache-write charge. Anthropic's at the
#: figures ops/cost_report.py has always used (2026-06-24).
RATES: dict[str, dict[str, float]] = {
    "deepseek": {"input": 0.30, "output": 1.20, "cache_read": 0.006, "cache_creation": 0.0},
    "anthropic": {"input": 5.00, "output": 25.00, "cache_read": 0.50, "cache_creation": 6.25},
}
RATES_AS_OF = {"deepseek": "2026-09-22 (peak)", "anthropic": "2026-06-24"}

#: The owner's decision, 2026-09-21. Every measurement taken BEFORE that date
#: was taken on Anthropic, so a number from an older run record is compared
#: across providers only with `model` read off the row.
DEFAULT_PROVIDER = "deepseek"


def provider_name() -> str:
    """
    Which entry of PROVIDERS is in force.

    An unknown name RAISES rather than falling back: a typo that silently
    served a different model than the one asked for would make every number
    recorded under it a lie about which model produced it.
    """
    said = (os.environ.get("BOB_PROVIDER") or "").strip().lower() or DEFAULT_PROVIDER
    if said not in PROVIDERS:
        known = ", ".join(sorted(PROVIDERS))
        raise RuntimeError(f"BOB_PROVIDER={said!r} is not one of: {known}")
    return said


def _spec() -> dict[str, Any]:
    return PROVIDERS[provider_name()]


def base_url() -> Optional[str]:
    """Where the request goes, or None for Anthropic's own endpoint."""
    told = (os.environ.get("BOB_API_BASE_URL") or "").strip()
    return told or _spec()["base_url"]


def is_anthropic() -> bool:
    """Whether this is the endpoint every measurement before 2026-09-21 used."""
    return base_url() is None


def model() -> str:
    return (os.environ.get("BOB_MODEL") or "").strip() or str(_spec()["model"])


def max_tokens() -> int:
    ceiling = int(_spec()["max_tokens"])
    said = (os.environ.get("BOB_MAX_TOKENS") or "").strip()
    if not said:
        return ceiling
    try:
        # A ceiling, never a raise: a provider's smaller limit is the only
        # reason to set this, and a typo that RAISED it would 400 every turn.
        return max(1, min(ceiling, int(said)))
    except ValueError:
        return ceiling


def rates() -> dict[str, float]:
    """USD per million tokens for the provider in force: input, output, cache_read, cache_creation."""
    return dict(RATES[provider_name()])


def rates_as_of() -> str:
    return RATES_AS_OF[provider_name()]


def key_var() -> str:
    return (os.environ.get("BOB_API_KEY_VAR") or "").strip() or str(_spec()["key_var"])


def client_kwargs() -> dict[str, Any]:
    """
    What to hand `anthropic.AsyncAnthropic(...)`.

    Empty on Anthropic, so the client is constructed exactly as it was and
    picks up ANTHROPIC_API_KEY from the environment by itself.
    """
    where = base_url()
    if where is None:
        return {}
    name = key_var()
    key = os.environ.get(name)
    if not key:
        raise RuntimeError(
            f"Bob is set to {provider_name()} ({urlsplit(where).hostname}) but "
            f"{name} is not set — set it, or set BOB_PROVIDER=anthropic to go back."
        )
    return {"base_url": where, "api_key": key}


def describe() -> str:
    """
    One line for a log: the host and the model, and never the key.

    `urlsplit().hostname` and nothing else of the URL, because a base_url is a
    place a key gets pasted by accident and a log is forever.
    """
    where = base_url()
    host = urlsplit(where).hostname if where else "api.anthropic.com"
    return f"{host} · {model()}"
