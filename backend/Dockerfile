# Multi-stage build for production
FROM python:3.11-slim as builder

WORKDIR /app

# Install Poetry
RUN pip install poetry==1.7.1

# Copy poetry files
COPY pyproject.toml poetry.lock* ./

# Install dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --no-root --only main

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Run the application — migrations FIRST, and the app only if they succeed.
#
# This used to be a bare `uvicorn main:app` with no alembic step. railway.json
# and nixpacks.toml both say `alembic upgrade head && uvicorn ...`, but if the
# platform builds from this Dockerfile it runs THIS command, and on 2026-09-04
# production was found two migrations behind the code it was serving. All
# three start paths now say the same thing. `sh -c` so `&&` and $PORT work;
# PORT is what Railway injects, 8000 is the local default.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
