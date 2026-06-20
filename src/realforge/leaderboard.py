from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from realforge.bench_report import BenchmarkReport, load_benchmark_report, task_benchmarks_dir
from realforge.leaderboard_report import (
    LeaderboardRow,
    LeaderboardSummary,
    LeaderboardTrendRow,
    build_export_summary,
    write_leaderboard_export,
)

EMPTY_STATE_MESSAGE = """No saved task benchmark reports found in .realforge/task_benchmarks/

Create reports with:
  realforge bench-tasks --provider mock --suite all --write"""

LEADERBOARD_HEADER = (
    "RealForge local model leaderboard (internal rule-based measurement; not a superiority benchmark)"
)
TREND_HEADER = (
    "RealForge local model leaderboard trends (internal rule-based measurement; not a superiority benchmark)"
)


@dataclass(frozen=True)
class LeaderboardOutcome:
    ok: bool
    message: str
    warnings: tuple[str, ...]
    summary: LeaderboardSummary | None = None
    export_path: Path | None = None


def _parse_started_at(value: str) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def load_benchmark_reports_safe(workspace_root: Path) -> tuple[tuple[BenchmarkReport, ...], tuple[str, ...]]:
    root = task_benchmarks_dir(workspace_root.resolve())
    if not root.is_dir():
        return (), ()
    reports: list[BenchmarkReport] = []
    warnings: list[str] = []
    for path in sorted(root.glob("*.json")):
        try:
            reports.append(load_benchmark_report(workspace_root, path.stem))
        except (json.JSONDecodeError, KeyError, TypeError, ValueError, FileNotFoundError) as err:
            warnings.append(f"skipped malformed benchmark report {path.name}: {err}")
    return tuple(reports), tuple(warnings)


def _provider_model_key(report: BenchmarkReport) -> tuple[str, str]:
    return report.provider, report.provider_model or ""


def _rank_key(report: BenchmarkReport) -> tuple[float, int, float, int]:
    return (
        -report.normalized_score,
        len(report.safety_failures),
        -_parse_started_at(report.started_at),
        report.duration_ms,
    )


def filter_reports(
    reports: tuple[BenchmarkReport, ...],
    *,
    suite: str | None = None,
    provider: str | None = None,
    realforge_version: str | None = None,
    latest_only: bool = False,
) -> tuple[BenchmarkReport, ...]:
    filtered = reports
    if suite:
        filtered = tuple(item for item in filtered if item.suite == suite)
    if provider:
        filtered = tuple(item for item in filtered if item.provider == provider)
    if realforge_version:
        filtered = tuple(item for item in filtered if item.realforge_version == realforge_version)
    if latest_only:
        latest: dict[tuple[str, str, str], BenchmarkReport] = {}
        for report in filtered:
            key = (*_provider_model_key(report), report.suite)
            current = latest.get(key)
            if current is None or _parse_started_at(report.started_at) >= _parse_started_at(current.started_at):
                latest[key] = report
        filtered = tuple(latest.values())
    return filtered


def rank_reports(reports: tuple[BenchmarkReport, ...]) -> tuple[LeaderboardRow, ...]:
    ordered = sorted(reports, key=_rank_key)
    rows: list[LeaderboardRow] = []
    for index, report in enumerate(ordered, start=1):
        rows.append(
            LeaderboardRow(
                rank=index,
                provider=report.provider,
                provider_model=report.provider_model,
                suite=report.suite,
                normalized_score=report.normalized_score,
                passed=report.passed,
                safety_failures=len(report.safety_failures),
                realforge_version=report.realforge_version,
                report_id=report.id,
                started_at=report.started_at,
            )
        )
    return tuple(rows)


def build_trend_rows(reports: tuple[BenchmarkReport, ...]) -> tuple[LeaderboardTrendRow, ...]:
    groups: dict[tuple[str, str, str], list[BenchmarkReport]] = {}
    for report in reports:
        key = (*_provider_model_key(report), report.suite)
        groups.setdefault(key, []).append(report)

    rows: list[LeaderboardTrendRow] = []
    for (provider, model, suite), group in sorted(groups.items()):
        ordered = sorted(group, key=lambda item: _parse_started_at(item.started_at))
        first = ordered[0]
        latest = ordered[-1]
        best = max(item.normalized_score for item in ordered)
        rows.append(
            LeaderboardTrendRow(
                provider=provider,
                provider_model=model or None,
                suite=suite,
                report_count=len(ordered),
                latest_score=latest.normalized_score,
                best_score=best,
                first_score=first.normalized_score,
                score_delta=latest.normalized_score - first.normalized_score,
                latest_report_id=latest.id,
                latest_started_at=latest.started_at,
            )
        )
    return tuple(rows)


