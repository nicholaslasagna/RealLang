from __future__ import annotations

import json
from pathlib import Path

from realforge.creative.engine_profile import scan_engine_project
from realforge.creative.models import artifact_to_dict
from realforge.pipeline.models import EnginePipelineReport, new_pipeline_id, utc_now_iso
from realforge.pipeline.validation import (
    parse_provider_object,
    require_relative_paths,
    require_string_tuple,
)
from realforge.providers.base import CreativeRequest, ModelProvider


def build_engine_pipeline_report(
    project_path: Path,
    task: str,
    provider: ModelProvider,
    *,
    workspace_root: Path,
) -> EnginePipelineReport:
    normalized_task = task.strip()
    if not normalized_task:
        raise ValueError("engine pipeline task must not be empty")
    profile = scan_engine_project(project_path, workspace_root=workspace_root)
    context = json.dumps(artifact_to_dict(profile), indent=2, sort_keys=True)
    raw = provider.generate_engine_pipeline(CreativeRequest(task=normalized_task, context=context))
    data = parse_provider_object(raw, provider=provider.name)
    return EnginePipelineReport(
        id=new_pipeline_id(),
        created_at=utc_now_iso(),
        engine=profile.engine,
        project_profile=profile,
        task=normalized_task,
        planned_operations=require_string_tuple(
            data,
            "planned_operations",
            provider=provider.name,
        ),
        files_to_inspect=require_relative_paths(
            data,
            "files_to_inspect",
            provider=provider.name,
        ),
        files_to_modify_if_approved=require_relative_paths(
            data,
            "files_to_modify_if_approved",
            provider=provider.name,
            allow_empty=True,
        ),
        command_suggestions=require_string_tuple(
            data,
            "command_suggestions",
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


def format_engine_pipeline_report(report: EnginePipelineReport) -> str:
    return "\n".join(
        (
            "REALFORGE ENGINE PIPELINE REPORT",
            "Status: UNTRUSTED / DRY RUN ONLY",
            f"ID: {report.id}",
            f"Engine: {report.engine}",
            f"Project: {report.project_profile.project_root if report.project_profile else '(none)'}",
            f"Planned operations: {len(report.planned_operations)}",
            f"Command suggestions: {len(report.command_suggestions)} (never executed)",
            "Project files modified: no",
            "Human approval required: yes",
        )
    )
