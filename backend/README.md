# BI Dashboard Backend - Database Layer

Complete SQLAlchemy 2.0 async database layer for BI Dashboard analytics application.

## Quick Start

### Run Migrations

```bash
poetry run alembic upgrade head
```

### Run Tests

```bash
poetry run pytest
```

## Database Schema

5 main tables optimized for retail/POS analytics:

1. **products** - Product catalog
2. **stores** - Store locations
3. **transactions** - Sales transactions  
4. **transaction_items** - Line items
5. **inventory** - Stock levels by store

See full documentation in the codebase docstrings and migration files.

## Features

- SQLAlchemy 2.0 with Mapped type annotations
- Async PostgreSQL operations
- Timezone-aware timestamps (Asia/Manila)
- Optimized indexes for analytics queries
- Comprehensive Pydantic schemas
- Full test coverage

## Models Location

- Models: `app/models/`
- Schemas: `app/schemas/`
- Migrations: `alembic/versions/`
- Tests: `tests/`
