from __future__ import annotations

import json
from pathlib import Path

from realforge.creative.engine_profile import EngineScanError, scan_engine_project
from realforge.creative.models import (
    UnrealCommandPlan,
    artifact_to_dict,
    new_artifact_id,
    parse_provider_object,
    require_bool,
    require_relative_paths,
    require_string_tuple,
    utc_now_iso,
)
from realforge.providers.base import CreativeRequest, ModelProvider


def build_unreal_command_plan(
    project_path: Path,
    task: str,
    provider: ModelProvider,
    *,
    workspace_root: Path,
) -> UnrealCommandPlan:
    normalized = task.strip()
    if not normalized:
        raise ValueError("unreal plan task must not be empty")
    profile = scan_engine_project(project_path, workspace_root=workspace_root)
    if profile.engine != "unreal":
        raise EngineScanError("unreal plan requires a detected .uproject project")

    context = json.dumps(artifact_to_dict(profile), indent=2, sort_keys=True)
    raw = provider.generate_unreal_plan(CreativeRequest(task=normalized, context=context))
    data = parse_provider_object(raw, provider=provider.name)
    return UnrealCommandPlan(
        id=new_artifact_id(),
        created_at=utc_now_iso(),
        project_profile=profile,
        task=normalized,
        proposed_steps=require_string_tuple(data, "proposed_steps", provider=provider.name),
        files_to_inspect=require_relative_paths(
            data,
            "files_to_inspect",
            provider=provider.name,
        ),
        files_to_modify=require_relative_paths(
            data,
            "files_to_modify",
            provider=provider.name,
        ),
        unreal_editor_required=require_bool(
            data,
            "unreal_editor_required",
            provider=provider.name,
        ),
        command_suggestions=require_string_tuple(
            data,
            "command_suggestions",
            provider=provider.name,
        ),
        risks=require_string_tuple(data, "risks", provider=provider.name),
        dry_run_only=True,
        requires_human_approval=True,
        untrusted_provider_output=True,
    )
