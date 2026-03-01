"""
Seed script for replenishment module initial data.
Seeds store_tiers and seasonality_calendar tables.

Usage:
    cd backend
    python -m scripts.seed_replenishment_data
"""
import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import date
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.replenishment import StoreTier, SeasonalityCalendar


STORE_TIERS = [
    # Tier A - Flagship Stores
    {
        "store_id": "6639efd54694700008d7ccc6",
        "tier": "A",
        "safety_days": 4,
        "target_cover_days": 10,
        "expiry_window_days": 90,
    },
    {
        "store_id": "68c5bb269da1d500073690c2",
        "tier": "A",
        "safety_days": 4,
        "target_cover_days": 10,
        "expiry_window_days": 90,
    },
    # Tier B - Smaller Stores
    {
        "store_id": "668a43f60fa9990007cfa158",
        "tier": "B",
        "safety_days": 3,
        "target_cover_days": 7,
        "expiry_window_days": 60,
    },
    {
        "store_id": "67612230a740d90007464e26",
        "tier": "B",
        "safety_days": 3,
        "target_cover_days": 7,
        "expiry_window_days": 60,
    },
    {
        "store_id": "66cfff31aa7adf0007c9de41",
        "tier": "B",
        "safety_days": 3,
        "target_cover_days": 7,
        "expiry_window_days": 60,
    },
    {
        "store_id": "668023c94721460006092609",
        "tier": "B",
        "safety_days": 3,
        "target_cover_days": 7,
        "expiry_window_days": 60,
    },
]

DEFAULT_SEASONALITY = {
    "start_date": date(2024, 1, 1),
    "end_date": date(2099, 12, 31),
    "multiplier": 1.0,
    "label": "Normal (Default)",
}


async def seed_store_tiers():
    async with AsyncSessionLocal() as session:
        for tier_data in STORE_TIERS:
            # Check if already exists
            existing = await session.execute(
                select(StoreTier).where(StoreTier.store_id == tier_data["store_id"])
            )
            if existing.scalar_one_or_none() is None:
                tier = StoreTier(**tier_data)
                session.add(tier)
                print(f"  Added store tier: {tier_data['store_id']} -> Tier {tier_data['tier']}")
            else:
                print(f"  Skipped (exists): {tier_data['store_id']}")
        await session.commit()


async def seed_seasonality():
    async with AsyncSessionLocal() as session:
        existing = await session.execute(
            select(SeasonalityCalendar).where(
                SeasonalityCalendar.label == DEFAULT_SEASONALITY["label"]
            )
        )
        if existing.scalar_one_or_none() is None:
            period = SeasonalityCalendar(**DEFAULT_SEASONALITY)
            session.add(period)
            print(f"  Added seasonality: {DEFAULT_SEASONALITY['label']}")
        else:
            print(f"  Skipped (exists): {DEFAULT_SEASONALITY['label']}")
        await session.commit()


async def main():
    print("Seeding replenishment data...")
    print("\n[Store Tiers]")
    await seed_store_tiers()
    print("\n[Seasonality Calendar]")
    await seed_seasonality()
    print("\nDone.")


if __name__ == "__main__":
    import platform
    if platform.system() == "Windows":
        import selectors
        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
        asyncio.set_event_loop(loop)
        loop.run_until_complete(main())
    else:
        asyncio.run(main())
