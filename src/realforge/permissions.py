from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class PermissionMode(str, Enum):
    READONLY = "readonly"
    ASK = "ask"
    WORKSPACE_WRITE = "workspace-write"


class PermissionError(Exception):
    pass


@dataclass(frozen=True)
class Permissions:
    mode: PermissionMode = PermissionMode.READONLY
    workspace_root: Path | None = None

    def can_run_shell(self, cmd: tuple[str, ...]) -> bool:
        if self.mode == PermissionMode.WORKSPACE_WRITE:
            return True
        if self.mode == PermissionMode.ASK:
            return False
        return _is_realc_check(cmd)

    def can_write_file(self, path: Path) -> bool:
        if self.mode != PermissionMode.WORKSPACE_WRITE:
            return False
        if self.workspace_root is None:
            return True
        try:
            path.resolve().relative_to(self.workspace_root.resolve())
        except ValueError:
            return False
        return True


def _is_realc_check(cmd: tuple[str, ...]) -> bool:
    if not cmd:
        return False
    if cmd[-1] != "--check":
        return False
    if len(cmd) >= 2 and cmd[-2].endswith(".real"):
        return True
    return "--check" in cmd and any("realc" in part or "reallang.cli" in part for part in cmd)
