from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from realforge.config import RealForgeConfig, default_config


@dataclass(frozen=True)
class RealcResult:
    returncode: int
    stdout: str
    stderr: str


def run_realc_check(path: Path, config: RealForgeConfig | None = None) -> RealcResult:
    cfg = config or default_config()
    cmd = [*cfg.realc_command, str(path), "--check"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return RealcResult(proc.returncode, proc.stdout, proc.stderr)
