import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

EXAMPLES = [
    ROOT / "examples" / "hello.real",
    ROOT / "examples" / "add.real",
    ROOT / "examples" / "looptest.real",
    ROOT / "examples" / "condition.real",
]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


@pytest.mark.parametrize("example", EXAMPLES, ids=lambda p: p.name)
def test_realforge_check_example_passes(example: Path):
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "check", str(example)],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(ROOT),
    )
    assert proc.returncode == 0, proc.stderr + proc.stdout
    assert "PASS" in proc.stdout
