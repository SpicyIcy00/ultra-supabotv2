"""
The signing key must never be the placeholder.

NO DATABASE, no environment. SECRET_KEY signs every access token: with the
default committed in this repository, anyone who can read the source can mint a
token for any user id — including an admin — against any deployment that has not
overridden it. app/main.py refuses to boot on it, and these tests hold that
refusal in place.

Note what is NOT asserted here: that the environment has a good key. That is a
deployment fact, not a code fact, and asserting it would make this suite fail on
any machine that simply has no .env.
"""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic_settings", reason="config imports pydantic-settings")

from app.core.config import (                       # noqa: E402
    MIN_SECRET_KEY_LENGTH,
    PLACEHOLDER_SECRET_KEY,
    InsecureSecretKeyError,
    Settings,
    assert_secret_key_usable,
)

GOOD = "x" * MIN_SECRET_KEY_LENGTH


def test_the_placeholder_is_refused():
    with pytest.raises(InsecureSecretKeyError, match="placeholder"):
        assert_secret_key_usable(PLACEHOLDER_SECRET_KEY)


def test_the_refusal_says_how_to_fix_it():
    """A boot failure that does not say what to do is a boot failure twice."""
    with pytest.raises(InsecureSecretKeyError) as exc:
        assert_secret_key_usable(PLACEHOLDER_SECRET_KEY)
    message = str(exc.value)
    assert "secrets.token_urlsafe" in message
    assert "SECRET_KEY" in message


def test_an_empty_key_is_refused():
    for empty in ("", "   "):
        with pytest.raises(InsecureSecretKeyError, match="empty"):
            assert_secret_key_usable(empty)


def test_an_explicit_none_is_a_failure_not_a_request_for_the_default():
    """
    So that assert_secret_key_usable(os.getenv("SECRET_KEY")) fails when the
    variable is missing, instead of quietly checking the settings and passing.
    """
    with pytest.raises(InsecureSecretKeyError, match="empty"):
        assert_secret_key_usable(None)


def test_a_short_key_is_refused():
    with pytest.raises(InsecureSecretKeyError, match="characters"):
        assert_secret_key_usable("x" * (MIN_SECRET_KEY_LENGTH - 1))


def test_a_real_key_passes():
    assert assert_secret_key_usable(GOOD) is None


def test_the_placeholder_constant_matches_the_field_default():
    """
    Two copies of the same string, so they are pinned to each other. If someone
    edits the default in the Settings class, the guard must not go on comparing
    against a value nothing uses any more — that would silently disarm it.
    """
    assert Settings.model_fields["SECRET_KEY"].default == PLACEHOLDER_SECRET_KEY


def test_the_guard_is_not_a_validator():
    """
    Constructing Settings with the placeholder must SUCCEED. The check belongs
    to the server's boot, not to `import settings`: the golden suite, alembic
    and every one-off script import settings without signing anything, and a
    validator would take them all down over a secret they never use.
    """
    assert Settings(SECRET_KEY=PLACEHOLDER_SECRET_KEY).SECRET_KEY == PLACEHOLDER_SECRET_KEY
