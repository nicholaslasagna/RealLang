from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path, PurePosixPath

from realforge.command_policy import patch_apply_permissions
from realforge.config import RealForgeConfig
from realforge.git_utils import is_git_repo
from realforge.permissions import PermissionMode, Permissions
from realforge.runner import run_command

BLOCKED_PREFIXES = (".git/", ".git")
REALFORGE_PREFIX = ".realforge/"


class PatchSafetyError(Exception):
    pass


class FileBackupKind(str, Enum):
    MODIFIED = "modified"
    DELETED = "deleted"
    NEW = "new"


@dataclass(frozen=True)
class FileBackup:
    rel_path: str
    kind: FileBackupKind
    content: bytes | None


@dataclass(frozen=True)
class PatchInspection:
    patch_sha256: str
    patch_targets: tuple[str, ...]
    deleted_targets: tuple[str, ...]
    new_targets: tuple[str, ...]


@dataclass(frozen=True)
class RollbackOutcome:
    ok: bool
    errors: tuple[str, ...]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def _strip_ab_prefix(path: str) -> str:
    stripped = path.strip()
    if stripped.startswith("a/"):
        return stripped[2:]
    if stripped.startswith("b/"):
        return stripped[2:]
    return stripped


def normalize_patch_target(rel: str) -> str:
    raw = _strip_ab_prefix(rel.strip())
    if not raw or raw == "/dev/null":
        raise PatchSafetyError("invalid patch target path")
    if raw.startswith("/"):
        raise PatchSafetyError(f"absolute patch target rejected: {rel!r}")
    pure = PurePosixPath(raw)
    if pure.is_absolute():
        raise PatchSafetyError(f"absolute patch target rejected: {rel!r}")
    if ".." in pure.parts:
        raise PatchSafetyError(f"path traversal rejected in patch target: {rel!r}")
    normalized = pure.as_posix()
    if normalized in BLOCKED_PREFIXES or normalized.startswith(BLOCKED_PREFIXES[0]):
        raise PatchSafetyError(f"patch target under .git/ rejected: {normalized}")
    if normalized == ".realforge" or normalized.startswith(REALFORGE_PREFIX):
        raise PatchSafetyError(f"patch target under .realforge/ rejected: {normalized}")
    return normalized


def assert_target_in_workspace(rel: str, workspace_root: Path) -> str:
    normalized = normalize_patch_target(rel)
    resolved = (workspace_root.resolve() / normalized).resolve()
    try:
        resolved.relative_to(workspace_root.resolve())
    except ValueError as err:
        raise PatchSafetyError(f"patch target escapes workspace: {normalized}") from err
    return normalized


def validate_patch_targets(
    targets: tuple[str, ...],
    workspace_root: Path,
) -> tuple[str, ...]:
    if not targets:
        raise PatchSafetyError("patch has no target paths")
    validated: list[str] = []
    seen: set[str] = set()
    for target in targets:
        normalized = assert_target_in_workspace(target, workspace_root)
        if normalized not in seen:
            seen.add(normalized)
            validated.append(normalized)
    return tuple(validated)


def _parse_diff_git_paths(text: str) -> set[str]:
    paths: set[str] = set()
    for line in text.splitlines():
        if line.startswith("diff --git "):
            match = re.match(r"diff --git a/(.+?) b/(.+)", line)
            if match:
                left, right = match.group(1), match.group(2)
                if left != "/dev/null":
                    paths.add(left)
                if right != "/dev/null":
                    paths.add(right)
    return paths


def _parse_header_paths(text: str) -> tuple[set[str], set[str], set[str]]:
    all_paths: set[str] = set()
    deleted: set[str] = set()
    created: set[str] = set()
    old_path: str | None = None
    for line in text.splitlines():
        if line.startswith("--- "):
            old = line[4:].strip()
            old_path = old
            if old != "/dev/null":
                all_paths.add(_strip_ab_prefix(old))
        elif line.startswith("+++ "):
            new = line[4:].strip()
            if old_path == "/dev/null" and new != "/dev/null":
                created.add(_strip_ab_prefix(new))
            if new == "/dev/null" and old_path and old_path != "/dev/null":
                deleted.add(_strip_ab_prefix(old_path))
            if new != "/dev/null":
                all_paths.add(_strip_ab_prefix(new))
            old_path = None
    return all_paths, deleted, created


def parse_patch_targets_from_text(text: str) -> tuple[str, ...]:
    git_paths = _parse_diff_git_paths(text)
    header_paths, _, _ = _parse_header_paths(text)
    combined = git_paths | header_paths
    return tuple(sorted(combined))


