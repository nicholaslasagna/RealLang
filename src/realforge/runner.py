from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from realforge.command_policy import CommandDisposition, evaluate_shell_command
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

SENSITIVE_ENV_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r".*_TOKEN$", re.IGNORECASE),
    re.compile(r".*_SECRET$", re.IGNORECASE),
    re.compile(r".*_KEY$", re.IGNORECASE),
    re.compile(r"^AWS_", re.IGNORECASE),
    re.compile(r"^GITHUB_TOKEN$", re.IGNORECASE),
    re.compile(r"^OPENAI_API_KEY$", re.IGNORECASE),
    re.compile(r"^ANTHROPIC_API_KEY$", re.IGNORECASE),
)


class CommandBlockedError(Exception):
    pass


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str
    cmd: tuple[str, ...]
    ran: bool = True
    allowed_by_policy: bool = True
    disposition: CommandDisposition = CommandDisposition.RAN
    policy_reason: str = ""


RealcResult = CommandResult


def is_sensitive_env_var(name: str) -> bool:
    return any(pattern.search(name) for pattern in SENSITIVE_ENV_PATTERNS)


def build_subprocess_env(
    *,
    sanitize: bool = False,
    extra: dict[str, str] | None = None,
) -> dict[str, str] | None:
    base: dict[str, str] = dict(os.environ)
    if sanitize:
        base = {key: value for key, value in base.items() if not is_sensitive_env_var(key)}
    if extra:
        base.update(extra)
        return base
    if sanitize:
        return base
    return None


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
    sanitize_env: bool = False,
) -> CommandResult:
    cfg = config or default_config()
    perms = permissions or Permissions(mode=cfg.permission_mode, workspace_root=cfg.workspace_root)
    _assert_not_destructive(cmd)
    policy = evaluate_shell_command(cmd, permissions=perms, config=cfg)
    if not policy.allowed:
        raise PermissionError(
            f"shell command not permitted ({policy.disposition.value}): {' '.join(cmd)} ({policy.reason})"
        )
    proc_env = build_subprocess_env(sanitize=sanitize_env, extra=env)
    proc = subprocess.run(
        list(cmd),
        capture_output=True,
        text=True,
        cwd=str(cwd) if cwd else None,
        env=proc_env,
    )
    return CommandResult(
        proc.returncode,
        proc.stdout,
        proc.stderr,
        cmd,
        ran=True,
        allowed_by_policy=True,
        disposition=CommandDisposition.RAN,
        policy_reason=policy.reason,
    )


def run_validation_command(
    cmd: tuple[str, ...],
    *,
    config: RealForgeConfig | None = None,
    permissions: Permissions,
    cwd: Path | None = None,
) -> CommandResult:
    return run_command(
        cmd,
        config=config,
        permissions=permissions,
        cwd=cwd,
        sanitize_env=True,
    )


def run_realc_check(path: Path, config: RealForgeConfig | None = None) -> CommandResult:
    cfg = config or default_config()
    perms = Permissions(mode=PermissionMode.READONLY, workspace_root=cfg.workspace_root)
    cmd = (*cfg.realc_command, str(path), "--check")
    return run_command(cmd, config=cfg, permissions=perms)
