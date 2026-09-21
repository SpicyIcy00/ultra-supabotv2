"""
WHICH MODEL ANSWERS, AND WHERE (agent/provider.py, 2026-09-21).

The owner ran out of Anthropic credit mid-session: *"try this deepseek api for
abit ... but make it easy to swap."* This holds the two halves of "easy":

  UNSET IS UNCHANGED. Every measurement in this repo — the 1,800-word prompt
  budget, the cache breakpoints, the 130 s / 9,444-token turn — was taken on
  Anthropic. With nothing set the request must be the one it always was, or
  none of those numbers mean anything any more.

  SET IS ONE SWITCH. A base URL, a model name, and the NAME of the variable
  holding the key. Nothing in the module holds or returns a key, and what it
  offers a log is a hostname and a model (CLAUDE.md, "Never print a secret's
  value").

DeepSeek publishes an Anthropic-shaped endpoint, probed feature by feature
against this loop's real request on 2026-09-21 — tools, streaming, the system
list, both cache TTLs, `thinking`, `output_config`, the beta header — all
accepted. One whole turn ran through `loop.run` on it: 34 reads, 4 composes,
9 blocks, every one of them placed on the page.
"""
from __future__ import annotations

import importlib

import pytest

from agent import provider

SWITCHES = ("BOB_API_BASE_URL", "BOB_MODEL", "BOB_API_KEY_VAR", "BOB_MAX_TOKENS")


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for name in SWITCHES:
        monkeypatch.delenv(name, raising=False)


def test_unset_is_anthropic_and_the_defaults_this_repo_measured():
    assert provider.is_anthropic()
    assert provider.base_url() is None
    assert provider.model() == provider.DEFAULT_MODEL == "claude-opus-5"
    assert provider.max_tokens() == provider.DEFAULT_MAX_TOKENS


def test_unset_hands_the_sdk_nothing_so_the_client_is_the_one_it_always_was():
    # Empty kwargs: the SDK reads ANTHROPIC_API_KEY itself, as before.
    assert provider.client_kwargs() == {}


def test_the_loop_takes_its_model_and_ceiling_from_here(monkeypatch):
    from agent import loop as bob

    assert bob.MODEL == provider.DEFAULT_MODEL
    assert bob.MAX_TOKENS == provider.DEFAULT_MAX_TOKENS
    # And it is read at import, so a swap is a restart and never a half-swapped
    # process serving one turn to one provider and the next to another.
    monkeypatch.setenv("BOB_MODEL", "deepseek-chat")
    assert bob.MODEL == provider.DEFAULT_MODEL
    assert provider.model() == "deepseek-chat"
    importlib.reload(provider)


def test_a_swap_is_a_base_url_a_model_and_the_NAME_of_a_key(monkeypatch):
    monkeypatch.setenv("BOB_API_BASE_URL", "https://api.deepseek.com/anthropic")
    monkeypatch.setenv("BOB_MODEL", "deepseek-chat")
    monkeypatch.setenv("BOB_API_KEY_VAR", "A_KEY_BY_ANOTHER_NAME")
    monkeypatch.setenv("A_KEY_BY_ANOTHER_NAME", "not-a-real-key")
    assert not provider.is_anthropic()
    assert provider.model() == "deepseek-chat"
    kwargs = provider.client_kwargs()
    assert kwargs["base_url"] == "https://api.deepseek.com/anthropic"
    assert kwargs["api_key"] == "not-a-real-key"


def test_it_says_which_key_is_missing_rather_than_failing_at_the_first_turn(monkeypatch):
    monkeypatch.setenv("BOB_API_BASE_URL", "https://api.deepseek.com/anthropic")
    monkeypatch.setenv("BOB_API_KEY_VAR", "NOT_SET_ANYWHERE")
    with pytest.raises(RuntimeError) as why:
        provider.client_kwargs()
    assert "NOT_SET_ANYWHERE" in str(why.value)


def test_the_ceiling_only_ever_comes_down(monkeypatch):
    # The only reason to set it is a provider with a smaller limit. A typo that
    # RAISED it would 400 every turn instead of shortening one answer.
    monkeypatch.setenv("BOB_MAX_TOKENS", "8000")
    assert provider.max_tokens() == 8000
    monkeypatch.setenv("BOB_MAX_TOKENS", "999999")
    assert provider.max_tokens() == provider.DEFAULT_MAX_TOKENS
    monkeypatch.setenv("BOB_MAX_TOKENS", "not a number")
    assert provider.max_tokens() == provider.DEFAULT_MAX_TOKENS


def test_what_reaches_a_log_is_a_host_and_a_model_and_never_a_key(monkeypatch):
    assert provider.describe() == "api.anthropic.com · claude-opus-5"
    # A base_url is a place a key gets pasted by accident, and a log is forever.
    monkeypatch.setenv("BOB_API_BASE_URL", "https://user:sk-secret@api.deepseek.com/anthropic")
    monkeypatch.setenv("BOB_MODEL", "deepseek-chat")
    monkeypatch.setenv("BOB_API_KEY_VAR", "K")
    monkeypatch.setenv("K", "sk-secret")
    said = provider.describe()
    assert "sk-secret" not in said and "user" not in said
    assert said == "api.deepseek.com · deepseek-chat"


def test_the_turn_records_the_model_that_answered():
    # george.conversations.model is how anyone tells later which one it was.
    loop_src = (__import__("pathlib").Path(__file__).resolve().parents[1]
                / "agent" / "loop.py").read_text(encoding="utf-8")
    assert 'kw["question"], kw.get("final_answer"), MODEL,' in loop_src
