from __future__ import annotations

from realforge.creative.models import (
    GameDesignBrief,
    new_artifact_id,
    parse_provider_object,
    require_string_tuple,
    require_text,
    utc_now_iso,
)
from realforge.providers.base import CreativeRequest, ModelProvider


def build_game_design_brief(task: str, provider: ModelProvider) -> GameDesignBrief:
    normalized = task.strip()
    if not normalized:
        raise ValueError("creative brief task must not be empty")
    raw = provider.generate_game_brief(CreativeRequest(task=normalized))
    data = parse_provider_object(raw, provider=provider.name)
    return GameDesignBrief(
        id=new_artifact_id(),
        created_at=utc_now_iso(),
        title=require_text(data, "title", provider=provider.name),
        genre=require_text(data, "genre", provider=provider.name),
        perspective=require_text(data, "perspective", provider=provider.name),
        target_platforms=require_string_tuple(data, "target_platforms", provider=provider.name),
        core_loop=require_text(data, "core_loop", provider=provider.name),
        player_roles=require_string_tuple(data, "player_roles", provider=provider.name),
        mechanics=require_string_tuple(data, "mechanics", provider=provider.name),
        tone=require_text(data, "tone", provider=provider.name),
        art_direction=require_text(data, "art_direction", provider=provider.name),
        technical_constraints=require_string_tuple(
            data,
            "technical_constraints",
            provider=provider.name,
        ),
        risks=require_string_tuple(data, "risks", provider=provider.name),
        validation_questions=require_string_tuple(
            data,
            "validation_questions",
            provider=provider.name,
        ),
        untrusted_provider_output=True,
    )
