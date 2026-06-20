import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.index.context_builder import build_context
from realforge.index.file_index import (
    default_cache_path,
    scan_workspace,
    should_ignore_path,
    write_index_cache,
)
from realforge.index.symbols import extract_file_symbols
from realforge.permissions import PermissionMode, Permissions
from realforge.workspace import WorkspaceError

ROOT = Path(__file__).resolve().parents[1]


def _relative_posix(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _make_workspace(tmp_path: Path) -> Path:
    (tmp_path / "examples").mkdir()
    (tmp_path / "examples" / "hello.real").write_text(
        "module main;\nfn main() -> i32 { return 0; }\n",
        encoding="utf-8",
    )
    (tmp_path / "README.md").write_text("# Temp workspace\n", encoding="utf-8")
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "project-status.md").write_text("# Status\n", encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_x.py").write_text("def test_x(): pass\n", encoding="utf-8")
    (tmp_path / "benchmarks").mkdir()
    (tmp_path / "benchmarks" / "README.md").write_text("# Bench\n", encoding="utf-8")
    (tmp_path / "benchmarks" / "build").mkdir()
    (tmp_path / "benchmarks" / "build" / "artifact.o").write_text("", encoding="utf-8")
    (tmp_path / "benchmarks" / "results").mkdir()
    (tmp_path / "benchmarks" / "results" / "results.json").write_text("{}", encoding="utf-8")
    (tmp_path / "llm_study" / "results").mkdir(parents=True)
    (tmp_path / "llm_study" / "results" / "run.json").write_text("{}", encoding="utf-8")
    (tmp_path / ".venv").mkdir()
    (tmp_path / ".venv" / "bin").mkdir()
    (tmp_path / ".venv" / "bin" / "python").write_text("", encoding="utf-8")
    (tmp_path / "__pycache__").mkdir()
    (tmp_path / "__pycache__" / "mod.pyc").write_text("", encoding="utf-8")
    return tmp_path


def test_should_ignore_generated_and_cache_paths(tmp_path: Path):
    root = _make_workspace(tmp_path)
    assert should_ignore_path(root / ".venv" / "bin" / "python", root)
    assert should_ignore_path(root / "__pycache__" / "mod.pyc", root)
    assert should_ignore_path(root / "benchmarks" / "build" / "artifact.o", root)
    assert should_ignore_path(root / "benchmarks" / "results" / "results.json", root)
    assert should_ignore_path(root / "llm_study" / "results" / "run.json", root)


def test_scan_workspace_lists_expected_categories(tmp_path: Path):
    root = _make_workspace(tmp_path)
    index = scan_workspace(root)
    rel_real = {p.name for p in index.real_files}
    rel_docs = {_relative_posix(p, root) for p in index.docs}
    rel_tests = {p.name for p in index.tests}
    rel_benchmarks = {_relative_posix(p, root) for p in index.benchmarks}

    assert "hello.real" in rel_real
    assert "README.md" in rel_docs
    assert "docs/project-status.md" in rel_docs
    assert "test_x.py" in rel_tests
    assert "benchmarks/README.md" in rel_benchmarks
    assert not any("benchmarks/build" in p.as_posix() for p in index.benchmarks)
    assert not any(".venv" in p.as_posix() for p in index.real_files)


def test_index_command_print_only_does_not_write(tmp_path: Path):
    root = _make_workspace(tmp_path)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "index"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "hello.real" in proc.stdout
    assert not default_cache_path(root).exists()


def test_index_command_write_creates_cache_inside_workspace(tmp_path: Path):
    root = _make_workspace(tmp_path)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "index", "--write"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    cache = default_cache_path(root)
    assert cache.is_file()
    payload = json.loads(cache.read_text(encoding="utf-8"))
    assert "examples/hello.real" in payload["real_files"]


def test_index_cache_write_refuses_outside_workspace(tmp_path: Path):
    root = _make_workspace(tmp_path)
    index = scan_workspace(root)
    outside = tmp_path.parent / "outside-index.json"
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=root)
    with pytest.raises(WorkspaceError):
        write_index_cache(index, cache_path=outside, permissions=perms)


def test_symbols_extract_module_function_and_bindings():
    source = """module main;
fn add(a: i32, b: i32) -> i32 {
  return a + b;
}
fn main() -> i32 {
  let x: i32 = 1;
  var y: i32 = 2;
  return x;
}
"""
    symbols = extract_file_symbols(Path("add.real"), source)
    assert symbols.module == "main"
    assert [fn.name for fn in symbols.functions] == ["add", "main"]
    assert symbols.functions[0].parameters == (("a", "i32"), ("b", "i32"))
    assert symbols.functions[0].return_type == "i32"
    assert ("let", "x", "i32") in {(b.kind, b.name, b.type_name) for b in symbols.bindings}


def test_symbols_command_runs_in_temp_workspace(tmp_path: Path):
    root = _make_workspace(tmp_path)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "symbols"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "module: main" in proc.stdout
    assert "fn main()" in proc.stdout


def test_context_includes_readme_and_docs(tmp_path: Path):
    root = _make_workspace(tmp_path)
    bundle = build_context("explain hello.real", root, max_chars=4000)
    assert "## Project Documentation" in bundle.text
    assert "### README.md" in bundle.text
    assert "### docs/project-status.md" in bundle.text
    assert "### examples/hello.real" in bundle.text
    assert "## Safety Rules" in bundle.text


def test_context_respects_max_chars(tmp_path: Path):
    root = _make_workspace(tmp_path)
    bundle = build_context("explain hello.real", root, max_chars=200)
    assert len(bundle.text) <= 200
    assert bundle.truncated


def test_context_command_runs(tmp_path: Path):
    root = _make_workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "context",
            "--task",
            "explain hello.real",
            "--max-chars",
            "4000",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "# RealForge Context Bundle" in proc.stdout
    assert "hello.real" in proc.stdout
