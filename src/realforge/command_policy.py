from __future__ import annotations

import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING

from realforge.permissions import PermissionMode, Permissions

if TYPE_CHECKING:
    from realforge.config import RealForgeConfig


class CommandDisposition(str, Enum):
    RAN = "ran"
    BLOCKED = "blocked"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class CommandPolicyResult:
    allowed: bool
    disposition: CommandDisposition
    reason: str
    category: str


def _cmd_joined(cmd: tuple[str, ...]) -> str:
    return " ".join(cmd)


def _is_git_worktree_admin(cmd: tuple[str, ...]) -> bool:
    return len(cmd) >= 2 and cmd[0] == "git" and cmd[1] == "worktree"


def _is_git_readonly(cmd: tuple[str, ...]) -> bool:
    return len(cmd) >= 2 and cmd[0] == "git" and cmd[1] in {"status", "diff", "rev-parse", "show"}


def _is_git_diff_check(cmd: tuple[str, ...]) -> bool:
    return len(cmd) == 3 and cmd[0] == "git" and cmd[1] == "diff" and cmd[2] == "--check"


def _is_git_apply(cmd: tuple[str, ...]) -> bool:
    return len(cmd) >= 2 and cmd[0] == "git" and cmd[1] == "apply"


def _is_git_add_paths(cmd: tuple[str, ...]) -> bool:
    return len(cmd) >= 4 and cmd[0] == "git" and cmd[1] == "add" and "--" in cmd


def _is_git_commit(cmd: tuple[str, ...]) -> bool:
    return len(cmd) >= 3 and cmd[0] == "git" and cmd[1] == "commit"


def _is_patch_apply(cmd: tuple[str, ...]) -> bool:
    return len(cmd) >= 4 and cmd[0] == "patch" and "-p1" in cmd and "--forward" in cmd and "-i" in cmd


def _is_pytest(cmd: tuple[str, ...]) -> bool:
    if not cmd:
        return False
    if Path(cmd[0]).name == "pytest":
        return True
    if len(cmd) >= 4 and cmd[1] == "-m" and cmd[2] == "pytest":
        return True
    return False


def _is_realc_check(cmd: tuple[str, ...], config: RealForgeConfig | None) -> bool:
    if not cmd or cmd[-1] != "--check":
        return False
    if config is not None:
        prefix = config.realc_command
        if len(cmd) >= len(prefix) + 1 and cmd[: len(prefix)] == prefix:
            return True
    return "--check" in cmd and any("realc" in part or "reallang.cli" in part for part in cmd)


def _is_realforge_check(cmd: tuple[str, ...]) -> bool:
    if len(cmd) < 4:
        return False
    if cmd[1:3] != ("-m", "realforge.cli"):
        return False
    return cmd[3] == "check"


def _is_benchmark_smoke(cmd: tuple[str, ...]) -> bool:
    if not any("run_benchmarks.py" in part for part in cmd):
        return False
    required = {"--runs", "--warmup", "--skip-slow"}
    return required.issubset(set(cmd))


def _is_validation_command(cmd: tuple[str, ...], *, config: RealForgeConfig | None) -> bool:
    return (
        _is_pytest(cmd)
        or _is_git_diff_check(cmd)
        or _is_realc_check(cmd, config)
        or _is_realforge_check(cmd)
        or _is_benchmark_smoke(cmd)
    )


def evaluate_shell_command(
    cmd: tuple[str, ...],
    *,
    permissions: Permissions,
    config: RealForgeConfig | None = None,
) -> CommandPolicyResult:
    joined = _cmd_joined(cmd)

    if permissions.allow_git_worktree_admin and _is_git_worktree_admin(cmd):
        return CommandPolicyResult(True, CommandDisposition.RAN, "git worktree admin allowed", "git_worktree")

    if permissions.allow_patch_apply and (_is_git_apply(cmd) or _is_patch_apply(cmd)):
        return CommandPolicyResult(True, CommandDisposition.RAN, "patch apply allowed", "patch_apply")

    if permissions.allow_proposal_git_writes and (_is_git_add_paths(cmd) or _is_git_commit(cmd)):
        return CommandPolicyResult(True, CommandDisposition.RAN, "proposal git write allowed", "proposal_git")

    if permissions.allow_validation_commands and _is_validation_command(cmd, config=config):
        return CommandPolicyResult(True, CommandDisposition.RAN, "validation command allowlisted", "validation")

    if _is_git_readonly(cmd):
        return CommandPolicyResult(True, CommandDisposition.RAN, "git read-only command allowed", "git_readonly")

    if _is_realc_check(cmd, config):
        return CommandPolicyResult(True, CommandDisposition.RAN, "realc --check allowed", "realc_check")

    if permissions.mode == PermissionMode.MANUAL:
        return CommandPolicyResult(
            False,
            CommandDisposition.BLOCKED,
            f"manual mode blocks shell execution (no interactive prompt): {joined}",
            "manual_mode",
        )

    if permissions.mode == PermissionMode.READONLY:
        return CommandPolicyResult(
            False,
            CommandDisposition.BLOCKED,
            f"readonly mode blocks shell command: {joined}",
            "readonly_mode",
        )

    return CommandPolicyResult(
        False,
        CommandDisposition.BLOCKED,
        f"command not in RealForge allowlist: {joined}",
        "not_allowlisted",
    )


def validation_permissions(workspace_root: Path) -> Permissions:
    from realforge.permissions import PermissionMode

    return Permissions(
        mode=PermissionMode.WORKSPACE_WRITE,
        workspace_root=workspace_root,
        allow_validation_commands=True,
    )


def patch_apply_permissions(workspace_root: Path) -> Permissions:
    from realforge.permissions import PermissionMode

    return Permissions(
        mode=PermissionMode.WORKSPACE_WRITE,
        workspace_root=workspace_root,
        allow_patch_apply=True,
    )


def proposal_git_permissions(workspace_root: Path) -> Permissions:
    from realforge.permissions import PermissionMode

    return Permissions(
        mode=PermissionMode.WORKSPACE_WRITE,
        workspace_root=workspace_root,
        allow_proposal_git_writes=True,
    )
