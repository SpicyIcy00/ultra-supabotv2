"""
Report Preset API Routes

Endpoints for managing report presets (saved configurations).
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_db
from fastapi import Depends

from app.models.report_preset import ReportPreset
from app.schemas.report_preset import (
    PresetCreate,
    PresetUpdate,
    PresetResponse,
    PresetListResponse
)

router = APIRouter(tags=["Report Presets"])



@router.get("", response_model=PresetListResponse)
async def list_presets(
    report_type: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Get list of all presets, optionally filtered by report type.

    Args:
        report_type: Optional filter by report type (e.g., 'product-sales')
        db: Database session

    Returns:
        PresetListResponse with list of presets and default preset ID
    """
    query = select(ReportPreset)

    if report_type:
        query = query.where(ReportPreset.report_type == report_type)

    query = query.order_by(ReportPreset.is_default.desc(), ReportPreset.name)

    result = await db.execute(query)
    presets_raw = result.scalars().all()

    # Clean up config data before validation
    presets_cleaned = []
    for preset in presets_raw:
        # Make a copy of the config
        config_data = preset.config.copy() if isinstance(preset.config, dict) else {}

        # Clean compare_store_ids - filter out None values
        if "compare_store_ids" in config_data and isinstance(config_data["compare_store_ids"], list):
            filtered = [sid for sid in config_data["compare_store_ids"] if sid is not None]
            config_data["compare_store_ids"] = filtered if len(filtered) > 0 else None

        # Migrate inventory_store_a to inventory_sales_store in filters.sort_by
        if "filters" in config_data and isinstance(config_data["filters"], dict):
            if config_data["filters"].get("sort_by") == "inventory_store_a":
                config_data["filters"]["sort_by"] = "inventory_sales_store"

        preset_dict = {
            "id": preset.id,
            "name": preset.name,
            "report_type": preset.report_type,
            "config": config_data,
            "is_default": preset.is_default,
            "created_at": preset.created_at,
            "updated_at": preset.updated_at
        }

        presets_cleaned.append(preset_dict)

    # Find default preset
    default_preset_id = None
    for preset_dict in presets_cleaned:
        if preset_dict["is_default"]:
            default_preset_id = preset_dict["id"]
            break

    return PresetListResponse(
        presets=presets_cleaned,
        total=len(presets_cleaned),
        default_preset_id=default_preset_id
    )


@router.get("/{preset_id}", response_model=PresetResponse)
async def get_preset(
    preset_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a specific preset by ID.

    Args:
        preset_id: Preset ID
        db: Database session

    Returns:
        PresetResponse

    Raises:
        HTTPException: 404 if preset not found
    """
    result = await db.execute(
        select(ReportPreset).where(ReportPreset.id == preset_id)
    )
    preset = result.scalar_one_or_none()

    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset with id {preset_id} not found"
        )

    return preset


@router.post("", response_model=PresetResponse, status_code=status.HTTP_201_CREATED)
async def create_preset(
    preset_data: PresetCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new preset.

    If is_default is True, this will unset any existing default preset
    for the same report type.

    Args:
        preset_data: Preset creation data
        db: Database session

    Returns:
        Created preset

    Raises:
        HTTPException: 400 if preset name already exists
    """
    # Check if name already exists for this report type
    result = await db.execute(
        select(ReportPreset).where(
            ReportPreset.name == preset_data.name,
            ReportPreset.report_type == preset_data.report_type
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Preset with name '{preset_data.name}' already exists for report type '{preset_data.report_type}'"
        )

    # If setting as default, unset existing default
    if preset_data.is_default:
        await db.execute(
            update(ReportPreset)
            .where(
                ReportPreset.report_type == preset_data.report_type,
                ReportPreset.is_default == True
            )
            .values(is_default=False)
        )

    # Create new preset
    new_preset = ReportPreset(
        name=preset_data.name,
        report_type=preset_data.report_type,
        config=preset_data.config.model_dump(),
        is_default=preset_data.is_default
    )

    db.add(new_preset)
    await db.commit()
    await db.refresh(new_preset)

    return new_preset


@router.put("/{preset_id}", response_model=PresetResponse)
async def update_preset(
    preset_id: int,
    preset_data: PresetUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update an existing preset.

    Args:
        preset_id: Preset ID to update
        preset_data: Update data (all fields optional)
        db: Database session

    Returns:
        Updated preset

    Raises:
        HTTPException: 404 if preset not found
    """
    # Get existing preset
    result = await db.execute(
        select(ReportPreset).where(ReportPreset.id == preset_id)
    )
    preset = result.scalar_one_or_none()

    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset with id {preset_id} not found"
        )

    # Check if name conflict (if name is being changed)
    if preset_data.name and preset_data.name != preset.name:
        result = await db.execute(
            select(ReportPreset).where(
                ReportPreset.name == preset_data.name,
                ReportPreset.report_type == preset.report_type,
                ReportPreset.id != preset_id
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Preset with name '{preset_data.name}' already exists"
            )

    # If setting as default, unset existing default
    if preset_data.is_default is not None and preset_data.is_default:
        await db.execute(
            update(ReportPreset)
            .where(
                ReportPreset.report_type == preset.report_type,
                ReportPreset.is_default == True,
                ReportPreset.id != preset_id
            )
            .values(is_default=False)
        )

    # Update fields
    if preset_data.name:
        preset.name = preset_data.name

    if preset_data.config:
        preset.config = preset_data.config.model_dump()

    if preset_data.is_default is not None:
        preset.is_default = preset_data.is_default

    await db.commit()
    await db.refresh(preset)

    return preset


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preset(
    preset_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a preset.

    Args:
        preset_id: Preset ID to delete
        db: Database session

    Raises:
        HTTPException: 404 if preset not found
    """
    result = await db.execute(
        select(ReportPreset).where(ReportPreset.id == preset_id)
    )
    preset = result.scalar_one_or_none()

    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset with id {preset_id} not found"
        )

    await db.execute(
        delete(ReportPreset).where(ReportPreset.id == preset_id)
    )
    await db.commit()


@router.post("/{preset_id}/set-default", response_model=PresetResponse)
async def set_default_preset(
    preset_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Set a preset as the default for its report type.

    This will unset any existing default preset for the same report type.

    Args:
        preset_id: Preset ID to set as default
        db: Database session

    Returns:
        Updated preset

    Raises:
        HTTPException: 404 if preset not found
    """
    result = await db.execute(
        select(ReportPreset).where(ReportPreset.id == preset_id)
    )
    preset = result.scalar_one_or_none()

    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset with id {preset_id} not found"
        )

    # Unset existing default for this report type
    await db.execute(
        update(ReportPreset)
        .where(
            ReportPreset.report_type == preset.report_type,
            ReportPreset.is_default == True
        )
        .values(is_default=False)
    )

    # Set this preset as default
    preset.is_default = True
    await db.commit()
    await db.refresh(preset)

    return preset
