"""
WHICH MODEL ANSWERS, AND WHERE (agent/provider.py, 2026-09-21).

The owner ran out of Anthropic credit mid-session: *"try this deepseek api for
abit ... but make it easy to swap."* It was swapped, measured against Opus on
his own turns, and then made the default by his decision: *"go with the flash as
default."* So this holds the three things that must stay true of that:

  THE DEFAULT IS THE DECISION. With nothing set, Bob answers on DeepSeek's
  cheap tier. Not because it is cheaper — because the work measured at least as
  well: same wall-clock, a twenty-third of the cost, and it won a blind
  eight-judge comparison against Opus 5-3.

  THE WAY BACK IS ONE VARIABLE. BOB_PROVIDER=anthropic restores EXACTLY the
  request this loop made before any of this existed: claude-opus-5, and empty
  client kwargs so the SDK reads ANTHROPIC_API_KEY itself. Every number in this
  repo from before 2026-09-21 was measured there, so that path has to stay
  byte-identical or none of them mean anything.

  NOTHING HERE HOLDS A KEY. A provider names the VARIABLE that holds its key.
  What reaches a log is a hostname and a model (CLAUDE.md, "Never print a
  secret's value").
"""
from __future__ import annotations

import importlib

import pytest

from agent import provider

SWITCHES = ("BOB_PROVIDER", "BOB_API_BASE_URL", "BOB_MODEL", "BOB_API_KEY_VAR",
            "BOB_MAX_TOKENS")


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for name in SWITCHES:
        monkeypatch.delenv(name, raising=False)


# ------------------------------------------------------------ the default

def test_unset_is_deepseeks_cheap_tier_because_that_is_what_measured_best():
    assert provider.provider_name() == provider.DEFAULT_PROVIDER == "deepseek"
    assert provider.base_url() == "https://api.deepseek.com/anthropic"
    # `deepseek-chat` is an alias for deepseek-v4-flash. NOT deepseek-v4-pro,
    # which was 647 s against flash's 229 s on the same question, cost six times
    # as much and tripped more of this loop's gates.
    assert provider.model() == "deepseek-chat"
    assert not provider.is_anthropic()


def test_the_default_needs_its_key_and_says_which_one(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    with pytest.raises(RuntimeError) as why:
        provider.client_kwargs()
    said = str(why.value)
    assert "DEEPSEEK_API_KEY" in said
    # And it names the way out, because this is now the path a fresh deploy
    # takes: a missing key must not read as "Bob is broken".
    assert "BOB_PROVIDER=anthropic" in said


def test_the_key_is_read_by_name_never_written_here(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "not-a-real-key")
    kwargs = provider.client_kwargs()
    assert kwargs["base_url"] == "https://api.deepseek.com/anthropic"
    assert kwargs["api_key"] == "not-a-real-key"
    src = (__import__("pathlib").Path(provider.__file__)).read_text(encoding="utf-8")
    assert "sk-" not in src, "a key, or something shaped like one, is in the source"


# ------------------------------------------------------------- the way back

def test_one_variable_restores_the_request_every_old_number_was_measured_on(monkeypatch):
    monkeypatch.setenv("BOB_PROVIDER", "anthropic")
    assert provider.is_anthropic()
    assert provider.base_url() is None
    assert provider.model() == "claude-opus-5"
    # Empty kwargs: the SDK reads ANTHROPIC_API_KEY itself, as it always did.
    assert provider.client_kwargs() == {}


def test_an_unknown_provider_raises_rather_than_quietly_serving_another(monkeypatch):
    # A typo that silently served a different model would make every row
    # recorded under it a lie about which model produced it.
    monkeypatch.setenv("BOB_PROVIDER", "deepsek")
    with pytest.raises(RuntimeError) as why:
        provider.provider_name()
    assert "deepsek" in str(why.value) and "anthropic" in str(why.value)


# ------------------------------------------------------- the finer overrides

def test_each_piece_can_be_overridden_on_its_own(monkeypatch):
    monkeypatch.setenv("BOB_MODEL", "deepseek-v4-pro")
    assert provider.model() == "deepseek-v4-pro"
    assert provider.base_url() == "https://api.deepseek.com/anthropic"
    monkeypatch.setenv("BOB_API_BASE_URL", "https://example.test/anthropic")
    monkeypatch.setenv("BOB_API_KEY_VAR", "A_KEY_BY_ANOTHER_NAME")
    monkeypatch.setenv("A_KEY_BY_ANOTHER_NAME", "not-a-real-key")
    assert provider.client_kwargs() == {"base_url": "https://example.test/anthropic",
                                        "api_key": "not-a-real-key"}


def test_the_ceiling_only_ever_comes_down(monkeypatch):
    full = provider.max_tokens()
    monkeypatch.setenv("BOB_MAX_TOKENS", "8000")
    assert provider.max_tokens() == 8000
    monkeypatch.setenv("BOB_MAX_TOKENS", "999999")
    assert provider.max_tokens() == full
    monkeypatch.setenv("BOB_MAX_TOKENS", "not a number")
    assert provider.max_tokens() == full


# ------------------------------------------------------------- and the loop

def test_the_loop_takes_its_model_and_ceiling_from_here(monkeypatch):
    from agent import loop as bob

    assert bob.MODEL == provider.model()
    assert bob.MAX_TOKENS == provider.max_tokens()
    # Read at import, so a swap is a restart and never a half-swapped process
    # serving one turn to one provider and the next to another.
    monkeypatch.setenv("BOB_MODEL", "something-else")
    assert bob.MODEL != "something-else"
    importlib.reload(provider)


def test_what_reaches_a_log_is_a_host_and_a_model_and_never_a_key(monkeypatch):
    assert provider.describe() == "api.deepseek.com · deepseek-chat"
    # A base_url is a place a key gets pasted by accident, and a log is forever.
    monkeypatch.setenv("BOB_API_BASE_URL", "https://user:sk-secret@api.deepseek.com/anthropic")
    said = provider.describe()
    assert "sk-secret" not in said and "user" not in said
    assert said == "api.deepseek.com · deepseek-chat"


def test_the_turn_records_the_model_that_answered():
    # george.conversations.model is how anyone tells later which one it was --
    # and with two providers in play it is the only way.
    loop_src = (__import__("pathlib").Path(__file__).resolve().parents[1]
                / "agent" / "loop.py").read_text(encoding="utf-8")
    assert 'kw["question"], kw.get("final_answer"), MODEL,' in loop_src
