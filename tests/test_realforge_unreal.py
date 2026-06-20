import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.creative.creative_context import mock_unreal_plan_payload
from realforge.creative.engine_profile import EngineScanError, scan_engine_project
from realforge.creative.models import CreativeProviderError, write_engine_artifact
from realforge.creative.unreal import build_unreal_command_plan
from realforge.providers.base import CreativeRequest
from realforge.providers.mock import MockProvider

ROOT = Path(__file__).resolve().parents[1]


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _fake_unreal_project(workspace: Path) -> Path:
    project = workspace / "Hall13"
    project.mkdir(parents=True)
    (project / "Hall13.uproject").write_text(
        json.dumps({"FileVersion": 3, "EngineAssociation": "5.7"}),
        encoding="utf-8",
    )
    for name in ("Config", "Content", "Source", "Plugins"):
        (project / name).mkdir()
    (project / "Config" / "DefaultEngine.ini").write_text("[URL]\n", encoding="utf-8")
    plugin = project / "Plugins" / "HallTools"
    plugin.mkdir()
    (plugin / "HallTools.uplugin").write_text("{}\n", encoding="utf-8")
    return project


def _snapshot(project: Path) -> dict[str, bytes]:
    return {
        path.relative_to(project).as_posix(): path.read_bytes()
        for path in project.rglob("*")
        if path.is_file()
    }


def test_engine_scan_detects_fake_unreal_project_without_modification(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    before = _snapshot(project)

    profile = scan_engine_project(project, workspace_root=tmp_path)

    assert profile.engine == "unreal"
    assert profile.engine_version == "5.7"
    assert profile.project_file == "Hall13.uproject"
    assert profile.content_dirs == ("Content",)
    assert profile.config_dirs == ("Config",)
    assert profile.source_dirs == ("Source",)
    assert profile.plugins == ("Plugins/HallTools/HallTools.uplugin",)
    assert profile.dry_run_only is True
    assert _snapshot(project) == before


def test_engine_scan_write_stays_under_realforge_engines(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    profile = scan_engine_project(project, workspace_root=tmp_path)
    path = write_engine_artifact(profile, tmp_path)
    assert path.resolve().is_relative_to((tmp_path / ".realforge" / "engines").resolve())


def test_engine_scan_outside_workspace_is_rejected(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = _fake_unreal_project(tmp_path / "outside")
    with pytest.raises(EngineScanError, match="outside workspace"):
        scan_engine_project(outside, workspace_root=workspace)


def test_unreal_plan_is_dry_run_untrusted_and_does_not_modify_project(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    before = _snapshot(project)

    plan = build_unreal_command_plan(
        project,
        "design a map blockout review",
        MockProvider(),
        workspace_root=tmp_path,
    )

    assert plan.project_profile.engine == "unreal"
    assert plan.proposed_steps
    assert plan.dry_run_only is True
    assert plan.requires_human_approval is True
    assert plan.untrusted_provider_output is True
    assert _snapshot(project) == before
    assert not (tmp_path / ".realforge").exists()


def test_unreal_plan_write_stays_under_engine_plans(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    plan = build_unreal_command_plan(
        project,
        "plan an asset inspection",
        MockProvider(),
        workspace_root=tmp_path,
    )
    path = write_engine_artifact(plan, tmp_path, category="plans")
    assert path.resolve().is_relative_to(
        (tmp_path / ".realforge" / "engines" / "plans").resolve()
    )


class UnsafePathProvider(MockProvider):
    def generate_unreal_plan(self, request: CreativeRequest) -> str:
        payload = mock_unreal_plan_payload(request.task)
        payload["files_to_modify"] = ["../Config/DefaultEngine.ini"]
        return json.dumps(payload)


def test_unreal_plan_rejects_unsafe_provider_paths(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    with pytest.raises(CreativeProviderError, match="unsafe project path"):
        build_unreal_command_plan(
            project,
            "unsafe provider test",
            UnsafePathProvider(),
            workspace_root=tmp_path,
        )


def test_engine_scan_and_unreal_plan_cli(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    scan = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "engine",
            "scan",
            "--path",
            str(project),
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(tmp_path),
    )
    assert scan.returncode == 0, scan.stderr
    assert json.loads(scan.stdout)["engine"] == "unreal"

    plan = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "unreal",
            "plan",
            "--path",
            str(project),
            "--provider",
            "mock",
            "--task",
            "plan a performance audit",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(tmp_path),
    )
    assert plan.returncode == 0, plan.stderr
    payload = json.loads(plan.stdout)
    assert payload["dry_run_only"] is True
    assert payload["requires_human_approval"] is True
    assert payload["untrusted_provider_output"] is True
