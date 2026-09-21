"""
WHICH MODEL ANSWERS, AND WHERE THE REQUEST GOES.

Added 2026-09-21, when the owner ran out of Anthropic credit mid-session and
asked to try DeepSeek: *"try this deepseek api for abit ... but make it easy to
swap."* So this is a switch, not a port. Unset, every value here is the one the
loop has always used and the request is byte for byte the request it made
before this file existed.

WHAT MADE IT A SWITCH AND NOT A PORT. DeepSeek publishes an ANTHROPIC-shaped
endpoint at `https://api.deepseek.com/anthropic`, and it was probed feature by
feature against the exact request this loop sends (2026-09-21): tool use,
streaming with tool_use blocks, a `system` list, `cache_control` at both TTLs
on tools and on system, the top-level `cache_control`, `thinking` (adaptive and
budgeted), `output_config` and the beta header — every one accepted. Whether it
IMPLEMENTS caching and effort is its own business; nothing here has to be
stripped for the request to be legal, so there is no second request shape to
keep working.

    BOB_API_BASE_URL   where the request goes. UNSET = Anthropic.
    BOB_MODEL          the model name that provider knows it by.
    BOB_API_KEY_VAR    which environment variable holds the key for it, so the
                       key itself is never named here and never logged.
    BOB_MAX_TOKENS     a smaller output ceiling where a provider has one.

THE KEY IS READ BY NAME, NEVER HELD. `client_kwargs` looks the variable up at
call time and hands it to the SDK. Nothing in this module returns, prints or
stores a key, and `describe()` — which is what reaches a log — names the host
and the model and nothing else (CLAUDE.md, "Never print a secret's value").
"""
from __future__ import annotations

import os
from typing import Any, Optional
from urllib.parse import urlsplit

#: What the loop uses when nothing is set. The Anthropic defaults, unchanged.
DEFAULT_MODEL = "claude-opus-5"
DEFAULT_MAX_TOKENS = 64000


def base_url() -> Optional[str]:
    """Where the request goes, or None for Anthropic's own endpoint."""
    return (os.environ.get("BOB_API_BASE_URL") or "").strip() or None


def is_anthropic() -> bool:
    """Whether this is the endpoint every measurement in this repo was taken on."""
    return base_url() is None


def model(default: str = DEFAULT_MODEL) -> str:
    return (os.environ.get("BOB_MODEL") or "").strip() or default


def max_tokens(default: int = DEFAULT_MAX_TOKENS) -> int:
    said = (os.environ.get("BOB_MAX_TOKENS") or "").strip()
    if not said:
        return default
    try:
        # A ceiling, never a raise: a provider's smaller limit is the only
        # reason to set this, and a typo that RAISED it would 400 every turn.
        return max(1, min(default, int(said)))
    except ValueError:
        return default


def client_kwargs() -> dict[str, Any]:
    """
    What to hand `anthropic.AsyncAnthropic(...)`.

    Empty on Anthropic, so the client is constructed exactly as it was and
    picks up ANTHROPIC_API_KEY from the environment by itself.
    """
    where = base_url()
    if where is None:
        return {}
    key_var = (os.environ.get("BOB_API_KEY_VAR") or "").strip() or "ANTHROPIC_API_KEY"
    key = os.environ.get(key_var)
    if not key:
        raise RuntimeError(
            f"BOB_API_BASE_URL is set but {key_var} is not — name the variable "
            f"that holds the key with BOB_API_KEY_VAR, and set it."
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
