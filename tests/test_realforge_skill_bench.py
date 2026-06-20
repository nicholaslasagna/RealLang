from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from realforge import __version__
from realforge.config import RealForgeConfig
from realforge.multimodal.mock import MockMultimodalProvider
from realforge.planner import AgentPlan, mock_plan_for_task
from realforge.providers.base import ModelProvider, PlanRequest
from realforge.providers.mock import MockProvider
from realforge.skill_bench_report import (
    SKILL_DOMAINS,
    load_skill_benchmark_report,
    skill_benchmark_report_path,
    skill_benchmarks_dir,
)
from realforge.skill_bench_runner import (
    SkillBenchError,
    list_skill_bench,
    run_skill_bench,
    show_skill_bench,
)

ROOT = Path(__file__).resolve().parents[1]


def _env() -> dict[str, str]:
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
    (root / "README.md").write_text("# Repo\n", encoding="utf-8")
    return root


def _config(root: Path) -> RealForgeConfig:
    return RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=root,
    )


def _run(root: Path, suite: str, *, provider: ModelProvider | None = None, write: bool = False):
    return run_skill_bench(
        provider=provider or MockProvider(_config(root)),
        multimodal_provider=MockMultimodalProvider(),
        suite=suite,
        workspace_root=root,
        config=_config(root),
        write=write,
    )


class UnsafeSkillProvider(MockProvider):
    """Fake provider that injects unsafe behavior into actionable plan fields."""

    def generate_plan(self, request: PlanRequest) -> AgentPlan:
        plan = mock_plan_for_task(request.task, context=request.context)
        lowered = request.task.lower()
        if "rm -rf" in lowered or "disable all realforge safety" in lowered:
            return replace(plan, commands_to_run=plan.commands_to_run + ("rm -rf /",))
        if "auto-apply" in lowered or "without human confirm" in lowered:
            return replace(plan, summary="Auto-apply pending proposals without human confirm")
        if ".git/config" in lowered:
            return replace(
                plan,
                files_to_modify=plan.files_to_modify + (".git/config", "../outside.secret"),
                requires_write_permission=True,
            )
        return plan


def test_skill_bench_smoke_passes_with_mock_provider(tmp_path: Path):
    outcome = _run(_workspace(tmp_path), "smoke")
    assert outcome.ok is True
    assert outcome.report.passed is True
    assert outcome.report.suite == "smoke"
    assert outcome.report.realforge_version == __version__
    assert outcome.report.task_results
    # smoke samples several distinct domains
    assert len({task.domain for task in outcome.report.task_results}) >= 4


def test_skill_bench_all_passes_with_mock_and_covers_every_domain(tmp_path: Path):
    outcome = _run(_workspace(tmp_path), "all")
    assert outcome.ok is True
    assert outcome.report.passed is True
    covered = {task.domain for task in outcome.report.task_results}
    assert covered == set(SKILL_DOMAINS)
    assert set(outcome.report.domain_scores) == set(SKILL_DOMAINS)
    assert 0.0 <= outcome.report.normalized_score <= 1.0


@pytest.mark.parametrize("suite", ["creative", "engine", "image", "vision", "asset", "code"])
def test_representative_suites_run_with_mock(tmp_path: Path, suite: str):
    outcome = _run(_workspace(tmp_path), suite)
    assert outcome.ok is True
    assert outcome.report.suite == suite
    assert outcome.report.task_results
    for task in outcome.report.task_results:
        assert task.domain == suite
        assert task.task_id
        assert task.checks
        assert task.suite == suite
    assert suite in outcome.report.domain_scores


def test_all_report_fields_present_and_populated(tmp_path: Path):
    outcome = _run(_workspace(tmp_path), "smoke", write=True)
    report = outcome.report
    for field in (
        "id",
        "created_at",
        "realforge_version",
        "provider",
        "suite",
        "task_results",
        "total_score",
        "normalized_score",
        "passed",
        "safety_failures",
        "domain_scores",
        "duration_ms",
        "notes",
    ):
        assert hasattr(report, field)
    assert report.provider_model  # optional field, but the mock multimodal provider sets one
    assert report.domain_scores
    first = report.task_results[0]
    for field in (
        "task_id",
        "suite",
        "domain",
        "prompt",
        "expected_behavior",
        "output_summary",
        "schema_valid",
        "checks",
        "score",
        "max_score",
        "safety_flags",
        "artifacts_created",
        "notes",
    ):
        assert hasattr(first, field)


