import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.creative.engine_profile import EngineScanError
from realforge.pipeline.asset_pipeline import build_asset_pipeline_plan
from realforge.pipeline.blender import build_blender_asset_plan
from realforge.pipeline.engine_pipeline import build_engine_pipeline_report
from realforge.pipeline.models import (
    AssetPipelinePlan,
    BlenderAssetPlan,
    EnginePipelineReport,
    UnrealAssetImportPlan,
)
from realforge.pipeline.unreal_pipeline import build_unreal_import_plan
from realforge.pipeline.validation import PipelineError, PipelineProviderError
from realforge.providers.mock import MockProvider


ROOT = Path(__file__).resolve().parents[1]


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _run_cli(workspace: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "realforge.cli", *args],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(workspace),
    )


def _mock_provider(workspace: Path) -> MockProvider:
    return MockProvider(
        RealForgeConfig(
            realc_command=(sys.executable, "-m", "reallang.cli"),
            workspace_root=workspace,
        )
    )


def _fake_unreal_project(workspace: Path) -> Path:
    project = workspace / "MyGame"
    project.mkdir(parents=True)
    (project / "MyGame.uproject").write_text(
        json.dumps({"EngineAssociation": "5.4", "FileVersion": 3}),
        encoding="utf-8",
    )
    (project / "Content").mkdir()
    (project / "Config").mkdir()
    (project / "Config" / "DefaultEngine.ini").write_text(
        "[/Script/Engine.Engine]\n",
        encoding="utf-8",
    )
    return project


def test_asset_pipeline_mock_returns_safe_typed_plan(tmp_path: Path):
    plan = build_asset_pipeline_plan(
        "turn a forest monster concept into an Unreal-ready hero prop",
        _mock_provider(tmp_path),
        workspace_root=tmp_path,
        target_engine="unreal",
    )

    assert isinstance(plan, AssetPipelinePlan)
    assert plan.target_engine == "unreal"
    assert plan.production_steps
    assert plan.validation_checklist
    assert plan.human_review_required is True
    assert plan.dry_run_only is True
    assert plan.untrusted is True
    assert not (tmp_path / ".realforge").exists()


def test_asset_pipeline_cli_json_and_write_are_machine_readable(tmp_path: Path):
    proc = _run_cli(
        tmp_path,
        "asset",
        "pipeline",
        "--provider",
        "mock",
        "--task",
        "plan a hero prop pipeline",
        "--target-engine",
        "unreal",
        "--write",
        "--json",
    )

    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["untrusted"] is True
    assert payload["dry_run_only"] is True
    assert payload["human_review_required"] is True
    reports = tuple((tmp_path / ".realforge" / "pipelines" / "assets").glob("*.json"))
    assert len(reports) == 1
    assert "written:" in proc.stderr


def test_asset_pipeline_resolves_all_optional_source_ids(tmp_path: Path):
    fixtures = (
        (
            ".realforge/creative/assets",
            "aaaaaaaaaaaa",
            {"name": "Prop", "category": "environment", "validation_checklist": []},
        ),
        (
            ".realforge/multimodal/image_jobs",
            "bbbbbbbbbbbb",
            {"prompt_specs": [], "provenance": {}, "untrusted": True},
        ),
        (
            ".realforge/multimodal/reference_boards",
            "cccccccccccc",
            {"reference_hashes": [], "untrusted": True},
        ),
        (
            ".realforge/multimodal/vision_understanding",
            "dddddddddddd",
            {"provider": "mock", "untrusted": True},
        ),
    )
    for directory, artifact_id, fields in fixtures:
        path = tmp_path / directory / f"{artifact_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"id": artifact_id, **fields}), encoding="utf-8")

    plan = build_asset_pipeline_plan(
        "connect saved planning artifacts",
        _mock_provider(tmp_path),
        workspace_root=tmp_path,
        asset_brief="aaaaaaaaaaaa",
        image_job="bbbbbbbbbbbb",
        reference_board="cccccccccccc",
        vision_report="dddddddddddd",
    )

    assert plan.source_asset_brief_id == "aaaaaaaaaaaa"
    assert plan.source_image_job_id == "bbbbbbbbbbbb"
    assert plan.source_reference_board_id == "cccccccccccc"
    assert plan.source_vision_report_id == "dddddddddddd"


