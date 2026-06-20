from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path, PureWindowsPath

from realforge.workspace import WorkspaceError, assert_path_in_workspace


MAX_ARTIFACT_BYTES = 1024 * 1024
ARTIFACT_ID_PATTERN = re.compile(r"^[0-9a-f]{12}$")


class PipelineError(Exception):
    """Base error for planning-only engine and asset pipeline workflows."""


class PipelineProviderError(PipelineError):
    def __init__(self, provider: str, message: str, *, raw: str | None = None) -> None:
        detail = f"{provider} pipeline output error: {message}"
        if raw:
            detail += f"\nraw response excerpt: {raw[:200]}"
        super().__init__(detail)


@dataclass(frozen=True)
class LoadedArtifact:
    id: str
    path: str
    data: dict[str, object]


def parse_provider_object(raw: str, *, provider: str) -> dict[str, object]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise PipelineProviderError(provider, f"invalid JSON: {err.msg}", raw=raw) from err
    if not isinstance(data, dict):
        raise PipelineProviderError(provider, "top-level JSON value must be an object", raw=raw)
    return data


def require_text(data: dict[str, object], field: str, *, provider: str) -> str:
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise PipelineProviderError(provider, f"field {field!r} must be a non-empty string")
    return value.strip()


def require_string_tuple(
    data: dict[str, object],
    field: str,
    *,
    provider: str,
    allow_empty: bool = False,
) -> tuple[str, ...]:
    value = data.get(field)
    if not isinstance(value, list) or (not allow_empty and not value):
        raise PipelineProviderError(
            provider,
            f"field {field!r} must be a non-empty JSON array of strings",
        )
    items: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise PipelineProviderError(
                provider,
                f"field {field!r} must contain only non-empty strings",
            )
        items.append(item.strip())
    return tuple(items)


def require_relative_paths(
    data: dict[str, object],
    field: str,
    *,
    provider: str,
    allow_empty: bool = False,
) -> tuple[str, ...]:
    values = require_string_tuple(data, field, provider=provider, allow_empty=allow_empty)
    for value in values:
        path = Path(value)
        windows_path = PureWindowsPath(value)
        reserved_roots = {
            path.parts[0] if path.parts else "",
            windows_path.parts[0] if windows_path.parts else "",
        }
        if (
            path.is_absolute()
            or windows_path.is_absolute()
            or ".." in path.parts
            or ".." in windows_path.parts
            or reserved_roots.intersection({".git", ".realforge"})
        ):
            raise PipelineProviderError(
                provider,
                f"field {field!r} contains an unsafe project path: {value!r}",
            )
    return values


def require_unreal_content_path(
    data: dict[str, object],
    field: str,
    *,
    provider: str,
) -> str:
    value = require_text(data, field, provider=provider)
    if not value.startswith("/Game/") or ".." in value or "\\" in value:
        raise PipelineProviderError(
            provider,
            f"field {field!r} must be a safe Unreal /Game/ content path",
        )
    return value


def _artifact_path(
    reference: str,
    *,
    workspace_root: Path,
    search_directories: tuple[str, ...],
) -> Path:
    root = workspace_root.resolve()
    candidate = Path(reference)
    is_id = ARTIFACT_ID_PATTERN.fullmatch(reference) is not None
    if is_id:
        matches = [
            (root / directory / f"{reference}.json").resolve()
            for directory in search_directories
            if (root / directory / f"{reference}.json").is_file()
        ]
        if not matches:
            raise PipelineError(f"pipeline source artifact not found: {reference}")
        if len(matches) > 1:
            raise PipelineError(f"pipeline source artifact id is ambiguous: {reference}")
        path = matches[0]
        try:
            assert_path_in_workspace(path, root)
        except WorkspaceError as err:
            raise PipelineError(
                f"pipeline source artifact refused outside workspace {root}: {path}"
            ) from err
        return path
    path = candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()
    try:
        assert_path_in_workspace(path, root)
    except WorkspaceError as err:
        raise PipelineError(f"pipeline source artifact refused outside workspace {root}: {path}") from err
    return path


def load_artifact_reference(
    reference: str | None,
    *,
    workspace_root: Path,
    search_directories: tuple[str, ...],
    required_fields: tuple[str, ...],
    label: str,
) -> LoadedArtifact | None:
    if reference is None:
        return None
    normalized = reference.strip()
    if not normalized:
        raise PipelineError(f"{label} reference must not be empty")
    path = _artifact_path(
        normalized,
        workspace_root=workspace_root,
        search_directories=search_directories,
    )
    if not path.is_file():
        raise PipelineError(f"{label} artifact must be a regular JSON file: {path}")
    if path.suffix.lower() != ".json":
        raise PipelineError(f"{label} artifact must use a .json extension: {path}")
    size = path.stat().st_size
    if size > MAX_ARTIFACT_BYTES:
        raise PipelineError(
            f"{label} artifact exceeds context limit: {size} > {MAX_ARTIFACT_BYTES} bytes"
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        raise PipelineError(f"could not read {label} artifact {path}: {err}") from err
    if not isinstance(data, dict):
        raise PipelineError(f"{label} artifact must contain one JSON object: {path}")
    artifact_id = data.get("id")
    if not isinstance(artifact_id, str) or not artifact_id.strip():
        raise PipelineError(f"{label} artifact is missing a valid id: {path}")
    if ARTIFACT_ID_PATTERN.fullmatch(normalized) and artifact_id.strip() != normalized:
        raise PipelineError(
            f"{label} artifact id {artifact_id.strip()!r} does not match requested id {normalized!r}"
        )
    missing = [field for field in required_fields if field not in data]
    if missing:
        raise PipelineError(f"{label} artifact is missing required fields: {', '.join(missing)}")
    return LoadedArtifact(id=artifact_id.strip(), path=str(path), data=data)
