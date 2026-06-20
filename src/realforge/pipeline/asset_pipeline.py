from __future__ import annotations

import json
from pathlib import Path

from realforge.pipeline.models import AssetPipelinePlan, new_pipeline_id, utc_now_iso
from realforge.pipeline.validation import (
    LoadedArtifact,
    PipelineError,
    load_artifact_reference,
    parse_provider_object,
    require_relative_paths,
    require_string_tuple,
    require_text,
)
from realforge.providers.base import CreativeRequest, ModelProvider


TARGET_ENGINES = frozenset({"unreal", "generic"})


def _artifact_context(kind: str, artifact: LoadedArtifact | None) -> dict[str, object] | None:
    if artifact is None:
        return None
    return {"kind": kind, "id": artifact.id, "artifact": artifact.data}


def build_asset_pipeline_plan(
    task: str,
    provider: ModelProvider,
    *,
    workspace_root: Path,
    target_engine: str = "generic",
    asset_brief: str | None = None,
    image_job: str | None = None,
    reference_board: str | None = None,
    vision_report: str | None = None,
) -> AssetPipelinePlan:
    normalized_task = task.strip()
    if not normalized_task:
        raise ValueError("asset pipeline task must not be empty")
    normalized_engine = target_engine.strip().lower()
    if normalized_engine not in TARGET_ENGINES:
        raise PipelineError("target engine must be 'unreal' or 'generic'")

    asset_source = load_artifact_reference(
        asset_brief,
        workspace_root=workspace_root,
        search_directories=(".realforge/creative/assets",),
        required_fields=("id", "name", "category", "validation_checklist"),
        label="asset brief",
    )
    image_job_source = load_artifact_reference(
        image_job,
        workspace_root=workspace_root,
        search_directories=(".realforge/multimodal/image_jobs",),
        required_fields=("id", "prompt_specs", "provenance", "untrusted"),
        label="image job",
    )
    reference_source = load_artifact_reference(
        reference_board,
        workspace_root=workspace_root,
        search_directories=(".realforge/multimodal/reference_boards",),
        required_fields=("id", "reference_hashes", "untrusted"),
        label="reference board",
    )
    vision_source = load_artifact_reference(
        vision_report,
        workspace_root=workspace_root,
        search_directories=(
            ".realforge/multimodal/vision_understanding",
            ".realforge/multimodal/vision",
            ".realforge/multimodal/vision_comparisons",
            ".realforge/multimodal/vision_asset_briefs",
        ),
        required_fields=("id", "provider", "untrusted"),
        label="vision report",
    )
    sources = tuple(
        item
        for item in (
            _artifact_context("asset_brief", asset_source),
            _artifact_context("image_job", image_job_source),
            _artifact_context("reference_board", reference_source),
            _artifact_context("vision_report", vision_source),
        )
        if item is not None
    )
    context = json.dumps(
        {
            "target_engine": normalized_engine,
            "sources_are_untrusted": True,
            "sources": sources,
        },
        indent=2,
        sort_keys=True,
    )
    raw = provider.generate_asset_pipeline(CreativeRequest(task=normalized_task, context=context))
    data = parse_provider_object(raw, provider=provider.name)
    return AssetPipelinePlan(
        id=new_pipeline_id(),
        created_at=utc_now_iso(),
        title=require_text(data, "title", provider=provider.name),
        source_asset_brief_id=asset_source.id if asset_source else None,
        source_image_job_id=image_job_source.id if image_job_source else None,
        source_reference_board_id=reference_source.id if reference_source else None,
        source_vision_report_id=vision_source.id if vision_source else None,
        target_engine=normalized_engine,
        target_tools=require_string_tuple(data, "target_tools", provider=provider.name),
        asset_category=require_text(data, "asset_category", provider=provider.name),
        production_steps=require_string_tuple(data, "production_steps", provider=provider.name),
        modeling_plan=require_string_tuple(data, "modeling_plan", provider=provider.name),
        texturing_plan=require_string_tuple(data, "texturing_plan", provider=provider.name),
        material_plan=require_string_tuple(data, "material_plan", provider=provider.name),
        collision_plan=require_string_tuple(data, "collision_plan", provider=provider.name),
        lod_plan=require_string_tuple(data, "lod_plan", provider=provider.name),
        rigging_animation_plan=require_string_tuple(
            data,
            "rigging_animation_plan",
            provider=provider.name,
        ),
        import_plan=require_string_tuple(data, "import_plan", provider=provider.name),
        naming_conventions=require_string_tuple(
            data,
            "naming_conventions",
            provider=provider.name,
        ),
        folder_structure=require_relative_paths(
            data,
            "folder_structure",
            provider=provider.name,
        ),
        validation_checklist=require_string_tuple(
            data,
            "validation_checklist",
            provider=provider.name,
        ),
        performance_budget=require_string_tuple(
            data,
            "performance_budget",
            provider=provider.name,
        ),
        risks=require_string_tuple(data, "risks", provider=provider.name),
        human_review_required=True,
        dry_run_only=True,
        untrusted=True,
    )


def format_asset_pipeline_plan(plan: AssetPipelinePlan) -> str:
    return "\n".join(
        (
            "REALFORGE ASSET PIPELINE PLAN",
            "Status: UNTRUSTED / DRY RUN ONLY",
            f"ID: {plan.id}",
            f"Title: {plan.title}",
            f"Target engine: {plan.target_engine}",
            f"Asset category: {plan.asset_category}",
            f"Production steps: {len(plan.production_steps)}",
            "Assets generated: no",
            "Tools executed: no",
            "Human review required: yes",
        )
    )
