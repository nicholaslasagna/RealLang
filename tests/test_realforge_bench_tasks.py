import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge import __version__
from realforge.config import RealForgeConfig
from realforge.bench_report import benchmark_report_path, load_benchmark_report, task_benchmarks_dir
from realforge.bench_runner import BenchError, run_bench_tasks, show_bench_task
from realforge.planner import AgentPlan, mock_plan_for_task
from realforge.providers.base import ModelProvider, PlanRequest
from realforge.providers.mock import MockProvider

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


class UnsafeBenchProvider(MockProvider):
    def generate_plan(self, request: PlanRequest) -> AgentPlan:
        plan = mock_plan_for_task(request.task, context=request.context)
        lowered = request.task.lower()
        if "rm -rf" in lowered or "disable all realforge safety" in lowered:
            return AgentPlan(
                task=plan.task,
                summary=plan.summary,
                steps=plan.steps,
                files_to_inspect=plan.files_to_inspect,
                files_to_modify=plan.files_to_modify,
                commands_to_run=plan.commands_to_run + ("rm -rf /",),
                risks=plan.risks,
                requires_write_permission=plan.requires_write_permission,
                used_context=plan.used_context,
            )
        if "auto-apply" in lowered or "without human confirm" in lowered:
            return AgentPlan(
                task=plan.task,
                summary="Auto-apply pending proposals without confirm",
                steps=plan.steps,
                files_to_inspect=plan.files_to_inspect,
                files_to_modify=plan.files_to_modify,
                commands_to_run=plan.commands_to_run,
                risks=(),
                requires_write_permission=False,
                used_context=plan.used_context,
            )
        if ".git/config" in lowered:
            return AgentPlan(
                task=plan.task,
                summary=plan.summary,
                steps=plan.steps,
                files_to_inspect=plan.files_to_inspect + (".git/config",),
                files_to_modify=(".git/config", "../outside.secret"),
                commands_to_run=plan.commands_to_run,
                risks=plan.risks,
                requires_write_permission=True,
                used_context=plan.used_context,
            )
        return plan


def test_bench_tasks_smoke_passes_with_mock_provider(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_bench_tasks(
        provider=MockProvider(_config(root)),
        suite="smoke",
        workspace_root=root,
        config=_config(root),
    )
    assert outcome.ok is True
    assert outcome.report.passed is True
    assert outcome.report.suite == "smoke"
    assert len(outcome.report.task_results) == 4
    assert outcome.report.realforge_version == __version__


def test_planning_suite_produces_report_with_valid_fields(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_bench_tasks(
        provider=MockProvider(_config(root)),
        suite="planning",
        workspace_root=root,
        config=_config(root),
    )
    assert len(outcome.report.task_results) == 4
    assert outcome.report.total_score > 0
    assert 0.0 <= outcome.report.normalized_score <= 1.0
    first = outcome.report.task_results[0]
    assert first.task_id
    assert first.suite == "planning"
    assert first.checks


def test_generation_suite_validates_mock_output_with_realc_in_temp_dirs(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_bench_tasks(
        provider=MockProvider(_config(root)),
        suite="generation",
        workspace_root=root,
        config=_config(root),
    )
    assert outcome.ok is True
    for task in outcome.report.task_results:
        assert task.generated_source_check_result == "pass"
    assert outcome.report.generated_artifacts_count == 4


def test_safety_suite_detects_unsafe_behavior_with_fake_provider(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_bench_tasks(
        provider=UnsafeBenchProvider(_config(root)),
        suite="safety",
        workspace_root=root,
        config=_config(root),
    )
    assert outcome.ok is False
    assert outcome.report.safety_failures
    unsafe_tasks = [task for task in outcome.report.task_results if task.safety_flags]
    assert unsafe_tasks


def test_self_improve_suite_checks_improvement_plan_schema(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_bench_tasks(
        provider=MockProvider(_config(root)),
        suite="self-improve",
        workspace_root=root,
        config=_config(root),
    )
    assert outcome.ok is True
    for task in outcome.report.task_results:
        assert task.schema_valid is True
        assert task.checks.get("requires_human_approval") is True
        assert task.checks.get("allowlisted_validation_commands") is True


def test_bench_write_stores_report_under_task_benchmarks(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_bench_tasks(
        provider=MockProvider(_config(root)),
        suite="smoke",
        workspace_root=root,
        config=_config(root),
        write=True,
    )
    path = benchmark_report_path(root, outcome.report.id)
    assert path.is_file()
    assert path.resolve().is_relative_to(task_benchmarks_dir(root).resolve())
    loaded = load_benchmark_report(root, outcome.report.id)
    assert loaded.realforge_version == __version__


def test_bench_tasks_do_not_modify_main_workspace_files(tmp_path: Path):
    root = _workspace(tmp_path)
    target = root / "examples" / "hello.real"
    before = target.read_text(encoding="utf-8")
    before_mtimes = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}

    run_bench_tasks(
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


def test_bench_task_list_and_show(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_bench_tasks(
        provider=MockProvider(_config(root)),
        suite="smoke",
        workspace_root=root,
        config=_config(root),
        write=True,
    )
    from realforge.bench_runner import list_bench_tasks

    listed = list_bench_tasks(root)
    assert outcome.report.id in listed
    shown = show_bench_task(root, outcome.report.id)
    assert outcome.report.realforge_version in shown


def test_bench_cli_smoke(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "bench-tasks",
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
    assert "task benchmark report" in proc.stdout.lower()
    assert __version__ in proc.stdout


def test_unknown_bench_suite_raises(tmp_path: Path):
    root = _workspace(tmp_path)
    with pytest.raises(BenchError):
        run_bench_tasks(
            provider=MockProvider(_config(root)),
            suite="unknown",
            workspace_root=root,
            config=_config(root),
        )


def test_bench_report_json_shape_on_write(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_bench_tasks(
        provider=MockProvider(_config(root)),
        suite="smoke",
        workspace_root=root,
        config=_config(root),
        write=True,
    )
    payload = json.loads(benchmark_report_path(root, outcome.report.id).read_text(encoding="utf-8"))
    assert payload["realforge_version"] == __version__
    assert payload["task_results"][0]["checks"]
