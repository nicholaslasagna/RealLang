from __future__ import annotations

import json
from pathlib import Path

from realforge.creative.models import (
    CreativeError,
    EngineProjectProfile,
    new_artifact_id,
    utc_now_iso,
)
from realforge.workspace import WorkspaceError, assert_path_in_workspace


class EngineScanError(CreativeError):
    pass


def _relative_existing_dirs(root: Path, name: str) -> tuple[str, ...]:
    path = root / name
    return (name,) if path.is_dir() else ()


def _detect_plugins(root: Path) -> tuple[str, ...]:
    plugins_root = root / "Plugins"
    if not plugins_root.is_dir():
        return ()
    plugins: set[str] = set()
    for descriptor in plugins_root.rglob("*.uplugin"):
        try:
            relative = descriptor.resolve().relative_to(root.resolve())
        except ValueError:
            continue
        plugins.add(relative.as_posix())
    return tuple(sorted(plugins))


def _read_engine_version(project_file: Path, risks: list[str]) -> str | None:
    try:
        data = json.loads(project_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        risks.append(f"Could not parse {project_file.name}: {err}")
        return None
    if not isinstance(data, dict):
        risks.append(f"{project_file.name} is not a JSON object.")
        return None
    association = data.get("EngineAssociation")
    return association.strip() if isinstance(association, str) and association.strip() else None


def scan_engine_project(
    project_path: Path,
    *,
    workspace_root: Path,
) -> EngineProjectProfile:
    workspace = workspace_root.resolve()
    requested = project_path.resolve()
    try:
        assert_path_in_workspace(requested, workspace)
    except WorkspaceError as err:
        raise EngineScanError(f"engine scan refused outside workspace {workspace}: {requested}") from err

    if requested.is_file() and requested.suffix.lower() == ".uproject":
        root = requested.parent
        project_files = [requested]
    elif requested.is_dir():
        root = requested
        project_files = sorted(root.glob("*.uproject"))
    else:
        raise EngineScanError(f"engine project path not found: {requested}")

    risks: list[str] = []
    project_file: Path | None = project_files[0] if project_files else None
    if len(project_files) > 1:
        risks.append(
            "Multiple .uproject files were detected; the first sorted descriptor was selected."
        )

    engine = "unreal" if project_file is not None else "unknown"
    engine_version = _read_engine_version(project_file, risks) if project_file else None
    if project_file is None:
        risks.append("No .uproject file was detected at the project root.")

    content_dirs = _relative_existing_dirs(root, "Content")
    config_dirs = _relative_existing_dirs(root, "Config")
    source_dirs = _relative_existing_dirs(root, "Source")
    plugins = _detect_plugins(root)
    detected = [path.name for path in project_files]
    detected.extend((*config_dirs, *content_dirs, *source_dirs))
    if (root / "Plugins").is_dir():
        detected.append("Plugins")

    return EngineProjectProfile(
        id=new_artifact_id(),
        created_at=utc_now_iso(),
        engine=engine,
        engine_version=engine_version,
        project_root=str(root),
        project_file=project_file.name if project_file else None,
        detected_files=tuple(sorted(set(detected))),
        content_dirs=content_dirs,
        config_dirs=config_dirs,
        source_dirs=source_dirs,
        plugins=plugins,
        risks=tuple(risks),
        supported_operations=("scan", "plan") if engine == "unreal" else ("scan",),
        dry_run_only=True,
    )
