from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path, PureWindowsPath

from realforge.workspace import assert_path_in_workspace


class CreativeError(Exception):
    """Base error for safe creative planning operations."""


class CreativeProviderError(CreativeError):
    """Raised when untrusted provider output fails strict schema validation."""

    def __init__(self, provider: str, message: str, *, raw: str | None = None) -> None:
        detail = f"{provider} creative output error: {message}"
        if raw:
            detail += f"\nraw response excerpt: {raw[:200]}"
        super().__init__(detail)


@dataclass(frozen=True)
class GameDesignBrief:
    id: str
    created_at: str
    title: str
    genre: str
    perspective: str
    target_platforms: tuple[str, ...]
    core_loop: str
    player_roles: tuple[str, ...]
    mechanics: tuple[str, ...]
    tone: str
    art_direction: str
    technical_constraints: tuple[str, ...]
    risks: tuple[str, ...]
    validation_questions: tuple[str, ...]
    untrusted_provider_output: bool = True


@dataclass(frozen=True)
class MapDesignPlan:
    id: str
    created_at: str
    title: str
    game_context: str
    map_type: str
    scale: str
    layout_goals: tuple[str, ...]
    traversal_paths: tuple[str, ...]
    landmarks: tuple[str, ...]
    encounter_zones: tuple[str, ...]
    sightlines: tuple[str, ...]
    pacing: str
    environmental_storytelling: tuple[str, ...]
    asset_list: tuple[str, ...]
    lighting_mood: str
    performance_notes: tuple[str, ...]
    risks: tuple[str, ...]
    validation_checklist: tuple[str, ...]
    untrusted_provider_output: bool = True


@dataclass(frozen=True)
class AssetBrief:
    id: str
    created_at: str
    name: str
    category: str
    purpose: str
    silhouette: str
    materials: tuple[str, ...]
    scale_reference: str
    style_notes: tuple[str, ...]
    gameplay_constraints: tuple[str, ...]
    engine_constraints: tuple[str, ...]
    texture_requirements: tuple[str, ...]
    lod_notes: tuple[str, ...]
    collision_notes: tuple[str, ...]
    animation_notes: tuple[str, ...]
    validation_checklist: tuple[str, ...]
    untrusted_provider_output: bool = True


@dataclass(frozen=True)
class ImageAnalysisReport:
    id: str
    created_at: str
    image_path: str
    image_sha256: str
    metadata: dict[str, object]
    observed_elements: tuple[str, ...]
    style_notes: tuple[str, ...]
    likely_use_cases: tuple[str, ...]
    risks: tuple[str, ...]
    limitations: tuple[str, ...]
    model_used: str | None
    untrusted: bool = True


@dataclass(frozen=True)
class EngineProjectProfile:
    id: str
    created_at: str
    engine: str
    engine_version: str | None
    project_root: str
    project_file: str | None
    detected_files: tuple[str, ...]
    content_dirs: tuple[str, ...]
    config_dirs: tuple[str, ...]
    source_dirs: tuple[str, ...]
    plugins: tuple[str, ...]
    risks: tuple[str, ...]
    supported_operations: tuple[str, ...]
    dry_run_only: bool = True


@dataclass(frozen=True)
class UnrealCommandPlan:
    id: str
    created_at: str
    project_profile: EngineProjectProfile
    task: str
    proposed_steps: tuple[str, ...]
    files_to_inspect: tuple[str, ...]
    files_to_modify: tuple[str, ...]
    unreal_editor_required: bool
    command_suggestions: tuple[str, ...]
    risks: tuple[str, ...]
    dry_run_only: bool = True
    requires_human_approval: bool = True
    untrusted_provider_output: bool = True


def new_artifact_id() -> str:
    return uuid.uuid4().hex[:12]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def artifact_to_dict(artifact: object) -> dict[str, object]:
    return asdict(artifact)  # type: ignore[arg-type]


def format_artifact(artifact: object) -> str:
    return json.dumps(artifact_to_dict(artifact), indent=2, sort_keys=True)


def parse_provider_object(raw: str, *, provider: str) -> dict[str, object]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise CreativeProviderError(provider, f"invalid JSON: {err.msg}", raw=raw) from err
    if not isinstance(data, dict):
        raise CreativeProviderError(provider, "top-level JSON value must be an object", raw=raw)
    return data


def require_text(data: dict[str, object], field: str, *, provider: str) -> str:
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise CreativeProviderError(provider, f"field {field!r} must be a non-empty string")
    return value.strip()


def require_string_tuple(
    data: dict[str, object],
    field: str,
    *,
    provider: str,
) -> tuple[str, ...]:
    value = data.get(field)
    if not isinstance(value, list):
        raise CreativeProviderError(provider, f"field {field!r} must be a JSON array of strings")
    items: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise CreativeProviderError(
                provider,
                f"field {field!r} must contain only non-empty strings",
            )
        items.append(item.strip())
    return tuple(items)


def require_bool(data: dict[str, object], field: str, *, provider: str) -> bool:
    value = data.get(field)
    if not isinstance(value, bool):
        raise CreativeProviderError(provider, f"field {field!r} must be a boolean")
    return value


def require_relative_paths(
    data: dict[str, object],
    field: str,
    *,
    provider: str,
) -> tuple[str, ...]:
    values = require_string_tuple(data, field, provider=provider)
    for value in values:
        path = Path(value)
        windows_path = PureWindowsPath(value)
        reserved_root = path.parts[0] if path.parts else ""
        if (
            path.is_absolute()
            or windows_path.is_absolute()
            or ".." in path.parts
            or ".." in windows_path.parts
            or reserved_root in {".git", ".realforge"}
        ):
            raise CreativeProviderError(
                provider,
                f"field {field!r} contains an unsafe project path: {value!r}",
            )
    return values


def write_creative_artifact(
    artifact: object,
    workspace_root: Path,
    category: str,
) -> Path:
    if category not in {"briefs", "maps", "assets", "images"}:
        raise CreativeError(f"unsupported creative artifact category: {category}")
    root = workspace_root.resolve()
    artifact_id = str(getattr(artifact, "id"))
    storage_root = (root / ".realforge" / "creative" / category).resolve()
    path = (storage_root / f"{artifact_id}.json").resolve()
    assert_path_in_workspace(path, root)
    try:
        path.relative_to(storage_root)
    except ValueError as err:
        raise CreativeError(f"creative artifact write refused outside {storage_root}: {path}") from err
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(format_artifact(artifact) + "\n", encoding="utf-8")
    return path


def write_engine_artifact(
    artifact: object,
    workspace_root: Path,
    *,
    category: str | None = None,
) -> Path:
    if category not in {None, "plans"}:
        raise CreativeError(f"unsupported engine artifact category: {category}")
    root = workspace_root.resolve()
    artifact_id = str(getattr(artifact, "id"))
    storage_root = (root / ".realforge" / "engines").resolve()
    if category:
        storage_root = (storage_root / category).resolve()
    path = (storage_root / f"{artifact_id}.json").resolve()
    assert_path_in_workspace(path, root)
    try:
        path.relative_to(storage_root)
    except ValueError as err:
        raise CreativeError(f"engine artifact write refused outside {storage_root}: {path}") from err
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(format_artifact(artifact) + "\n", encoding="utf-8")
    return path
