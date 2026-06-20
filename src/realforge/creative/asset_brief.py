from __future__ import annotations

from realforge.creative.models import (
    AssetBrief,
    new_artifact_id,
    parse_provider_object,
    require_string_tuple,
    require_text,
    utc_now_iso,
)
from realforge.providers.base import CreativeRequest, ModelProvider


def build_asset_brief(task: str, provider: ModelProvider) -> AssetBrief:
    normalized = task.strip()
    if not normalized:
        raise ValueError("creative asset task must not be empty")
    raw = provider.generate_asset_brief(CreativeRequest(task=normalized))
    data = parse_provider_object(raw, provider=provider.name)
    return AssetBrief(
        id=new_artifact_id(),
        created_at=utc_now_iso(),
        name=require_text(data, "name", provider=provider.name),
        category=require_text(data, "category", provider=provider.name),
        purpose=require_text(data, "purpose", provider=provider.name),
        silhouette=require_text(data, "silhouette", provider=provider.name),
        materials=require_string_tuple(data, "materials", provider=provider.name),
        scale_reference=require_text(data, "scale_reference", provider=provider.name),
        style_notes=require_string_tuple(data, "style_notes", provider=provider.name),
        gameplay_constraints=require_string_tuple(
            data,
            "gameplay_constraints",
            provider=provider.name,
        ),
        engine_constraints=require_string_tuple(
            data,
            "engine_constraints",
            provider=provider.name,
        ),
        texture_requirements=require_string_tuple(
            data,
            "texture_requirements",
            provider=provider.name,
        ),
        lod_notes=require_string_tuple(data, "lod_notes", provider=provider.name),
        collision_notes=require_string_tuple(data, "collision_notes", provider=provider.name),
        animation_notes=require_string_tuple(data, "animation_notes", provider=provider.name),
        validation_checklist=require_string_tuple(
            data,
            "validation_checklist",
            provider=provider.name,
        ),
        untrusted_provider_output=True,
    )
