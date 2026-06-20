from __future__ import annotations

from realforge.pipeline.models import BlenderAssetPlan, new_pipeline_id, utc_now_iso
from realforge.pipeline.validation import parse_provider_object, require_string_tuple, require_text
from realforge.providers.base import CreativeRequest, ModelProvider


def build_blender_asset_plan(task: str, provider: ModelProvider) -> BlenderAssetPlan:
    normalized_task = task.strip()
    if not normalized_task:
        raise ValueError("blender asset-plan task must not be empty")
    raw = provider.generate_blender_asset_plan(CreativeRequest(task=normalized_task))
    data = parse_provider_object(raw, provider=provider.name)
    return BlenderAssetPlan(
        id=new_pipeline_id(),
        created_at=utc_now_iso(),
        asset_name=require_text(data, "asset_name", provider=provider.name),
        asset_type=require_text(data, "asset_type", provider=provider.name),
        modeling_steps=require_string_tuple(data, "modeling_steps", provider=provider.name),
        sculpting_notes=require_string_tuple(data, "sculpting_notes", provider=provider.name),
        retopology_notes=require_string_tuple(data, "retopology_notes", provider=provider.name),
        uv_unwrap_plan=require_string_tuple(data, "uv_unwrap_plan", provider=provider.name),
        texture_bake_plan=require_string_tuple(
            data,
            "texture_bake_plan",
            provider=provider.name,
        ),
        export_format=require_text(data, "export_format", provider=provider.name),
        scale_units=require_text(data, "scale_units", provider=provider.name),
        origin_pivot_notes=require_string_tuple(
            data,
            "origin_pivot_notes",
            provider=provider.name,
        ),
        collision_proxy_notes=require_string_tuple(
            data,
            "collision_proxy_notes",
            provider=provider.name,
        ),
        lod_export_notes=require_string_tuple(
            data,
            "lod_export_notes",
            provider=provider.name,
        ),
        validation_checklist=require_string_tuple(
            data,
            "validation_checklist",
            provider=provider.name,
        ),
        risks=require_string_tuple(data, "risks", provider=provider.name),
        dry_run_only=True,
        requires_human_approval=True,
        untrusted=True,
    )


def format_blender_asset_plan(plan: BlenderAssetPlan) -> str:
    return "\n".join(
        (
            "REALFORGE BLENDER ASSET PLAN",
            "Status: UNTRUSTED / DRY RUN ONLY",
            f"ID: {plan.id}",
            f"Asset: {plan.asset_name}",
            f"Type: {plan.asset_type}",
            f"Export format: {plan.export_format}",
            "Blender required or executed: no",
            "Binary assets generated: no",
            "Human review required: yes",
        )
    )
