# `alembic upgrade head` FIRST, and this is the whole reason the file was
# changed on 2026-09-05: it was missing here while railway.json declared it,
# Railway honoured this file, and two migrations therefore never ran. The
# schema check did its job and refused to serve rather than returning 500s —
# so the deploy crash-looped until the migrations were applied by hand.
#
# Keep this identical to railway.json's startCommand. Two places declaring how
# the app starts is already one too many; two places DISAGREEING is an outage.
web: cd backend && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
