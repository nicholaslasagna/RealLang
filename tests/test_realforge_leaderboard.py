import json
import os
import subprocess
import sys
from pathlib import Path

from realforge import __version__
from realforge.bench_report import BenchmarkReport, write_benchmark_report
from realforge.leaderboard import (
    EMPTY_STATE_MESSAGE,
    export_leaderboard,
    load_benchmark_reports_safe,
    rank_reports,
    run_leaderboard,
)

ROOT = Path(__file__).resolve().parents[1]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _workspace(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    return root


def _minimal_report(
    *,
    report_id: str,
    provider: str = "mock",
    provider_model: str | None = "mock",
    suite: str = "planning",
    normalized_score: float = 0.8,
    passed: bool = True,
    safety_failures: tuple[str, ...] = (),
    started_at: str = "2026-01-01T00:00:00+00:00",
    duration_ms: int = 100,
    realforge_version: str = "1.7.0",
) -> BenchmarkReport:
    return BenchmarkReport(
        id=report_id,
        realforge_version=realforge_version,
        provider=provider,
        provider_model=provider_model,
        suite=suite,
        started_at=started_at,
        duration_ms=duration_ms,
        task_results=(),
        total_score=int(normalized_score * 100),
        normalized_score=normalized_score,
        passed=passed,
        safety_failures=safety_failures,
        generated_artifacts_count=0,
        notes=(),
    )


def _write_report(root: Path, report: BenchmarkReport) -> None:
    write_benchmark_report(report, root)


def test_leaderboard_empty_state_message(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_leaderboard(root)
    assert outcome.ok is True
    assert EMPTY_STATE_MESSAGE in outcome.message
    assert "bench-tasks --provider mock --suite all --write" in outcome.message


def test_leaderboard_ranks_mock_reports_by_normalized_score(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_report(root, _minimal_report(report_id="low", normalized_score=0.5))
    _write_report(root, _minimal_report(report_id="high", normalized_score=0.95))
    _write_report(root, _minimal_report(report_id="mid", normalized_score=0.75))

    outcome = run_leaderboard(root)
    lines = outcome.message.splitlines()
    assert "report=high" in lines[2]
    assert "report=mid" in lines[3]
    assert "report=low" in lines[4]


def test_leaderboard_filters_by_suite(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_report(root, _minimal_report(report_id="plan", suite="planning"))
    _write_report(root, _minimal_report(report_id="gen", suite="generation"))

    outcome = run_leaderboard(root, suite="generation")
    assert "report=gen" in outcome.message
    assert "report=plan" not in outcome.message


def test_leaderboard_filters_by_provider(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_report(root, _minimal_report(report_id="mock1", provider="mock"))
    _write_report(
        root,
        _minimal_report(report_id="ollama1", provider="ollama", provider_model="llama3"),
    )

    outcome = run_leaderboard(root, provider="ollama")
    assert "provider=ollama" in outcome.message
    assert "report=ollama1" in outcome.message
    assert "report=mock1" not in outcome.message


def test_leaderboard_safety_failures_affect_tie_break_order(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_report(
        root,
        _minimal_report(
            report_id="unsafe",
            normalized_score=0.9,
            safety_failures=("unsafe command",),
            started_at="2026-06-01T00:00:00+00:00",
        ),
    )
    _write_report(
        root,
        _minimal_report(
            report_id="safe",
            normalized_score=0.9,
            safety_failures=(),
            started_at="2026-01-01T00:00:00+00:00",
        ),
    )

    rows = rank_reports(load_benchmark_reports_safe(root)[0])
    assert rows[0].report_id == "safe"
    assert rows[1].report_id == "unsafe"


def test_leaderboard_latest_report_tie_break_works(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_report(
        root,
        _minimal_report(
            report_id="older",
            normalized_score=0.9,
            safety_failures=(),
            started_at="2026-01-01T00:00:00+00:00",
            duration_ms=200,
        ),
    )
    _write_report(
        root,
        _minimal_report(
            report_id="newer",
            normalized_score=0.9,
            safety_failures=(),
            started_at="2026-06-01T00:00:00+00:00",
            duration_ms=100,
        ),
    )

    rows = rank_reports(load_benchmark_reports_safe(root)[0])
    assert rows[0].report_id == "newer"
    assert rows[1].report_id == "older"


def test_leaderboard_latest_filter_keeps_newest_per_provider_suite(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_report(
        root,
        _minimal_report(
            report_id="old_run",
            normalized_score=0.99,
            started_at="2026-01-01T00:00:00+00:00",
        ),
    )
    _write_report(
        root,
        _minimal_report(
            report_id="new_run",
            normalized_score=0.5,
            started_at="2026-06-01T00:00:00+00:00",
        ),
    )

    outcome = run_leaderboard(root, latest_only=True)
    assert "report=new_run" in outcome.message
    assert "report=old_run" not in outcome.message


def test_leaderboard_export_writes_metadata_only_json(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_report(root, _minimal_report(report_id="one", normalized_score=0.8))

    outcome = export_leaderboard(root, root / "leaderboard.json")
    assert outcome.export_path is not None
    assert outcome.export_path.is_file()
    payload = json.loads(outcome.export_path.read_text(encoding="utf-8"))
    assert payload["mode"] == "ranking"
    assert payload["realforge_version"] == __version__
    assert payload["rows"][0]["report_id"] == "one"
    assert "task_results" not in payload
    assert "provider_output_summary" not in json.dumps(payload)


def test_leaderboard_trend_mode_summarizes_report_count_and_score_delta(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_report(
        root,
        _minimal_report(
            report_id="first",
            normalized_score=0.5,
            started_at="2026-01-01T00:00:00+00:00",
        ),
    )
    _write_report(
        root,
        _minimal_report(
            report_id="second",
            normalized_score=0.8,
            started_at="2026-06-01T00:00:00+00:00",
        ),
    )

    outcome = run_leaderboard(root, trend=True)
    assert "reports=2" in outcome.message
    assert "delta=+0.300" in outcome.message
    assert "latest=0.800" in outcome.message


def test_malformed_benchmark_reports_are_skipped_with_warning(tmp_path: Path):
    root = _workspace(tmp_path)
    bench_dir = root / ".realforge" / "task_benchmarks"
    bench_dir.mkdir(parents=True)
    (bench_dir / "bad.json").write_text("{not json", encoding="utf-8")
    _write_report(root, _minimal_report(report_id="good", normalized_score=0.7))

    reports, warnings = load_benchmark_reports_safe(root)
    assert len(reports) == 1
    assert reports[0].id == "good"
    assert warnings
    assert "bad.json" in warnings[0]

    outcome = run_leaderboard(root)
    assert len(outcome.warnings) == 1
    assert "report=good" in outcome.message


def test_leaderboard_does_not_modify_main_workspace_files(tmp_path: Path):
    root = _workspace(tmp_path)
    source = root / "hello.real"
    source.write_text("module main;\nfn main() -> i32 { return 0; }\n", encoding="utf-8")
    before = source.read_text(encoding="utf-8")
    _write_report(root, _minimal_report(report_id="one"))

    run_leaderboard(root)
    export_leaderboard(root, root / "leaderboard.json")

    assert source.read_text(encoding="utf-8") == before


def test_leaderboard_cli_empty_state(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "leaderboard"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "bench-tasks --provider mock --suite all --write" in proc.stdout
