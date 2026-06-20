from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RealForgeConfig:
    realc_command: tuple[str, ...]
    backup_suffix: str = ".bak"


def default_config() -> RealForgeConfig:
    realc = shutil.which("realc")
    if realc:
        return RealForgeConfig(realc_command=(realc,))
    return RealForgeConfig(realc_command=("python", "-m", "reallang.cli"))
