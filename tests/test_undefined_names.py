"""
No module may reference a name it never bound.

WHY THIS EXISTS. routes/george_pins.py imported `datetime` but called
`datetime.now(timezone.utc)`, so POST /george/pins/{id}/run raised NameError on
every request — the pin runner was unreachable through its own route, and
nothing caught it. Import-time checks could not: the name is resolved when the
line RUNS, and that line only runs when someone loads a tile.

The whole class is cheap to close. pyflakes resolves names against each
module's own bindings without importing anything, so this covers every branch
of every function, including the ones no test exercises and the ones only a
failing pin reaches.

DELIBERATELY NARROW. Only undefined names — not unused imports, not shadowing,
not line length. This suite is about numbers being right, not about style, and
a test that also reported tidiness would be turned off the first time it
disagreed with someone.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pyflakes_checker = pytest.importorskip(
    "pyflakes.checker", reason="pyflakes is a test-only dependency"
)
from pyflakes.messages import (  # noqa: E402
    UndefinedExport,
    UndefinedLocal,
    UndefinedName,
)

ROOT = Path(__file__).resolve().parent.parent

# Everything George's answers pass through: the tools that produce the numbers,
# the loop and its write surface, and the backend that serves and schedules
# them.
SCANNED = ("agent", "tools", "backend/app")

UNDEFINED = (UndefinedName, UndefinedLocal, UndefinedExport)

# backend/app/models is excluded, and only for a specific reason: SQLAlchemy
# relationship targets are written as STRING forward references
# (Mapped["Product"]) which the ORM resolves through its own registry at mapper
# configuration time. Python never evaluates them, so pyflakes reports 18 of
# them as undefined and every one is correct code. Excluding the package is
# honest; teaching this test to guess which strings are class names would not
# be.
EXCLUDED_PARTS = {"__pycache__", "models"}


def _python_files() -> list[Path]:
    files = []
    for rel in SCANNED:
        for path in sorted((ROOT / rel).rglob("*.py")):
            if EXCLUDED_PARTS & set(path.parts):
                continue
            files.append(path)
    return files


def _undefined_in(path: Path) -> list[str]:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    checker = pyflakes_checker.Checker(tree, filename=str(path))
    return [
        f"{path.relative_to(ROOT).as_posix()}:{m.lineno}:{m.col}: {m.message % m.message_args}"
        for m in checker.messages
        if isinstance(m, UNDEFINED)
    ]


def test_the_files_being_scanned_actually_exist():
    """A typo in SCANNED would make this suite pass by checking nothing."""
    files = _python_files()
    assert len(files) > 30, f"only found {len(files)} files to scan — check SCANNED"


def test_no_module_uses_a_name_it_never_bound():
    findings = [msg for path in _python_files() for msg in _undefined_in(path)]
    assert not findings, (
        "These names are used but never bound in their module. Each one is a "
        "NameError waiting for the branch that reaches it:\n  "
        + "\n  ".join(findings)
    )


def test_the_check_would_have_caught_the_pins_bug():
    """
    The exact shape of the bug this test was written for, so a future change to
    the filtering above cannot quietly stop detecting it.
    """
    source = (
        "from datetime import datetime\n"
        "def run():\n"
        "    return datetime.now(timezone.utc)\n"
    )
    checker = pyflakes_checker.Checker(ast.parse(source), filename="sample.py")
    found = [m for m in checker.messages if isinstance(m, UNDEFINED)]
    assert len(found) == 1
    assert "timezone" in (found[0].message % found[0].message_args)
