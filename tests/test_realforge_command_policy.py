import os
import sys
from pathlib import Path

import pytest

from realforge.command_policy import evaluate_shell_command, validation_permissions
from realforge.config import RealForgeConfig
from realforge.permissions import PermissionMode, Permissions
from realforge.planner import format_plan, mock_plan_for_task
from realforge.research.fetcher import RESEARCH_UNTRUSTED_BOUNDARY, build_research_context
from realforge.runner import (
    PermissionError,
    build_subprocess_env,
    is_sensitive_env_var,
    run_command,
    run_validation_command,
)


def _config(root: Path) -> RealForgeConfig:
    return RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=root,
    )


def test_manual_mode_blocks_shell_without_prompt(tmp_path: Path):
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.MANUAL, workspace_root=tmp_path)
    result = evaluate_shell_command((sys.executable, "-m", "pytest", "-q"), permissions=perms, config=cfg)
    assert result.allowed is False
    assert "manual mode" in result.reason.lower()


def test_ask_alias_maps_to_manual():
    assert PermissionMode("ask") is PermissionMode.MANUAL


def test_workspace_write_blocks_arbitrary_shell(tmp_path: Path):
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=tmp_path)
    with pytest.raises(PermissionError, match="not in RealForge allowlist"):
        run_command((sys.executable, "--version"), config=cfg, permissions=perms)


def test_validation_permissions_allow_pytest(tmp_path: Path):
    cfg = _config(tmp_path)
    perms = validation_permissions(tmp_path)
    result = evaluate_shell_command((sys.executable, "-m", "pytest", "-q"), permissions=perms, config=cfg)
    assert result.allowed is True
    assert result.category == "validation"


def test_validation_permissions_allow_git_diff_check(tmp_path: Path):
    cfg = _config(tmp_path)
    perms = validation_permissions(tmp_path)
    result = evaluate_shell_command(("git", "diff", "--check"), permissions=perms, config=cfg)
    assert result.allowed is True


def test_validation_permissions_allow_realc_check(tmp_path: Path):
    cfg = _config(tmp_path)
    source = tmp_path / "ok.real"
    source.write_text("module main;\nfn main() -> i32 { return 0; }\n", encoding="utf-8")
    perms = validation_permissions(tmp_path)
    cmd = (*cfg.realc_command, str(source), "--check")
    result = evaluate_shell_command(cmd, permissions=perms, config=cfg)
    assert result.allowed is True


def test_validation_permissions_allow_benchmark_smoke(tmp_path: Path):
    cfg = _config(tmp_path)
    perms = validation_permissions(tmp_path)
    cmd = (
        sys.executable,
        "benchmarks/run_benchmarks.py",
        "--runs",
        "1",
        "--warmup",
        "0",
        "--skip-slow",
    )
    result = evaluate_shell_command(cmd, permissions=perms, config=cfg)
    assert result.allowed is True


def test_provider_plan_commands_are_not_executed_by_realforge():
    plan = mock_plan_for_task("inspect hello.real")
    rendered = format_plan(plan)
    assert "Suggested commands (not executed automatically)" in rendered
    assert "UNTRUSTED PROVIDER OUTPUT" in rendered
    assert plan.commands_to_run


def test_research_context_includes_untrusted_boundary(tmp_path: Path):
    from realforge.research.fetcher import run_research_fetch

    class _Response:
        status = 200
        headers = {"Content-Type": "text/plain"}
        body = b"reference only"
        url = "https://example.com/docs"

    outcome = run_research_fetch(
        url="https://example.com/docs",
        allow_domain="example.com",
        workspace_root=tmp_path,
        opener=lambda _url, _timeout: _Response(),
        resolve_host=lambda _host, allow_domain: None,
    )
    context = build_research_context(tmp_path, outcome.record.id)
    assert RESEARCH_UNTRUSTED_BOUNDARY in context
    assert "untrusted external content" in context.lower()


def test_sensitive_env_vars_are_stripped_for_validation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GITHUB_TOKEN", "secret-token")
    monkeypatch.setenv("OPENAI_API_KEY", "secret-key")
    monkeypatch.setenv("SAFE_VAR", "keep-me")
    env = build_subprocess_env(sanitize=True)
    assert env is not None
    assert "GITHUB_TOKEN" not in env
    assert "OPENAI_API_KEY" not in env
    assert env["SAFE_VAR"] == "keep-me"


def test_is_sensitive_env_var_matches_patterns():
    assert is_sensitive_env_var("GITHUB_TOKEN")
    assert is_sensitive_env_var("AWS_SECRET_ACCESS_KEY")
    assert is_sensitive_env_var("MY_SECRET")
    assert not is_sensitive_env_var("PATH")


def test_run_validation_command_uses_sanitized_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GITHUB_TOKEN", "secret-token")
    cfg = _config(tmp_path)
    perms = validation_permissions(tmp_path)
    captured: dict[str, str | None] = {}

    def fake_run(*cmd, config=None, permissions=None, cwd=None, sanitize_env=False, env=None):
        captured["sanitize"] = sanitize_env
        from realforge.runner import CommandResult, CommandDisposition

        return CommandResult(0, "", "", cmd, disposition=CommandDisposition.RAN)

    monkeypatch.setattr("realforge.runner.run_command", fake_run)
    run_validation_command((sys.executable, "-m", "pytest", "-q"), config=cfg, permissions=perms, cwd=tmp_path)
    assert captured["sanitize"] is True
