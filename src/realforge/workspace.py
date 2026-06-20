from __future__ import annotations

from pathlib import Path

from realforge.permissions import PermissionError, PermissionMode, Permissions


class WorkspaceError(PermissionError):
    pass


def assert_path_in_workspace(path: Path, workspace_root: Path | None) -> None:
    if workspace_root is None:
        raise WorkspaceError("workspace root is not configured")
    try:
        path.resolve().relative_to(workspace_root.resolve())
    except ValueError as err:
        raise WorkspaceError(
            f"write refused: {path} is outside workspace {workspace_root}"
        ) from err


def assert_can_write(path: Path, permissions: Permissions) -> None:
    if permissions.mode != PermissionMode.WORKSPACE_WRITE:
        raise PermissionError(
            f"write not permitted for {path} in {permissions.mode.value} mode"
        )
    assert_path_in_workspace(path, permissions.workspace_root)


def backup_path(path: Path, suffix: str = ".bak") -> Path:
    return path.with_suffix(path.suffix + suffix)


def next_backup_path(path: Path, suffix: str = ".bak") -> Path:
    base = backup_path(path, suffix)
    if not base.exists():
        return base
    index = 1
    while True:
        candidate = Path(f"{base}.{index}")
        if not candidate.exists():
            return candidate
        index += 1


def read_source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def create_backup(path: Path, suffix: str = ".bak") -> Path:
    dest = next_backup_path(path, suffix)
    dest.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return dest


def restore_from_backup(path: Path, backup: Path) -> None:
    path.write_text(backup.read_text(encoding="utf-8"), encoding="utf-8")


def write_with_backup(
    path: Path,
    content: str,
    *,
    suffix: str,
    permissions: Permissions,
) -> Path | None:
    assert_can_write(path, permissions)
    backup: Path | None = None
    if path.exists():
        backup = create_backup(path, suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return backup
