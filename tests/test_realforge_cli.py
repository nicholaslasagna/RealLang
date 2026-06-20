import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def test_realforge_check_hello():
    hello = ROOT / "examples" / "hello.real"
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "check", str(hello)],
        capture_output=True,
        text=True,
        env=_env(),
    )
    assert proc.returncode == 0, proc.stderr + proc.stdout
    assert "PASS" in proc.stdout


def test_realforge_check_bad(tmp_path: Path):
    bad = tmp_path / "bad.real"
    bad.write_text(
        """module main;
fn main() -> i32 {
  let x: i32 = 1;
  set x = 2;
  return 0;
}
""",
        encoding="utf-8",
    )
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "check", str(bad)],
        capture_output=True,
        text=True,
        env=_env(),
    )
    assert proc.returncode == 1
    assert "E203" in proc.stderr


def test_realforge_repair_dry_run(tmp_path: Path):
    bad = tmp_path / "bad.real"
    original = """module main;
fn main() -> i32 {
  let x: i32 = 1;
  set x = 2;
  return 0;
}
"""
    bad.write_text(original, encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "repair", str(bad), "--dry-run"],
        capture_output=True,
        text=True,
        env=_env(),
    )
    assert proc.returncode == 1
    assert "var x: i32" in proc.stdout
    assert bad.read_text(encoding="utf-8") == original


def test_realforge_ask_mock():
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "ask",
            "--provider",
            "mock",
            "--task",
            "inspect hello.real",
        ],
        capture_output=True,
        text=True,
        env=_env(),
    )
    assert proc.returncode == 0, proc.stderr
    assert "Task: inspect hello.real" in proc.stdout
    assert "realc --check" in proc.stdout


def test_realforge_doctor():
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "doctor"],
        capture_output=True,
        text=True,
        env=_env(),
    )
    assert proc.returncode == 0, proc.stderr
    assert "overall: PASS" in proc.stdout
