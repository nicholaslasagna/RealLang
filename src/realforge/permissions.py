from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path

class PermissionMode(str, Enum):
    READONLY = "readonly"
    MANUAL = "manual"
    WORKSPACE_WRITE = "workspace-write"

    @classmethod
    def _missing_(cls, value: object) -> PermissionMode | None:
        if value == "ask":
            return cls.MANUAL
        return None


class PermissionError(Exception):
    pass


@dataclass(frozen=True)
class Permissions:
    mode: PermissionMode = PermissionMode.READONLY
    workspace_root: Path | None = None
    allow_git_worktree_admin: bool = False
    allow_validation_commands: bool = False
    allow_patch_apply: bool = False
    allow_proposal_git_writes: bool = False

    def can_run_shell(self, cmd: tuple[str, ...], *, config=None) -> bool:
        from realforge.command_policy import evaluate_shell_command

        return evaluate_shell_command(cmd, permissions=self, config=config).allowed

    def can_write_file(self, path: Path) -> bool:
        if self.mode != PermissionMode.WORKSPACE_WRITE:
            return False
        if self.workspace_root is None:
            return False
        try:
            path.resolve().relative_to(self.workspace_root.resolve())
        except ValueError:
            return False
        return True