def _filters_dict(
    *,
    suite: str | None,
    provider: str | None,
    realforge_version: str | None,
    latest_only: bool,
    trend: bool,
) -> dict[str, str | bool]:
    filters: dict[str, str | bool] = {"trend": trend, "latest_only": latest_only}
    if suite:
        filters["suite"] = suite
    if provider:
        filters["provider"] = provider
    if realforge_version:
        filters["realforge_version"] = realforge_version
    return filters


def format_leaderboard_rows(rows: tuple[LeaderboardRow, ...]) -> str:
    if not rows:
        return EMPTY_STATE_MESSAGE
    lines = [LEADERBOARD_HEADER, ""]
    for row in rows:
        model = row.provider_model or "-"
        passed = "pass" if row.passed else "fail"
        lines.append(
            f"{row.rank}. provider={row.provider} model={model} suite={row.suite} "
            f"score={row.normalized_score:.3f} {passed} safety_failures={row.safety_failures} "
            f"realforge={row.realforge_version} report={row.report_id} started={row.started_at}"
        )
    lines.append("")
    lines.append("Note: scores compare saved RealForge task benchmarks only; provider output remains untrusted.")
    return "\n".join(lines)


def format_trend_rows(rows: tuple[LeaderboardTrendRow, ...]) -> str:
    if not rows:
        return EMPTY_STATE_MESSAGE
    lines = [TREND_HEADER, ""]
    for row in rows:
        model = row.provider_model or "-"
        delta = f"{row.score_delta:+.3f}"
        lines.append(
            f"provider={row.provider} model={model} suite={row.suite} reports={row.report_count} "
            f"latest={row.latest_score:.3f} best={row.best_score:.3f} first={row.first_score:.3f} "
            f"delta={delta} latest_report={row.latest_report_id} started={row.latest_started_at}"
        )
    lines.append("")
    lines.append("Note: trends track saved benchmark reports over time; not a comparison to frontier tools.")
    return "\n".join(lines)


def run_leaderboard(
    workspace_root: Path,
    *,
    suite: str | None = None,
    provider: str | None = None,
    realforge_version: str | None = None,
    latest_only: bool = False,
    trend: bool = False,
) -> LeaderboardOutcome:
    reports, warnings = load_benchmark_reports_safe(workspace_root)
    filtered = filter_reports(
        reports,
        suite=suite,
        provider=provider,
        realforge_version=realforge_version,
        latest_only=latest_only,
    )
    filters = _filters_dict(
        suite=suite,
        provider=provider,
        realforge_version=realforge_version,
        latest_only=latest_only,
        trend=trend,
    )
    if trend:
        rows = build_trend_rows(filtered)
        message = format_trend_rows(rows)
        mode = "trend"
    else:
        rows = rank_reports(filtered)
        message = format_leaderboard_rows(rows)
        mode = "ranking"
    summary = build_export_summary(mode=mode, filters=filters, rows=rows, warnings=warnings)
    return LeaderboardOutcome(ok=True, message=message, warnings=warnings, summary=summary)


def export_leaderboard(
    workspace_root: Path,
    output_path: Path,
    *,
    suite: str | None = None,
    provider: str | None = None,
    realforge_version: str | None = None,
    latest_only: bool = False,
    trend: bool = False,
) -> LeaderboardOutcome:
    outcome = run_leaderboard(
        workspace_root,
        suite=suite,
        provider=provider,
        realforge_version=realforge_version,
        latest_only=latest_only,
        trend=trend,
    )
    if outcome.summary is None:
        return outcome
    path = write_leaderboard_export(outcome.summary, workspace_root, output_path)
    return LeaderboardOutcome(
        ok=True,
        message=f"Leaderboard export written: {path}",
        warnings=outcome.warnings,
        summary=outcome.summary,
        export_path=path,
    )
