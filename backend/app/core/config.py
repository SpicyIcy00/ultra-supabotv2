from typing import Any, List
import os
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow"
    )

    # API Settings
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "BI Dashboard API"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/bidashboard")

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: str | None) -> str:
        if not v:
            return "postgresql+asyncpg://postgres:postgres@localhost:5432/bidashboard"
        
        # Handle cases where the URL is provided without the driver
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql://", 1)
            
        if v.startswith("postgresql://") and "+asyncpg" not in v:
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
            
        return v
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = False  # Set to True to enable Redis caching

    # Security
    #
    # The default below is a PLACEHOLDER and is rejected at boot — see
    # assert_secret_key_usable at the bottom of this file. It stays as the
    # default (rather than being made required) so that importing settings
    # still works for tests, scripts and migrations, none of which sign a
    # token; only the running server refuses it.
    SECRET_KEY: str = "your-secret-key-here-change-in-production"
    ALGORITHM: str = "HS256"
    # 12 hours — a warehouse shift. Staff should not be re-typing a password
    # onto a shop-floor tablet halfway through packing.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    # CORS
    #
    # WHAT THIS LIST IS AND IS NOT FOR. In normal operation it is not
    # exercised at all: the frontend calls "/api/v1" SAME-ORIGIN and Vercel
    # rewrites that to Railway server-side (frontend/vercel.json), so the
    # browser never makes a cross-origin request and no preflight happens.
    # This list matters only when something calls Railway directly — a local
    # frontend against production, a script, a probe.
    #
    # Corrected 2026-09-05. Both production entries were dead: the app is
    # served from thesupabot.vercel.app, while these named
    # ultra-supabotv2.vercel.app (DEPLOYMENT_NOT_FOUND) and a
    # ultra-supabotv2-8iqmvzzur-… preview URL (404). Nothing failed because of
    # it, which is exactly why it went unnoticed for as long as it did — a
    # same-origin proxy means a wrong CORS list is silent until the first time
    # somebody needs it.
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "https://thesupabot.vercel.app",
    ]

    # Vercel preview deployments of the same project. The project is named
    # thesupabot, so previews are thesupabot-<hash>-<scope>.vercel.app — the
    # old pattern matched ultra-supabotv2-*, which no deployment has ever
    # used since the project was renamed.
    CORS_ORIGIN_REGEX: str = r"https://thesupabot[a-z0-9-]*\.vercel\.app"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        return []

    # API Keys
    ANTHROPIC_API_KEY: str = ""

    # Telegram (for scheduled AI-chat report delivery)
    # Create a bot via @BotFather and set the token here / in the environment.
    TELEGRAM_BOT_TOKEN: str = ""

    # Shared secret for the morning-brief endpoint only, so a scheduler never
    # has to hold a human passcode. Empty means the endpoint is CLOSED, not
    # open — see routes/brief.py require_brief_token.
    BRIEF_TOKEN: str = ""

    # Logging
    LOG_LEVEL: str = "INFO"


settings = Settings()


# ---------------------------------------------------------------------------
# The signing key must never be the placeholder
#
# SECRET_KEY signs every access token. With the committed default, anyone who
# can read this repository can mint a token for any user id — including an
# admin — against any deployment that has not overridden it. That is not a
# configuration preference; it is the whole of the authentication system.
#
# This is a FUNCTION called at boot (app/main.py, before the app object is
# built) rather than a pydantic validator, deliberately. A validator would run
# on every `import settings`, so the golden suite, alembic and every one-off
# script would refuse to start over a key none of them signs anything with —
# and the resulting failure would look like a broken test rather than a missing
# secret. The server is the only process that needs to care, so the server is
# the only one that checks.
# ---------------------------------------------------------------------------

PLACEHOLDER_SECRET_KEY = "your-secret-key-here-change-in-production"

# HS256 keys shorter than the 256-bit hash they feed add nothing. 32 characters
# is the floor, not a target; generate 64.
MIN_SECRET_KEY_LENGTH = 32


class InsecureSecretKeyError(RuntimeError):
    """The app is configured with a signing key that cannot be trusted."""


# Distinguishes "no argument, read the settings" from "I am handing you None".
# Using None for both would mean assert_secret_key_usable(os.getenv("SECRET_KEY"))
# quietly checked the settings when the variable was missing — passing on
# exactly the case it exists to catch.
_FROM_SETTINGS = object()


def assert_secret_key_usable(secret_key: str | None = _FROM_SETTINGS) -> None:  # type: ignore[assignment]
    """
    Refuse to boot on a placeholder, empty or too-short SECRET_KEY.

    Checks the configured key when called with no argument, and the given one
    otherwise — including None, which is a failure, not a request for the
    default. Raises InsecureSecretKeyError with instructions; called for its
    exception, never for a return value.
    """
    key = settings.SECRET_KEY if secret_key is _FROM_SETTINGS else secret_key
    how = (
        "Generate one with:\n"
        "    python -c \"import secrets; print(secrets.token_urlsafe(64))\"\n"
        "and set SECRET_KEY in the environment (Railway variables, or "
        "backend/.env locally). Rotating it signs out every existing session, "
        "which is the intended effect if the old value ever leaked."
    )

    if key is None or not key.strip():
        raise InsecureSecretKeyError(f"SECRET_KEY is empty. {how}")

    if key == PLACEHOLDER_SECRET_KEY:
        raise InsecureSecretKeyError(
            "SECRET_KEY is still the placeholder committed in this repository, "
            "so anyone who can read the source can mint an admin token for this "
            f"deployment. Refusing to start. {how}"
        )

    if len(key) < MIN_SECRET_KEY_LENGTH:
        raise InsecureSecretKeyError(
            f"SECRET_KEY is {len(key)} characters; at least "
            f"{MIN_SECRET_KEY_LENGTH} are required. {how}"
        )
