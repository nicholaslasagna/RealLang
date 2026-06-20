import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.eval_report import eval_report_path, evals_dir, load_eval_report
from realforge.eval_runner import EvalError, run_eval, show_eval
from realforge.eval_safety import find_unsafe_commands, is_unsafe_command_text
from realforge.providers.mock import MockProvider
from realforge.research.fetcher import RESEARCH_UNTRUSTED_BOUNDARY

ROOT = Path(__file__).resolve().parents[1]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _workspace(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    (root / "examples").mkdir()
    (root / "examples" / "hello.real").write_text(
        "module main;\nfn main() -> i32 { return 0; }\n",
        encoding="utf-8",
    )
    (root / "docs").mkdir()
    (root / "docs" / "realforge.md").write_text("# RealForge\n", encoding="utf-8")
    (root / "docs" / "project-status.md").write_text("# Status\n", encoding="utf-8")
    (root / "tests").mkdir()
    (root / "tests" / "test_example.py").write_text("def test_ok():\n    assert True\n", encoding="utf-8")
    return root


def _config(root: Path) -> RealForgeConfig:
    return RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)


def test_eval_smoke_passes_with_mock_provider(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_eval(
        provider=MockProvider(_config(root)),
        suite="smoke",
        workspace_root=root,
        config=_config(root),
    )
    assert outcome.ok is True
    assert outcome.report.passed is True
    assert outcome.report.suite == "smoke"
    assert len(outcome.report.tasks) == 3


def test_eval_planning_produces_report(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_eval(
        provider=MockProvider(_config(root)),
        suite="planning",
        workspace_root=root,
        config=_config(root),
    )
    assert outcome.report.suite == "planning"
    assert len(outcome.report.tasks) == 3
    assert outcome.report.total_score > 0
    assert "planning_explain_hello" in outcome.report.scores


def test_safety_suite_includes_adversarial_research_boundary(tmp_path: Path):
    root = _workspace(tmp_path)
    provider = MockProvider(_config(root))
    outcome = run_eval(
        provider=provider,
        suite="safety",
        workspace_root=root,
        config=_config(root),
    )
    assert provider.last_plan_request is not None
    context = provider.last_plan_request.context or ""
    assert RESEARCH_UNTRUSTED_BOUNDARY in context
    assert "rm -rf" in context
    assert outcome.report.tasks[0].unsafe_commands_suggested == ()


def test_unsafe_command_suggestions_are_detected():
    unsafe = find_unsafe_commands(("rm -rf /", "realforge check examples/hello.real"))
    assert unsafe == ("rm -rf /",)
    assert is_unsafe_command_text("sudo apt install evil")


def test_generation_suite_checks_mock_output_with_realc(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_eval(
        provider=MockProvider(_config(root)),
        suite="generation",
        workspace_root=root,
        config=_config(root),
    )
    assert outcome.ok is True
    for task in outcome.report.tasks:
        assert task.generated_source_check_result == "pass"


def test_eval_write_stores_report_under_realforge_evals(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_eval(
        provider=MockProvider(_config(root)),
        suite="smoke",
        workspace_root=root,
        config=_config(root),
        write=True,
    )
    path = eval_report_path(root, outcome.report.id)
    assert path.is_file()
    assert path.resolve().is_relative_to(evals_dir(root).resolve())
    loaded = load_eval_report(root, outcome.report.id)
    assert loaded.id == outcome.report.id
    assert loaded.provider == "mock"


def test_eval_list_and_show(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_eval(
        provider=MockProvider(_config(root)),
        suite="smoke",
        workspace_root=root,
        config=_config(root),
        write=True,
    )
    listed = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "eval-list"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert listed.returncode == 0, listed.stderr
    assert outcome.report.id in listed.stdout

    shown = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "eval-show", outcome.report.id],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert shown.returncode == 0, shown.stderr
    assert "Eval report" in shown.stdout or "eval report" in shown.stdout.lower()


def test_eval_does_not_modify_main_workspace_files(tmp_path: Path):
    root = _workspace(tmp_path)
    target = root / "examples" / "hello.real"
    before = target.read_text(encoding="utf-8")
    before_mtimes = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}

    run_eval(
        provider=MockProvider(_config(root)),
        suite="all",
        workspace_root=root,
        config=_config(root),
    )

    assert target.read_text(encoding="utf-8") == before
    after_mtimes = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}
    for path, mtime in before_mtimes.items():
        if ".realforge" in path.as_posix():
            continue
        assert after_mtimes.get(path) == mtime


def test_eval_cli_smoke(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "eval",
            "--provider",
            "mock",
            "--suite",
            "smoke",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "eval report" in proc.stdout.lower()
    assert "not a superiority benchmark" in proc.stdout.lower()


def test_unknown_suite_raises(tmp_path: Path):
    root = _workspace(tmp_path)
    with pytest.raises(EvalError):
        run_eval(
            provider=MockProvider(_config(root)),
            suite="unknown",
            workspace_root=root,
            config=_config(root),
        )


def test_eval_report_json_shape_on_write(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_eval(
        provider=MockProvider(_config(root)),
        suite="smoke",
        workspace_root=root,
        config=_config(root),
        write=True,
    )
    payload = json.loads(eval_report_path(root, outcome.report.id).read_text(encoding="utf-8"))
    assert payload["provider"] == "mock"
    assert "tasks" in payload
    assert "model_metadata" in payload
    assert payload["tasks"][0]["task_id"]
