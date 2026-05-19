import subprocess
from pathlib import Path

import pytest

from reallang.cli import main as realc_main

EXAMPLES = [
    "hello.real",
    "add.real",
    "looptest.real",
    "condition.real",
]


@pytest.mark.parametrize("name", EXAMPLES)
def test_example_emits_warning_free_c(name: str, tmp_path: Path):
    root = Path(__file__).resolve().parents[1]
    src = root / "examples" / name
    assert realc_main([str(src), "--emit-c", "-o", str(tmp_path / f"{name}.c")]) == 0
    out = tmp_path / f"{name}.c"
    binary = tmp_path / name.replace(".real", "")
    subprocess.run(
        ["cc", "-std=c11", "-Wall", "-Wextra", "-o", str(binary), str(out)],
        check=True,
        capture_output=True,
        text=True,
    )
    assert subprocess.run([str(binary)], capture_output=True, text=True).returncode == 0
