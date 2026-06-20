from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from realforge.permissions import PermissionMode


@dataclass(frozen=True)
class RealForgeConfig:
    realc_command: tuple[str, ...]
    backup_suffix: str = ".bak"
    permission_mode: PermissionMode = PermissionMode.READONLY
    workspace_root: Path | None = None
    ollama_base_url: str | None = None
    openai_compatible_base_url: str | None = None


def default_config(workspace_root: Path | None = None) -> RealForgeConfig:
    realc = shutil.which("realc")
    if realc:
        cmd: tuple[str, ...] = (realc,)
    else:
        cmd = (sys.executable, "-m", "reallang.cli")

    root = workspace_root or Path.cwd()
    return RealForgeConfig(
        realc_command=cmd,
        workspace_root=root,
        ollama_base_url=os.environ.get("REALFORGE_OLLAMA_URL"),
        openai_compatible_base_url=os.environ.get("REALFORGE_OPENAI_COMPAT_URL"),
    )