def test_asset_pipeline_rejects_outside_workspace_artifact(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "asset.json"
    outside.write_text(
        json.dumps(
            {
                "id": "aaaaaaaaaaaa",
                "name": "Outside",
                "category": "prop",
                "validation_checklist": [],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(PipelineError, match="outside workspace"):
        build_asset_pipeline_plan(
            "outside artifact",
            _mock_provider(workspace),
            workspace_root=workspace,
            asset_brief=str(outside),
        )


def test_asset_pipeline_rejects_mismatched_saved_artifact_id(tmp_path: Path):
    requested = "aaaaaaaaaaaa"
    path = tmp_path / ".realforge" / "creative" / "assets" / f"{requested}.json"
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(
            {
                "id": "bbbbbbbbbbbb",
                "name": "Mismatched",
                "category": "prop",
                "validation_checklist": [],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(PipelineError, match="does not match requested id"):
        build_asset_pipeline_plan(
            "mismatched artifact",
            _mock_provider(tmp_path),
            workspace_root=tmp_path,
            asset_brief=requested,
        )


def test_unreal_import_plan_uses_read_only_project_profile(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    before = {
        path.relative_to(project): path.read_bytes()
        for path in project.rglob("*")
        if path.is_file()
    }
    plan = build_unreal_import_plan(
        project,
        "plan a reviewed static-mesh import",
        _mock_provider(tmp_path),
        workspace_root=tmp_path,
    )

    assert isinstance(plan, UnrealAssetImportPlan)
    assert plan.project_profile_id
    assert plan.project_path == str(project.resolve())
    assert plan.target_content_path.startswith("/Game/")
    assert plan.dry_run_only is True
    assert plan.requires_human_approval is True
    assert plan.untrusted is True
    assert before == {
        path.relative_to(project): path.read_bytes()
        for path in project.rglob("*")
        if path.is_file()
    }


def test_unreal_import_plan_cli_detects_fake_project_and_writes_json(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    proc = _run_cli(
        tmp_path,
        "unreal",
        "import-plan",
        "--path",
        str(project),
        "--task",
        "plan asset import",
        "--provider",
        "mock",
        "--write",
        "--json",
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["project_profile_id"]
    assert payload["dry_run_only"] is True
    assert payload["untrusted"] is True
    reports = tuple((tmp_path / ".realforge" / "pipelines" / "unreal").glob("*.json"))
    assert len(reports) == 1


def test_blender_asset_plan_needs_no_blender_installation(tmp_path: Path):
    plan = build_blender_asset_plan(
        "model a twisted forest altar prop",
        _mock_provider(tmp_path),
    )

    assert isinstance(plan, BlenderAssetPlan)
    assert plan.modeling_steps
    assert plan.export_format
    assert plan.dry_run_only is True
    assert plan.requires_human_approval is True
    assert plan.untrusted is True
    assert not (tmp_path / ".realforge").exists()


def test_blender_asset_plan_cli_writes_json_only(tmp_path: Path):
    proc = _run_cli(
        tmp_path,
        "blender",
        "asset-plan",
        "--task",
        "model a twisted forest altar prop",
        "--provider",
        "mock",
        "--write",
        "--json",
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["dry_run_only"] is True
    outputs = tuple((tmp_path / ".realforge" / "pipelines" / "blender").iterdir())
    assert len(outputs) == 1
    assert outputs[0].suffix == ".json"


def test_engine_pipeline_returns_untrusted_dry_run_report(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    report = build_engine_pipeline_report(
        project,
        "plan asset import workflow",
        _mock_provider(tmp_path),
        workspace_root=tmp_path,
    )

    assert isinstance(report, EnginePipelineReport)
    assert report.engine == "unreal"
    assert report.project_profile is not None
    assert report.command_suggestions
    assert report.dry_run_only is True
    assert report.requires_human_approval is True
    assert report.untrusted is True


class InvalidPipelineProvider(MockProvider):
    def generate_asset_pipeline(self, request):
        return "not valid JSON"


def test_invalid_provider_json_fails_safely(tmp_path: Path):
    with pytest.raises(PipelineProviderError, match="invalid JSON"):
        build_asset_pipeline_plan(
            "invalid provider output",
            InvalidPipelineProvider(),
            workspace_root=tmp_path,
        )


class UnsafeEngineProvider(MockProvider):
    def generate_engine_pipeline(self, request):
        payload = json.loads(super().generate_engine_pipeline(request))
        payload["files_to_modify_if_approved"] = ["../../outside"]
        return json.dumps(payload)


def test_unsafe_provider_project_path_fails_safely(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    with pytest.raises(PipelineProviderError, match="unsafe project path"):
        build_engine_pipeline_report(
            project,
            "unsafe provider path",
            UnsafeEngineProvider(),
            workspace_root=tmp_path,
        )


class CommandSuggestionProvider(MockProvider):
    def __init__(self, marker: Path):
        super().__init__()
        self.marker = marker

    def generate_engine_pipeline(self, request):
        payload = json.loads(super().generate_engine_pipeline(request))
        payload["command_suggestions"] = [f"touch {self.marker}"]
        return json.dumps(payload)


def test_provider_command_suggestions_are_never_executed(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    marker = tmp_path / "must-not-exist"
    report = build_engine_pipeline_report(
        project,
        "record command suggestion",
        CommandSuggestionProvider(marker),
        workspace_root=tmp_path,
    )
    assert report.command_suggestions == (f"touch {marker}",)
    assert not marker.exists()


def test_engine_pipeline_rejects_outside_workspace_project(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    project = _fake_unreal_project(tmp_path / "outside-root")
    with pytest.raises(EngineScanError, match="outside workspace"):
        build_engine_pipeline_report(
            project,
            "outside project",
            _mock_provider(workspace),
            workspace_root=workspace,
        )


def test_pipeline_cli_writes_do_not_modify_project_or_sources(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    source = tmp_path / "source.real"
    source.write_text("module main;\n", encoding="utf-8")
    before = {
        path: path.read_bytes()
        for path in (source, project / "MyGame.uproject", project / "Config" / "DefaultEngine.ini")
    }

    commands = (
        ("asset", "pipeline", "--task", "asset plan", "--provider", "mock", "--write"),
        ("blender", "asset-plan", "--task", "blender plan", "--provider", "mock", "--write"),
        (
            "engine",
            "pipeline",
            "--path",
            str(project),
            "--task",
            "engine plan",
            "--provider",
            "mock",
            "--write",
        ),
        (
            "unreal",
            "import-plan",
            "--path",
            str(project),
            "--task",
            "import plan",
            "--provider",
            "mock",
            "--write",
        ),
    )
    for args in commands:
        proc = _run_cli(tmp_path, *args)
        assert proc.returncode == 0, proc.stderr

    assert all(path.read_bytes() == content for path, content in before.items())
    outputs = tuple((tmp_path / ".realforge" / "pipelines").rglob("*.*"))
    assert len(outputs) == 4
    assert all(path.suffix == ".json" for path in outputs)


def test_existing_engine_scan_and_unreal_plan_still_work(tmp_path: Path):
    project = _fake_unreal_project(tmp_path)
    scan = _run_cli(tmp_path, "engine", "scan", "--path", str(project))
    plan = _run_cli(
        tmp_path,
        "unreal",
        "plan",
        "--path",
        str(project),
        "--task",
        "legacy dry-run plan",
        "--provider",
        "mock",
    )
    assert scan.returncode == 0, scan.stderr
    assert plan.returncode == 0, plan.stderr
    assert json.loads(scan.stdout)["engine"] == "unreal"
    assert json.loads(plan.stdout)["dry_run_only"] is True
