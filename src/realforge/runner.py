from __future__ import annotations

import re
import subprocess
import os
from dataclasses import dataclass
from pathlib import Path

from realforge.config import RealForgeConfig, default_config
from realforge.permissions import PermissionError, PermissionMode, Permissions

BLOCKED_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\brm\s+-rf\b"),
    re.compile(r"\brm\s+-r\b"),
    re.compile(r"\bsudo\b"),
    re.compile(r"\bmkfs\b"),
    re.compile(r"\bdd\s+if="),
    re.compile(r"\bshutdown\b"),
    re.compile(r"\breboot\b"),
)


class CommandBlockedError(Exception):
    pass


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str
    cmd: tuple[str, ...]


RealcResult = CommandResult


def _assert_not_destructive(cmd: tuple[str, ...]) -> None:
    joined = " ".join(cmd)
    for pattern in BLOCKED_PATTERNS:
        if pattern.search(joined):
            raise CommandBlockedError(f"destructive command blocked: {joined}")


def run_command(
    cmd: tuple[str, ...],
    *,
    config: RealForgeConfig | None = None,
    permissions: Permissions | None = None,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> CommandResult:
    cfg = config or default_config()
    perms = permissions or Permissions(mode=cfg.permission_mode, workspace_root=cfg.workspace_root)
    _assert_not_destructive(cmd)
    if not perms.can_run_shell(cmd):
        raise PermissionError(f"shell command not permitted in {perms.mode.value} mode: {' '.join(cmd)}")
    proc_env = {**os.environ, **env} if env else None
    proc = subprocess.run(
        list(cmd),
        capture_output=True,
        text=True,
        cwd=str(cwd) if cwd else None,
        env=proc_env,
    )
    return CommandResult(proc.returncode, proc.stdout, proc.stderr, cmd)


def run_realc_check(path: Path, config: RealForgeConfig | None = None) -> CommandResult:
    cfg = config or default_config()
    perms = Permissions(mode=PermissionMode.READONLY, workspace_root=cfg.workspace_root)
    cmd = (*cfg.realc_command, str(path), "--check")
    return run_command(cmd, config=cfg, permissions=perms)
