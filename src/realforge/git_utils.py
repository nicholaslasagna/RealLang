from __future__ import annotations

import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.permissions import PermissionMode, Permissions
from realforge.runner import CommandResult, run_command

EXPERIMENT_ROOT_NAME = "realforge-experiments"
MARKER_FILE = ".realforge-experiment"

_COPY_IGNORE = shutil.ignore_patterns(
    ".venv",
    "__pycache__",
    ".git",
    "*.pyc",
    ".pytest_cache",
    "benchmarks/build",
    "benchmarks/results",
)


@dataclass(frozen=True)
class ExperimentWorkspace:
    experiment_id: str
    root_dir: Path
    workspace_path: Path
    mode: str
    main_repo_root: Path


def experiment_temp_root() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / EXPERIMENT_ROOT_NAME


def is_git_repo(path: Path) -> bool:
    return (path / ".git").exists()


def assert_outside_main_workspace(experiment_path: Path, main_root: Path) -> None:
    try:
        experiment_path.resolve().relative_to(main_root.resolve())
    except ValueError:
        return
    raise ValueError(f"experiment path must be outside main workspace: {experiment_path}")


def snapshot_working_tree(root: Path) -> dict[str, int]:
    snapshot: dict[str, int] = {}
    root = root.resolve()
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if rel.parts and rel.parts[0] == ".git":
            continue
        snapshot[rel.as_posix()] = path.stat().st_mtime_ns
    return snapshot


def working_tree_changed(before: dict[str, int], after: dict[str, int]) -> bool:
    return before != after


def create_experiment_workspace(
    main_root: Path,
    *,
    config: RealForgeConfig | None = None,
    temp_root: Path | None = None,
) -> ExperimentWorkspace:
    main_root = main_root.resolve()
    experiment_id = uuid.uuid4().hex[:12]
    base = (temp_root or experiment_temp_root()) / experiment_id
    workspace_path = base / "workspace"
    assert_outside_main_workspace(base, main_root)

    if is_git_repo(main_root):
        base.mkdir(parents=True, exist_ok=True)
        perms = Permissions(
            mode=PermissionMode.READONLY,
            workspace_root=main_root,
            allow_git_worktree_admin=True,
        )
        result = run_command(
            ("git", "worktree", "add", "--detach", str(workspace_path), "HEAD"),
            config=config,
            permissions=perms,
            cwd=main_root,
        )
        if result.returncode != 0:
            shutil.rmtree(base, ignore_errors=True)
            raise RuntimeError(f"git worktree add failed: {result.stderr.strip() or result.stdout.strip()}")
        mode = "git_worktree"
    else:
        shutil.copytree(main_root, workspace_path, ignore=_COPY_IGNORE, dirs_exist_ok=False)
        mode = "copy"

    marker = base / MARKER_FILE
    marker.write_text(f"{experiment_id}\n{mode}\n", encoding="utf-8")
    return ExperimentWorkspace(
        experiment_id=experiment_id,
        root_dir=base,
        workspace_path=workspace_path,
        mode=mode,
        main_repo_root=main_root,
    )


def apply_unified_patch(
    patch_file: Path,
    workspace: ExperimentWorkspace,
    *,
    config: RealForgeConfig | None = None,
) -> CommandResult:
    patch_file = patch_file.resolve()
    if not patch_file.is_file():
        raise FileNotFoundError(f"patch file not found: {patch_file}")

    text = patch_file.read_text(encoding="utf-8")
    if "---" not in text and "diff --git" not in text:
        raise ValueError("patch must be a unified diff")

    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=workspace.workspace_path)
    if is_git_repo(workspace.workspace_path):
        return run_command(
            ("git", "apply", "--whitespace=nowarn", str(patch_file)),
            config=config,
            permissions=perms,
            cwd=workspace.workspace_path,
        )
    return run_command(
        ("patch", "-p1", "--forward", "-i", str(patch_file)),
        config=config,
        permissions=perms,
        cwd=workspace.workspace_path,
    )


def remove_experiment_workspace(
    workspace: ExperimentWorkspace,
    *,
    config: RealForgeConfig | None = None,
) -> str:
    if not is_known_experiment_root(workspace.root_dir):
        return "skipped: not a known experiment workspace"

    if workspace.mode == "git_worktree":
        perms = Permissions(
            mode=PermissionMode.READONLY,
            workspace_root=workspace.main_repo_root,
            allow_git_worktree_admin=True,
        )
        result = run_command(
            ("git", "worktree", "remove", "--force", str(workspace.workspace_path)),
            config=config,
            permissions=perms,
            cwd=workspace.main_repo_root,
        )
        if result.returncode != 0:
            return f"failed: git worktree remove ({result.stderr.strip() or result.stdout.strip()})"

    shutil.rmtree(workspace.root_dir, ignore_errors=True)
    if workspace.root_dir.exists():
        return "failed: experiment directory still exists"
    return "removed"


def is_known_experiment_root(path: Path) -> bool:
    path = path.resolve()
    marker = path / MARKER_FILE
    if not marker.is_file():
        return False
    lines = marker.read_text(encoding="utf-8").splitlines()
    if not lines:
        return False
    experiment_id = lines[0].strip()
    return bool(experiment_id) and path.name == experiment_id
