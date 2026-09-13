#!/bin/sh
# Railway start script — the fallback used if the platform's own
# configuration does not take.
#
# It must be the SAME launch path as railway.json, nixpacks.toml and the
# Procfile, and until 2026-09-13 it was not: it ran uvicorn directly, so a
# deploy that fell back to this file skipped the migration entirely and booted
# against whatever schema happened to be there. A fallback that behaves
# differently from the real path is a second deployment nobody tests.
set -e
cd backend
pip install -r requirements.txt
exec python -m app.start
