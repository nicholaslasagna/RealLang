import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.creative.asset_brief import build_asset_brief
from realforge.creative.game_brief import build_game_design_brief
from realforge.creative.image_report import build_image_analysis_report
from realforge.creative.map_design import build_map_design_plan
from realforge.creative.models import (
    AssetBrief,
    CreativeProviderError,
    GameDesignBrief,
    MapDesignPlan,
    write_creative_artifact,
)
from realforge.providers.base import CreativeRequest
from realforge.providers.mock import MockProvider
from realforge.workspace import WorkspaceError

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


def test_mock_creative_brief_returns_valid_untrusted_model():
    brief = build_game_design_brief("design an asymmetrical horror game", MockProvider())
    assert isinstance(brief, GameDesignBrief)
    assert brief.title
    assert brief.core_loop
    assert brief.untrusted_provider_output is True


def test_mock_creative_map_returns_valid_untrusted_model():
    plan = build_map_design_plan("design Hall 13 abandoned school map", MockProvider())
    assert isinstance(plan, MapDesignPlan)
    assert plan.layout_goals
    assert plan.validation_checklist
    assert plan.untrusted_provider_output is True


def test_mock_creative_asset_returns_valid_untrusted_model():
    brief = build_asset_brief("design a forest monster statue prop", MockProvider())
    assert isinstance(brief, AssetBrief)
    assert brief.materials
    assert brief.collision_notes
    assert brief.untrusted_provider_output is True


@pytest.mark.parametrize(
    ("command", "category"),
    (("brief", "briefs"), ("map", "maps"), ("asset", "assets")),
)
def test_creative_cli_write_stores_json_under_workspace(
    tmp_path: Path,
    command: str,
    category: str,
):
    proc = _run_cli(
        tmp_path,
        "creative",
        command,
        "--provider",
        "mock",
        "--task",
        "test creative planning artifact",
        "--write",
    )
    assert proc.returncode == 0, proc.stderr
    paths = tuple((tmp_path / ".realforge" / "creative" / category).glob("*.json"))
    assert len(paths) == 1
    payload = json.loads(paths[0].read_text(encoding="utf-8"))
    assert payload["untrusted_provider_output"] is True
    assert "written:" in proc.stdout


def test_image_report_hashes_metadata_without_semantic_claims(tmp_path: Path):
    image = tmp_path / "sample.png"
    data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + b"\x00\x00\x00\x02\x00\x00\x00\x03" + b"payload"
    image.write_bytes(data)

    report = build_image_analysis_report(image, workspace_root=tmp_path)

    assert report.image_sha256 == hashlib.sha256(data).hexdigest()
    assert report.metadata["width"] == 2
    assert report.metadata["height"] == 3
    assert report.metadata["semantic_analysis_performed"] is False
    assert report.observed_elements == ()
    assert report.model_used is None
    assert any("no semantic image identification" in item.lower() for item in report.limitations)
    assert report.untrusted is True


def test_image_report_write_stays_in_creative_images(tmp_path: Path):
    image = tmp_path / "sample.gif"
    image.write_bytes(b"GIF89a\x01\x00\x01\x00")
    report = build_image_analysis_report(image, workspace_root=tmp_path)
    written = write_creative_artifact(report, tmp_path, "images")
    assert written.resolve().is_relative_to(
        (tmp_path / ".realforge" / "creative" / "images").resolve()
    )


def test_creative_image_cli_reports_metadata_only(tmp_path: Path):
    image = tmp_path / "sample.gif"
    image.write_bytes(b"GIF89a\x01\x00\x01\x00")
    proc = _run_cli(tmp_path, "creative", "image", "--image", str(image))
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["metadata"]["semantic_analysis_performed"] is False
    assert payload["observed_elements"] == []
    assert payload["model_used"] is None


def test_image_path_outside_workspace_is_rejected(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside.png"
    outside.write_bytes(b"not-an-image")
    with pytest.raises(WorkspaceError, match="outside workspace"):
        build_image_analysis_report(outside, workspace_root=workspace)


class InvalidJsonProvider(MockProvider):
    def generate_game_brief(self, request: CreativeRequest) -> str:
        return "not valid JSON"


def test_invalid_provider_json_fails_safely():
    with pytest.raises(CreativeProviderError, match="invalid JSON"):
        build_game_design_brief("test invalid output", InvalidJsonProvider())


def test_creative_cli_without_write_does_not_modify_workspace_sources(tmp_path: Path):
    source = tmp_path / "design.txt"
    source.write_text("source content\n", encoding="utf-8")
    before = source.read_bytes()

    proc = _run_cli(
        tmp_path,
        "creative",
        "brief",
        "--provider",
        "mock",
        "--task",
        "plan without writing",
    )

    assert proc.returncode == 0, proc.stderr
    assert source.read_bytes() == before
    assert not (tmp_path / ".realforge").exists()
    payload = json.loads(proc.stdout)
    assert payload["untrusted_provider_output"] is True
