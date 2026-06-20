import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.bench_report import BenchmarkReport, write_benchmark_report, utc_now_iso as bench_now
from realforge.config import load_config
from realforge.scheduler import (
    SchedulerError,
    format_scheduler_status,
    list_scheduler,
    run_scheduler,
    show_scheduler_run,
)
from realforge.scheduler_report import scheduler_run_path, scheduler_runs_dir
from realforge.staff import StaffError
from realforge.proposals import list_proposals

ROOT = Path(__file__).resolve().parents[1]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _git_env():
    env = _env()
    env["GIT_AUTHOR_NAME"] = "RealForge Test"
    env["GIT_AUTHOR_EMAIL"] = "test@example.com"
    env["GIT_COMMITTER_NAME"] = "RealForge Test"
    env["GIT_COMMITTER_EMAIL"] = "test@example.com"
    return env


def _workspace(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    (root / "tests").mkdir()
    (root / "tests" / "test_example.py").write_text(
        "def test_ok():\n    assert True\n",
        encoding="utf-8",
    )
    (root / "examples").mkdir()
    (root / "examples" / "hello.real").write_text(
        "module main;\nfn main() -> i32 { return 0; }\n",
        encoding="utf-8",
    )
    (root / "docs").mkdir()
    (root / "docs" / "project-status.md").write_text("# Status\n", encoding="utf-8")
    return root


def _write_config(
    root: Path,
    *,
    staff_enabled: bool = True,
    scheduler_enabled: bool = False,
    **scheduler_overrides,
) -> None:
    scheduler_defaults = {
        "enabled": scheduler_enabled,
        "mode": "manual",
        "max_runs_per_invocation": 1,
        "areas": ["tests"],
        "provider": "mock",
        "require_leaderboard_pass": False,
        "minimum_benchmark_score": 0.75,
        "create_update_bundle": True,
        "auto_apply": False,
        "auto_commit": False,
    }
    scheduler_defaults.update(scheduler_overrides)
    lines = ["[staff]", f"enabled = {str(staff_enabled).lower()}", "", "[improvement]"]
    lines.extend(
        [
            "channel = \"stable\"",
            "max_budget = 1",
            "require_eval_pass = false",
            "minimum_eval_score = 0.75",
            "allow_research = false",
            "allow_patch_proposals = true",
            "auto_apply = false",
            "auto_commit = false",
            "",
            "[scheduler]",
        ]
    )
    for key, value in scheduler_defaults.items():
        if isinstance(value, bool):
            lines.append(f"{key} = {str(value).lower()}")
        elif isinstance(value, str):
            lines.append(f'{key} = "{value}"')
        elif isinstance(value, list):
            items = ", ".join(f"\"{item}\"" for item in value)
            lines.append(f"{key} = [{items}]")
        else:
            lines.append(f"{key} = {value}")
    lines.extend(["", "[model]", "provider = \"mock\"", "model = \"mock\""])
    (root / ".realforge.toml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _config(root: Path):
    return load_config(root)


def _init_git(root: Path) -> None:
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True, env=_git_env())
    subprocess.run(
        ["git", "commit", "-m", "init"],
        cwd=root,
        check=True,
        capture_output=True,
        env=_git_env(),
    )


def _write_benchmark(root: Path, *, score: float = 0.9) -> None:
    report = BenchmarkReport(
        id="benchsched01",
        realforge_version="2.0.0",
        provider="mock",
        provider_model="mock",
        suite="smoke",
        started_at=bench_now(),
        duration_ms=100,
        task_results=(),
        total_score=int(score * 100),
        normalized_score=score,
        passed=True,
        safety_failures=(),
        generated_artifacts_count=0,
        notes=(),
    )
    write_benchmark_report(report, root)


def test_scheduler_status_works_with_staff_enabled_and_disabled(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_config(root, staff_enabled=False, scheduler_enabled=False)
    with pytest.raises(StaffError):
        format_scheduler_status(_config(root))

    _write_config(root, staff_enabled=True, scheduler_enabled=False)
    status = format_scheduler_status(_config(root))
    assert "Scheduler enabled: False" in status
    assert "unsupported/refused in RealForge 2.0" in status


def test_scheduler_run_refuses_when_staff_disabled(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_config(root, staff_enabled=False, scheduler_enabled=True)
    with pytest.raises(StaffError):
        run_scheduler(workspace_root=root, config=_config(root), dry_run=True)


def test_scheduler_run_refuses_when_scheduler_disabled(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_config(root, scheduler_enabled=False)
    with pytest.raises(SchedulerError, match="scheduler is disabled"):
        run_scheduler(workspace_root=root, config=_config(root), dry_run=True)


def test_scheduler_run_dry_run_does_not_create_proposals_experiments_or_bundles(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    _write_config(root, scheduler_enabled=True, require_leaderboard_pass=False)
    before_proposals = list_proposals(root)

    outcome = run_scheduler(workspace_root=root, config=_config(root), dry_run=True)
    assert outcome.ok is True
    assert "Dry-run only" in outcome.message
    assert outcome.report is None
    assert list_proposals(root) == before_proposals
    assert not list(scheduler_runs_dir(root).glob("*.json")) if scheduler_runs_dir(root).exists() else True


def test_scheduler_run_enforces_max_runs_per_invocation_cap(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_config(
        root,
        scheduler_enabled=True,
        max_runs_per_invocation=2,
        areas=["tests", "docs", "realforge"],
        require_leaderboard_pass=False,
    )
    outcome = run_scheduler(workspace_root=root, config=_config(root), dry_run=True)
    assert "tests, docs" in outcome.message
    assert "realforge" not in outcome.message.split("Selected areas")[1].split("Would run")[0]


def test_scheduler_run_enforces_leaderboard_benchmark_gate(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_config(root, scheduler_enabled=True, require_leaderboard_pass=True, minimum_benchmark_score=0.99)
    with pytest.raises(SchedulerError, match="no saved task benchmark reports"):
        run_scheduler(workspace_root=root, config=_config(root))

    _write_benchmark(root, score=0.5)
    with pytest.raises(SchedulerError, match="below minimum"):
        run_scheduler(workspace_root=root, config=_config(root))

    _write_benchmark(root, score=0.995)
    dry = run_scheduler(workspace_root=root, config=_config(root), dry_run=True)
    assert dry.ok is True
    assert "meets minimum" in dry.message


def test_scheduler_run_with_mock_creates_patch_experiment_proposal_and_bundle(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    _write_config(root, scheduler_enabled=True, require_leaderboard_pass=False, create_update_bundle=True)
    source_before = (root / "tests" / "test_example.py").read_text(encoding="utf-8")

    outcome = run_scheduler(
        workspace_root=root,
        config=_config(root),
        temp_root=tmp_path / "experiments",
    )
    assert outcome.report is not None
    assert outcome.report.proposals_created
    assert outcome.report.update_bundles_created
    assert outcome.report.experiments_created
    assert outcome.report.main_workspace_modified is False
    assert (root / "tests" / "test_example.py").read_text(encoding="utf-8") == source_before
    assert scheduler_run_path(root, outcome.report.id).is_file()


def test_scheduler_never_applies_source_patch_or_commits(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    _write_config(root, scheduler_enabled=True, require_leaderboard_pass=False)
    source_before = (root / "tests" / "test_example.py").read_text(encoding="utf-8")
    head_before = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()

    run_scheduler(workspace_root=root, config=_config(root), temp_root=tmp_path / "experiments")

    assert (root / "tests" / "test_example.py").read_text(encoding="utf-8") == source_before
    head_after = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert head_before == head_after


def test_scheduler_list_and_show(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    _write_config(root, scheduler_enabled=True, require_leaderboard_pass=False)
    outcome = run_scheduler(workspace_root=root, config=_config(root), temp_root=tmp_path / "experiments")
    listed = list_scheduler(root, config=_config(root))
    assert outcome.report.id in listed
    shown = show_scheduler_run(root, outcome.report.id, config=_config(root))
    assert outcome.report.id in shown


def test_scheduler_refuses_auto_apply_and_auto_commit(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_config(root, scheduler_enabled=True, auto_apply=True)
    with pytest.raises(SchedulerError, match="auto_apply"):
        run_scheduler(workspace_root=root, config=_config(root), dry_run=True)

    _write_config(root, scheduler_enabled=True, auto_commit=True)
    with pytest.raises(SchedulerError, match="auto_commit"):
        run_scheduler(workspace_root=root, config=_config(root), dry_run=True)


def test_scheduler_reports_written_under_scheduler_runs(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    _write_config(root, scheduler_enabled=True, require_leaderboard_pass=False)
    outcome = run_scheduler(workspace_root=root, config=_config(root), temp_root=tmp_path / "experiments")
    path = scheduler_run_path(root, outcome.report.id)
    assert path.resolve().is_relative_to(scheduler_runs_dir(root).resolve())
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["provider"] == "mock"
    assert payload["dry_run"] is False


def test_scheduler_status_cli(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_config(root, scheduler_enabled=True)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "scheduler-status"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "Scheduler enabled: True" in proc.stdout


def test_scheduler_run_dry_run_cli(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_config(root, scheduler_enabled=True, require_leaderboard_pass=False)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "scheduler-run", "--dry-run"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "Dry-run only" in proc.stdout
