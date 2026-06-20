from __future__ import annotations

import json
from pathlib import Path

from realforge.creative.engine_profile import EngineScanError, scan_engine_project
from realforge.creative.models import artifact_to_dict
from realforge.pipeline.models import UnrealAssetImportPlan, new_pipeline_id, utc_now_iso
from realforge.pipeline.validation import (
    parse_provider_object,
    require_string_tuple,
    require_text,
    require_unreal_content_path,
)
from realforge.providers.base import CreativeRequest, ModelProvider


def build_unreal_import_plan(
    project_path: Path,
    task: str,
    provider: ModelProvider,
    *,
    workspace_root: Path,
) -> UnrealAssetImportPlan:
    normalized_task = task.strip()
    if not normalized_task:
        raise ValueError("unreal import-plan task must not be empty")
    profile = scan_engine_project(project_path, workspace_root=workspace_root)
    if profile.engine != "unreal":
        raise EngineScanError("unreal import-plan requires a detected .uproject project")
    context = json.dumps(artifact_to_dict(profile), indent=2, sort_keys=True)
    raw = provider.generate_unreal_import_plan(
        CreativeRequest(task=normalized_task, context=context)
    )
    data = parse_provider_object(raw, provider=provider.name)
    return UnrealAssetImportPlan(
        id=new_pipeline_id(),
        created_at=utc_now_iso(),
        project_profile_id=profile.id,
        project_path=profile.project_root,
        asset_name=require_text(data, "asset_name", provider=provider.name),
        asset_type=require_text(data, "asset_type", provider=provider.name),
        target_content_path=require_unreal_content_path(
            data,
            "target_content_path",
            provider=provider.name,
        ),
        source_files_expected=require_string_tuple(
            data,
            "source_files_expected",
            provider=provider.name,
        ),
        import_settings=require_string_tuple(data, "import_settings", provider=provider.name),
        material_setup=require_string_tuple(data, "material_setup", provider=provider.name),
        collision_setup=require_string_tuple(data, "collision_setup", provider=provider.name),
        lod_setup=require_string_tuple(data, "lod_setup", provider=provider.name),
        blueprint_integration_notes=require_string_tuple(
            data,
            "blueprint_integration_notes",
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


def format_unreal_import_plan(plan: UnrealAssetImportPlan) -> str:
    return "\n".join(
        (
            "REALFORGE UNREAL ASSET IMPORT PLAN",
            "Status: UNTRUSTED / DRY RUN ONLY",
            f"ID: {plan.id}",
            f"Project: {plan.project_path}",
            f"Asset: {plan.asset_name}",
            f"Target content path: {plan.target_content_path}",
            "Unreal Editor opened: no",
            "Assets imported: no",
            "Project files modified: no",
            "Human approval required: yes",
        )
    )
