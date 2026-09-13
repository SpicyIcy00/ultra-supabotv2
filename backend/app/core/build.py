"""
Which build is actually running.

WHY THIS EXISTS. `/health` could say which migration the database was on and
which one the code expected, and could not say **which code**. On 2026-09-12 a
deploy booted four migrations behind and the only way to tell what was live
was to reason backwards from behaviour; on 09-13 two pushes went out and
"is the fix live yet" had no answer but "try it and see". A schema revision
identifies the database. Nothing identified the build.

NOTHING HERE IS INVENTED. The commit is read from what the platform put in
the environment, or from a stamp written at build time, or from git — in that
order — and when none of them is there the answer is `null` with the source
named as `unknown`. A plausible-looking wrong commit is worse than no commit:
it is the readout you would trust while chasing a bug that is not in the code
you are reading. This is UI rule 8 applied to an operator's screen — a claim
about state renders from a loaded result, never a literal.

The three sources, in order:

  environment   Railway injects RAILWAY_GIT_COMMIT_SHA (and the branch, and a
                deployment id) for a deploy it built from GitHub. This is the
                authority when it is present, because it describes the deploy
                rather than the filesystem.
  stamp         backend/BUILD_REVISION, one line, written by a build step for
                a platform that injects nothing. Absent here by default.
  git           `git rev-parse HEAD`, which is the local development answer
                and almost never present in a container.
"""

from __future__ import annotations

import os
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Optional

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent
STAMP = BACKEND_DIR / "BUILD_REVISION"

# What a platform calls the commit it built. Railway's first, then the two
# generic names other builders use, so this does not have to be rewritten the
# day the backend moves.
COMMIT_VARS = ("RAILWAY_GIT_COMMIT_SHA", "GIT_COMMIT", "SOURCE_COMMIT")


def _clean(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    return value or None


def _from_environment() -> Optional[tuple[str, str]]:
    for name in COMMIT_VARS:
        commit = _clean(os.environ.get(name))
        if commit:
            return commit, f"environment ({name})"
    return None


def _from_stamp() -> Optional[tuple[str, str]]:
    try:
        commit = _clean(STAMP.read_text(encoding="utf-8").splitlines()[0])
    except (OSError, IndexError):
        return None
    return (commit, "build stamp") if commit else None


def _from_git() -> Optional[tuple[str, str]]:
    # Never on the request path — see the cache on revision(). A container
    # usually has no .git and no git binary, and both of those are a `None`
    # here rather than an error.
    if not (REPO_DIR / ".git").exists():
        return None
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO_DIR, capture_output=True,
            text=True, timeout=5, check=True,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    commit = _clean(out.stdout)
    return (commit, "git") if commit else None


@lru_cache(maxsize=1)
def revision() -> dict:
    """
    The running build, as a dict `/health` can return.

    Cached for the life of the process, which is exactly right: the build a
    process is running cannot change while it runs. A new build is a new
    process.

    `commit` is None and `source` is "unknown" when nothing knows — said
    plainly rather than filled in with a guess.
    """
    found = _from_environment() or _from_stamp() or _from_git()
    commit, source = found if found else (None, "unknown")
    return {
        "commit": commit,
        # Enough to recognise in a log line without reading a full sha.
        "short": commit[:8] if commit else None,
        "source": source,
        # Everything else the platform will tell us about this deploy. Absent
        # keys are absent rather than empty strings: "not reported" and
        # "reported as nothing" are different facts.
        **{
            key: value
            for key, value in (
                ("branch", _clean(os.environ.get("RAILWAY_GIT_BRANCH"))),
                ("deployment", _clean(os.environ.get("RAILWAY_DEPLOYMENT_ID"))),
                ("service", _clean(os.environ.get("RAILWAY_SERVICE_NAME"))),
                ("environment", _clean(os.environ.get("RAILWAY_ENVIRONMENT_NAME"))),
            )
            if value
        },
    }
