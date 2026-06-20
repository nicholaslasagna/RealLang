from __future__ import annotations

from realforge.creative.models import (
    MapDesignPlan,
    new_artifact_id,
    parse_provider_object,
    require_string_tuple,
    require_text,
    utc_now_iso,
)
from realforge.providers.base import CreativeRequest, ModelProvider


def build_map_design_plan(task: str, provider: ModelProvider) -> MapDesignPlan:
    normalized = task.strip()
    if not normalized:
        raise ValueError("creative map task must not be empty")
    raw = provider.generate_map_design(CreativeRequest(task=normalized))
    data = parse_provider_object(raw, provider=provider.name)
    return MapDesignPlan(
        id=new_artifact_id(),
        created_at=utc_now_iso(),
        title=require_text(data, "title", provider=provider.name),
        game_context=require_text(data, "game_context", provider=provider.name),
        map_type=require_text(data, "map_type", provider=provider.name),
        scale=require_text(data, "scale", provider=provider.name),
        layout_goals=require_string_tuple(data, "layout_goals", provider=provider.name),
        traversal_paths=require_string_tuple(data, "traversal_paths", provider=provider.name),
        landmarks=require_string_tuple(data, "landmarks", provider=provider.name),
        encounter_zones=require_string_tuple(data, "encounter_zones", provider=provider.name),
        sightlines=require_string_tuple(data, "sightlines", provider=provider.name),
        pacing=require_text(data, "pacing", provider=provider.name),
        environmental_storytelling=require_string_tuple(
            data,
            "environmental_storytelling",
            provider=provider.name,
        ),
        asset_list=require_string_tuple(data, "asset_list", provider=provider.name),
        lighting_mood=require_text(data, "lighting_mood", provider=provider.name),
        performance_notes=require_string_tuple(
            data,
            "performance_notes",
            provider=provider.name,
        ),
        risks=require_string_tuple(data, "risks", provider=provider.name),
        validation_checklist=require_string_tuple(
            data,
            "validation_checklist",
            provider=provider.name,
        ),
        untrusted_provider_output=True,
    )
