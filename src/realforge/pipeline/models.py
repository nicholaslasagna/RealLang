from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from realforge.creative.models import EngineProjectProfile


@dataclass(frozen=True)
class AssetPipelinePlan:
    id: str
    created_at: str
    title: str
    source_asset_brief_id: str | None
    source_image_job_id: str | None
    source_reference_board_id: str | None
    source_vision_report_id: str | None
    target_engine: str
    target_tools: tuple[str, ...]
    asset_category: str
    production_steps: tuple[str, ...]
    modeling_plan: tuple[str, ...]
    texturing_plan: tuple[str, ...]
    material_plan: tuple[str, ...]
    collision_plan: tuple[str, ...]
    lod_plan: tuple[str, ...]
    rigging_animation_plan: tuple[str, ...]
    import_plan: tuple[str, ...]
    naming_conventions: tuple[str, ...]
    folder_structure: tuple[str, ...]
    validation_checklist: tuple[str, ...]
    performance_budget: tuple[str, ...]
    risks: tuple[str, ...]
    human_review_required: bool = True
    dry_run_only: bool = True
    untrusted: bool = True


@dataclass(frozen=True)
class UnrealAssetImportPlan:
    id: str
    created_at: str
    project_profile_id: str | None
    project_path: str
    asset_name: str
    asset_type: str
    target_content_path: str
    source_files_expected: tuple[str, ...]
    import_settings: tuple[str, ...]
    material_setup: tuple[str, ...]
    collision_setup: tuple[str, ...]
    lod_setup: tuple[str, ...]
    blueprint_integration_notes: tuple[str, ...]
    validation_checklist: tuple[str, ...]
    risks: tuple[str, ...]
    dry_run_only: bool = True
    requires_human_approval: bool = True
    untrusted: bool = True


@dataclass(frozen=True)
class BlenderAssetPlan:
    id: str
    created_at: str
    asset_name: str
    asset_type: str
    modeling_steps: tuple[str, ...]
    sculpting_notes: tuple[str, ...]
    retopology_notes: tuple[str, ...]
    uv_unwrap_plan: tuple[str, ...]
    texture_bake_plan: tuple[str, ...]
    export_format: str
    scale_units: str
    origin_pivot_notes: tuple[str, ...]
    collision_proxy_notes: tuple[str, ...]
    lod_export_notes: tuple[str, ...]
    validation_checklist: tuple[str, ...]
    risks: tuple[str, ...]
    dry_run_only: bool = True
    requires_human_approval: bool = True
    untrusted: bool = True


@dataclass(frozen=True)
class EnginePipelineReport:
    id: str
    created_at: str
    engine: str
    project_profile: EngineProjectProfile | None
    task: str
    planned_operations: tuple[str, ...]
    files_to_inspect: tuple[str, ...]
    files_to_modify_if_approved: tuple[str, ...]
    command_suggestions: tuple[str, ...]
    validation_checklist: tuple[str, ...]
    risks: tuple[str, ...]
    dry_run_only: bool = True
    requires_human_approval: bool = True
    untrusted: bool = True


def new_pipeline_id() -> str:
    return uuid.uuid4().hex[:12]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def pipeline_to_dict(report: object) -> dict[str, object]:
    return asdict(report)  # type: ignore[arg-type]
