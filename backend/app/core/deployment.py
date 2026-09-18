"""Small deployment gates; business definitions remain in metrics.yaml."""
from fastapi import HTTPException, Request
from app.core.config import settings


def require_workflow_writes(request: Request) -> None:
    # Manual deterministic replay remains available (including its run receipt).
    if (not settings.GEORGE_ENABLE_WORKFLOW_WRITES
            and request.method not in {"GET", "HEAD", "OPTIONS"}
            and not request.url.path.endswith("/run")):
        raise HTTPException(403, "Workflow writes are disabled in this deployment.")


def require_business_writes(request: Request) -> None:
    if settings.BUSINESS_WRITES_ENABLED or request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    prefix = settings.API_V1_PREFIX
    path = request.url.path
    # Personal Bob work is allowed. Workflow mutations have their own gate.
    if path.startswith(prefix + "/bob/") or path in {
        prefix + "/auth/login", prefix + "/auth/change-passcode",
    }:
        return
    raise HTTPException(403, "Business writes are disabled in this deployment.")
