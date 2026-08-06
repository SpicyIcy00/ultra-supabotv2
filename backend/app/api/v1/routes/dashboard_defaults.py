"""
Dashboard Defaults API Routes

Server-side storage for which stores / vending machines are pre-selected on the
dashboard, so the Settings choice applies on every device rather than only in
the browser that made it.
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.dashboard_default import DashboardDefault

router = APIRouter(tags=["dashboard-defaults"])

VALID_SCOPES = {"stores", "vending"}


class DashboardDefaultsConfig(BaseModel):
    """Pre-selected ids per scope, plus when they last changed."""
    stores: List[str] = Field(default_factory=list)
    vending: List[str] = Field(default_factory=list)
    # Clients compare this against the version they last applied, so a Settings
    # change propagates once to each device without stomping session choices.
    updated_at: Optional[datetime] = None


class DashboardDefaultsUpdate(BaseModel):
    """Replace the pre-selected ids for a single scope."""
    scope: str
    item_ids: List[str] = Field(default_factory=list)


async def _read_config(db: AsyncSession) -> DashboardDefaultsConfig:
    result = await db.execute(select(DashboardDefault))
    rows = result.scalars().all()

    config = DashboardDefaultsConfig()
    for row in rows:
        if row.scope == "stores":
            config.stores.append(row.item_id)
        elif row.scope == "vending":
            config.vending.append(row.item_id)
        if config.updated_at is None or (row.updated_at and row.updated_at > config.updated_at):
            config.updated_at = row.updated_at

    return config


@router.get("", response_model=DashboardDefaultsConfig)
async def get_dashboard_defaults(db: AsyncSession = Depends(get_db)):
    """
    Get the configured dashboard defaults.

    Empty lists mean "nothing configured" — the client then falls back to its
    own built-in defaults rather than showing an empty dashboard.
    """
    try:
        return await _read_config(db)
    except Exception:
        # Table not created yet — behave as "nothing configured"
        return DashboardDefaultsConfig()


@router.put("", response_model=DashboardDefaultsConfig)
async def update_dashboard_defaults(
    update: DashboardDefaultsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Replace the defaults for one scope. Other scopes are left untouched, so
    saving vending defaults can never wipe the store defaults.
    """
    if update.scope not in VALID_SCOPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scope '{update.scope}'. Expected one of: {', '.join(sorted(VALID_SCOPES))}"
        )

    if not update.item_ids:
        raise HTTPException(
            status_code=400,
            detail="At least one item must be selected"
        )

    try:
        await db.execute(
            delete(DashboardDefault).where(DashboardDefault.scope == update.scope)
        )

        now = datetime.now()
        for item_id in update.item_ids:
            db.add(DashboardDefault(scope=update.scope, item_id=item_id, updated_at=now))

        await db.commit()

        return await _read_config(db)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save dashboard defaults: {str(e)}"
        )