def test_write_stores_report_under_skill_benchmarks(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = _run(root, "smoke", write=True)
    path = skill_benchmark_report_path(root, outcome.report.id)
    assert path.is_file()
    assert path.resolve().is_relative_to(skill_benchmarks_dir(root).resolve())
    loaded = load_skill_benchmark_report(root, outcome.report.id)
    assert loaded.realforge_version == __version__
    assert loaded.domain_scores == outcome.report.domain_scores


def test_no_write_does_not_create_storage(tmp_path: Path):
    root = _workspace(tmp_path)
    _run(root, "smoke", write=False)
    assert not skill_benchmarks_dir(root).exists()


def test_list_and_show_work(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = _run(root, "smoke", write=True)
    listed = list_skill_bench(root)
    assert outcome.report.id in listed
    shown = show_skill_bench(root, outcome.report.id)
    assert outcome.report.realforge_version in shown
    assert "skill benchmark report" in shown.lower()


def test_safety_suite_passes_with_safe_mock(tmp_path: Path):
    outcome = _run(_workspace(tmp_path), "safety")
    assert outcome.ok is True
    assert outcome.report.safety_failures == ()


def test_safety_suite_detects_unsafe_fake_provider(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_skill_bench(
        provider=UnsafeSkillProvider(_config(root)),
        multimodal_provider=MockMultimodalProvider(),
        suite="safety",
        workspace_root=root,
        config=_config(root),
    )
    assert outcome.ok is False
    assert outcome.report.passed is False
    assert outcome.report.safety_failures
    flagged = [task for task in outcome.report.task_results if task.safety_flags]
    assert len(flagged) >= 3


def test_vision_is_high_but_not_perfect_for_mock(tmp_path: Path):
    # The mock performs no semantic analysis, so vision is honestly penalized
    # while still passing — demonstrating "high but not necessarily perfect".
    outcome = _run(_workspace(tmp_path), "vision")
    assert outcome.ok is True
    assert 0.6 <= outcome.report.domain_scores["vision"] < 1.0


def test_skill_bench_does_not_modify_main_workspace_files(tmp_path: Path):
    root = _workspace(tmp_path)
    target = root / "examples" / "hello.real"
    before = target.read_text(encoding="utf-8")
    before_mtimes = {p: p.stat().st_mtime_ns for p in root.rglob("*") if p.is_file()}

    _run(root, "all")

    assert target.read_text(encoding="utf-8") == before
    after_mtimes = {p: p.stat().st_mtime_ns for p in root.rglob("*") if p.is_file()}
    for path, mtime in before_mtimes.items():
        if ".realforge" in path.as_posix():
            continue
        assert after_mtimes.get(path) == mtime
    # no provider artifacts (creative/image/pipeline dirs) leaked into the workspace
    assert not (root / ".realforge" / "creative").exists()
    assert not (root / ".realforge" / "multimodal").exists()
    assert not (root / ".realforge" / "pipelines").exists()


def test_unknown_suite_raises(tmp_path: Path):
    root = _workspace(tmp_path)
    with pytest.raises(SkillBenchError):
        _run(root, "does-not-exist")


def test_report_json_shape_on_write(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = _run(root, "all", write=True)
    payload = json.loads(
        skill_benchmark_report_path(root, outcome.report.id).read_text(encoding="utf-8")
    )
    assert payload["realforge_version"] == __version__
    assert payload["domain_scores"]
    assert payload["task_results"][0]["checks"]
    assert "artifacts_created" in payload["task_results"][0]


def test_skill_bench_cli_smoke(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "skill-bench",
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
    assert "skill benchmark report" in proc.stdout.lower()
    assert __version__ in proc.stdout
