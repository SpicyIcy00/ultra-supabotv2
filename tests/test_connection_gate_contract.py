"""
At most N george_ro connections per process, shared by every caller.

NO DATABASE. The connection is faked; what is under test is the gate around
it: that concurrency never exceeds the cap, that the cap is one per process
(two "runs" fanning out together share it), that a failed open gives its slot
back, that closing twice releases once, and that a caller past the cap waits
and then fails with the numbers rather than hanging.

Background: on 2026-09-04 a 19-step workflow opened 19 connections against a
session-mode pool capped at 15 and the pooler refused with EMAXCONNSESSION.
"""

from __future__ import annotations

import threading
import time

import pytest

pytest.importorskip("psycopg")

from tools import _common  # noqa: E402


class _FakeConn:
    """Stands in for GatedConnection: closable, releases through the same helper."""

    _slot_held = False

    def __init__(self, tracker):
        self._tracker = tracker
        self.closed = False

    def close(self):
        if not self.closed:
            self.closed = True
            self._tracker.leave()
        _common._release_if_held(self)


class _Tracker:
    """Counts fake connections open at once."""

    def __init__(self):
        self.lock = threading.Lock()
        self.open = 0
        self.peak = 0
        self.total = 0

    def enter(self):
        with self.lock:
            self.open += 1
            self.total += 1
            self.peak = max(self.peak, self.open)

    def leave(self):
        with self.lock:
            self.open -= 1


@pytest.fixture
def gate(monkeypatch):
    """A fresh gate with a small cap, and a fake open that holds for a moment."""
    monkeypatch.setenv("GEORGE_DATABASE_URL", "postgresql://george_ro:x@fake/db")
    tracker = _Tracker()

    def fake_open(url):
        tracker.enter()
        time.sleep(0.12)
        return _FakeConn(tracker)

    def install(cap: int, wait_s: float = 5.0):
        monkeypatch.setattr(_common, "_CAP", cap)
        monkeypatch.setattr(_common, "_GATE", threading.BoundedSemaphore(cap))
        monkeypatch.setattr(_common, "_GATE_STATS",
                            {"in_use": 0, "peak": 0, "waited": 0, "timed_out": 0})
        monkeypatch.setattr(_common, "GEORGE_CONNECTION_WAIT_S", wait_s)
        monkeypatch.setattr(_common, "_open_checked", fake_open)
        return tracker

    return install


def _fan_out(n: int, hold_s: float = 0.0) -> list:
    """n threads each open, hold, close — the shape of asyncio.gather over to_thread."""
    errors: list = []

    def one():
        try:
            conn = _common.connect()
            time.sleep(hold_s)
            conn.close()
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=one) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return errors


def test_concurrency_never_exceeds_the_cap(gate):
    tracker = gate(cap=3)
    errors = _fan_out(10)
    assert errors == []
    assert tracker.total == 10          # everyone got through — queued, not refused
    assert tracker.peak == 3            # never more than the cap at once
    assert _common.connection_gate_status()["in_use"] == 0


def test_two_overlapping_runs_share_one_gate(gate):
    """A per-run cap of 8 would let two runs open 16. One gate per process."""
    tracker = gate(cap=4)
    errors: list = []

    def run(width: int):
        errors.extend(_fan_out(width))

    a = threading.Thread(target=run, args=(6,))
    b = threading.Thread(target=run, args=(6,))
    a.start(); b.start(); a.join(); b.join()

    assert errors == []
    assert tracker.total == 12
    assert tracker.peak == 4
    assert _common.connection_gate_status()["peak"] == 4


def test_a_failed_open_gives_its_slot_back(gate, monkeypatch):
    gate(cap=1)

    def broken(url):
        raise RuntimeError("Refusing to run: the session is not read-only.")

    monkeypatch.setattr(_common, "_open_checked", broken)
    with pytest.raises(RuntimeError, match="not read-only"):
        _common.connect()
    assert _common.connection_gate_status()["in_use"] == 0
    # The slot is free: a second attempt does not wait behind the failed one.
    with pytest.raises(RuntimeError, match="not read-only"):
        _common.connect()


def test_closing_twice_releases_once(gate):
    tracker = gate(cap=1)
    conn = _common.connect()
    assert _common.connection_gate_status()["in_use"] == 1
    conn.close()
    conn.close()
    assert _common.connection_gate_status()["in_use"] == 0
    assert tracker.open == 0


def test_a_caller_past_the_cap_waits_then_fails_with_the_numbers(gate):
    gate(cap=1, wait_s=0.2)
    held = _common.connect()
    try:
        with pytest.raises(RuntimeError) as exc:
            _common.connect()
        msg = str(exc.value)
        assert "1 george_ro connection slots" in msg and "1 in use" in msg
        assert "was not run" in msg
        assert _common.connection_gate_status()["timed_out"] == 1
    finally:
        held.close()


def test_the_default_cap_leaves_headroom_under_the_pooler_limit(monkeypatch):
    monkeypatch.delenv("GEORGE_MAX_CONNECTIONS", raising=False)
    assert _common._cap() == 8
    assert _common._cap() < 15, "the session-mode pool for george_ro holds 15"
    monkeypatch.setenv("GEORGE_MAX_CONNECTIONS", "3")
    assert _common._cap() == 3
    monkeypatch.setenv("GEORGE_MAX_CONNECTIONS", "zero")
    assert _common._cap() == 8
    monkeypatch.setenv("GEORGE_MAX_CONNECTIONS", "0")
    assert _common._cap() == 1