def _parse_deleted_new_from_text(text: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
    _, deleted, created = _parse_header_paths(text)
    git_deleted: set[str] = set()
    git_created: set[str] = set()
    old_path: str | None = None
    for line in text.splitlines():
        if line.startswith("--- "):
            old_path = line[4:].strip()
        elif line.startswith("+++ "):
            new = line[4:].strip()
            if old_path == "/dev/null" and new != "/dev/null":
                git_created.add(_strip_ab_prefix(new))
            if new == "/dev/null" and old_path and old_path != "/dev/null":
                git_deleted.add(_strip_ab_prefix(old_path))
            old_path = None
    deleted |= git_deleted
    created |= git_created
    return tuple(sorted(deleted)), tuple(sorted(created))


def detect_patch_targets_git(
    patch_file: Path,
    workspace_root: Path,
    *,
    config: RealForgeConfig | None = None,
) -> tuple[str, ...]:
    perms = patch_apply_permissions(workspace_root)
    check = run_command(
        ("git", "apply", "--check", str(patch_file.resolve())),
        config=config,
        permissions=perms,
        cwd=workspace_root,
    )
    if check.returncode != 0:
        detail = check.stderr.strip() or check.stdout.strip() or "git apply --check failed"
        raise PatchSafetyError(detail)

    numstat = run_command(
        ("git", "apply", "--numstat", str(patch_file.resolve())),
        config=config,
        permissions=perms,
        cwd=workspace_root,
    )
    if numstat.returncode != 0:
        detail = numstat.stderr.strip() or numstat.stdout.strip() or "git apply --numstat failed"
        raise PatchSafetyError(detail)

    targets: list[str] = []
    for line in numstat.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and parts[2].strip():
            targets.append(parts[2].strip())
    if not targets:
        raise PatchSafetyError("git apply --numstat returned no patch targets")
    return tuple(dict.fromkeys(targets))


def inspect_patch_file(
    patch_file: Path,
    workspace_root: Path,
    *,
    config: RealForgeConfig | None = None,
) -> PatchInspection:
    patch_file = patch_file.resolve()
    if not patch_file.is_file():
        raise PatchSafetyError(f"patch file not found: {patch_file}")

    text = patch_file.read_text(encoding="utf-8")
    if "---" not in text and "diff --git" not in text:
        raise PatchSafetyError("patch must be a unified diff")

    patch_sha256 = sha256_file(patch_file)
    if is_git_repo(workspace_root):
        raw_targets = detect_patch_targets_git(patch_file, workspace_root, config=config)
    else:
        raw_targets = parse_patch_targets_from_text(text)

    patch_targets = validate_patch_targets(raw_targets, workspace_root)
    deleted_targets, new_targets = _parse_deleted_new_from_text(text)
    validated_deleted = validate_patch_targets(deleted_targets, workspace_root) if deleted_targets else ()
    validated_new = validate_patch_targets(new_targets, workspace_root) if new_targets else ()
    return PatchInspection(
        patch_sha256=patch_sha256,
        patch_targets=patch_targets,
        deleted_targets=validated_deleted,
        new_targets=validated_new,
    )


def read_text_file_or_raise(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except OSError as err:
        raise PatchSafetyError(f"unable to read file for backup: {path}: {err}") from err


def ensure_text_targets_for_backup(workspace_root: Path, targets: tuple[str, ...]) -> None:
    for rel in targets:
        path = workspace_root / rel
        if not path.is_file():
            continue
        data = read_text_file_or_raise(path)
        try:
            data.decode("utf-8")
        except UnicodeDecodeError as err:
            raise PatchSafetyError(
                f"binary or non-UTF-8 file cannot be safely backed up for rollback: {rel}"
            ) from err


def build_patch_backups(
    workspace_root: Path,
    *,
    patch_targets: tuple[str, ...],
    deleted_targets: tuple[str, ...],
    new_targets: tuple[str, ...],
) -> dict[str, FileBackup]:
    ensure_text_targets_for_backup(workspace_root, patch_targets)
    backups: dict[str, FileBackup] = {}

    for rel in patch_targets:
        path = workspace_root / rel
        if rel in new_targets or not path.is_file():
            backups[rel] = FileBackup(rel_path=rel, kind=FileBackupKind.NEW, content=None)
        elif rel in deleted_targets:
            backups[rel] = FileBackup(
                rel_path=rel,
                kind=FileBackupKind.DELETED,
                content=read_text_file_or_raise(path),
            )
        else:
            backups[rel] = FileBackup(
                rel_path=rel,
                kind=FileBackupKind.MODIFIED,
                content=read_text_file_or_raise(path),
            )
    return backups


def rollback_patch_backups(backups: dict[str, FileBackup], workspace_root: Path) -> RollbackOutcome:
    errors: list[str] = []
    for rel in sorted(backups, reverse=True):
        backup = backups[rel]
        path = workspace_root / rel
        try:
            if backup.kind == FileBackupKind.NEW:
                if path.exists():
                    path.unlink()
            elif backup.content is None:
                errors.append(f"rollback missing content for {rel}")
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(backup.content)
        except OSError as err:
            errors.append(f"rollback failed for {rel}: {err}")
    return RollbackOutcome(ok=not errors, errors=tuple(errors))


WORKSPACE_HASH_IGNORED = frozenset(
    {
        ".git",
        ".venv",
        "venv",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        "build",
        "dist",
        ".realforge",
    }
)


def _should_hash_path(path: Path, workspace_root: Path) -> bool:
    try:
        rel = path.resolve().relative_to(workspace_root.resolve())
    except ValueError:
        return False
    if not path.is_file():
        return False
    for part in rel.parts:
        if part in WORKSPACE_HASH_IGNORED:
            return False
    return True


def workspace_source_hashes(workspace_root: Path) -> dict[str, str]:
    root = workspace_root.resolve()
    hashes: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if not _should_hash_path(path, root):
            continue
        rel = path.relative_to(root).as_posix()
        hashes[rel] = sha256_file(path)
    return hashes


def workspace_content_digest(workspace_root: Path) -> str:
    payload = json.dumps(workspace_source_hashes(workspace_root), sort_keys=True, separators=(",", ":"))
    return sha256_text(payload)


def verify_patch_sha256(path: Path, expected: str) -> None:
    actual = sha256_file(path)
    if actual != expected:
        raise PatchSafetyError(
            f"patch SHA-256 mismatch: expected {expected}, got {actual}"
        )
