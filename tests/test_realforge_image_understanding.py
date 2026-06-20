import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.creative.models import AssetBrief
from realforge.multimodal.image_inputs import ImageInputError
from realforge.multimodal.image_understanding import (
    compare_images,
    image_to_asset_brief,
    understand_image,
)
from realforge.multimodal.mock import MOCK_MAX_IMAGE_BYTES, MockMultimodalProvider
from realforge.multimodal.models import (
    ImageComparisonReport,
    ImageToAssetBriefReport,
    ImageUnderstandingReport,
)
from realforge.multimodal.provider_base import (
    ImageUnderstandingProviderOutput,
    MultimodalProviderError,
    UnsupportedCapabilityError,
)
from realforge.multimodal.registry import get_multimodal_provider


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


def _png_bytes(marker: bytes = b"vision", width: int = 4, height: int = 5) -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00" * 8
        + width.to_bytes(4, "big")
        + height.to_bytes(4, "big")
        + marker
    )


def test_understand_image_returns_structured_untrusted_mock_report(tmp_path: Path):
    image = tmp_path / "reference.png"
    data = _png_bytes()
    image.write_bytes(data)

    report = understand_image(
        image,
        "analyze visual style for a horror game asset",
        MockMultimodalProvider(),
        workspace_root=tmp_path,
    )

    assert isinstance(report, ImageUnderstandingReport)
    assert report.image_sha256_values == (hashlib.sha256(data).hexdigest(),)
    assert report.images[0].workspace_relative_path == "reference.png"
    assert report.provider == "mock"
    assert report.semantic_analysis_performed is False
    assert report.confidence == 0.0
    assert report.detected_subjects == ()
    assert report.untrusted is True
    assert any("No OCR" in limitation for limitation in report.limitations)


def test_vision_understand_cli_json_and_write_are_machine_readable(tmp_path: Path):
    image = tmp_path / "reference.png"
    image.write_bytes(_png_bytes())
    proc = _run_cli(
        tmp_path,
        "vision",
        "understand",
        "--image",
        str(image),
        "--task",
        "analyze visual style",
        "--provider",
        "mock",
        "--write",
        "--json",
    )

    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["semantic_analysis_performed"] is False
    assert payload["untrusted"] is True
    output = tmp_path / ".realforge" / "multimodal" / "vision_understanding"
    reports = tuple(output.glob("*.json"))
    assert len(reports) == 1
    assert "written:" in proc.stderr


def test_compare_images_records_all_hashes_without_semantic_claims(tmp_path: Path):
    first = tmp_path / "first.png"
    second = tmp_path / "second.png"
    first_data = _png_bytes(b"first")
    second_data = _png_bytes(b"second")
    first.write_bytes(first_data)
    second.write_bytes(second_data)

    report = compare_images(
        (first, second),
        "compare style consistency",
        MockMultimodalProvider(),
        workspace_root=tmp_path,
    )

    assert isinstance(report, ImageComparisonReport)
    assert report.image_sha256_values == (
        hashlib.sha256(first_data).hexdigest(),
        hashlib.sha256(second_data).hexdigest(),
    )
    assert len(report.images) == 2
    assert report.confidence == 0.0
    assert report.untrusted is True
    assert any("does not compare visual content" in item for item in report.limitations)


def test_vision_compare_cli_accepts_repeated_images(tmp_path: Path):
    first = tmp_path / "first.png"
    second = tmp_path / "second.png"
    first.write_bytes(_png_bytes(b"first"))
    second.write_bytes(_png_bytes(b"second"))
    proc = _run_cli(
        tmp_path,
        "vision",
        "compare",
        "--image",
        str(first),
        "--image",
        str(second),
        "--task",
        "compare style consistency",
        "--provider",
        "mock",
        "--json",
    )

    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert len(payload["images"]) == 2
    assert len(payload["image_sha256_values"]) == 2
    assert payload["untrusted"] is True


def test_compare_rejects_outside_workspace_image(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    inside = workspace / "inside.png"
    outside = tmp_path / "outside.png"
    inside.write_bytes(_png_bytes(b"inside"))
    outside.write_bytes(_png_bytes(b"outside"))

    with pytest.raises(ImageInputError, match="outside workspace"):
        compare_images(
            (inside, outside),
            "outside path test",
            MockMultimodalProvider(),
            workspace_root=workspace,
        )


def test_compare_enforces_image_count_bounds(tmp_path: Path):
    one = tmp_path / "one.png"
    one.write_bytes(_png_bytes())
    with pytest.raises(ValueError, match="at least 2"):
        compare_images(
            (one,),
            "too few images",
            MockMultimodalProvider(),
            workspace_root=tmp_path,
        )

    paths = []
    for index in range(5):
        path = tmp_path / f"image-{index}.png"
        path.write_bytes(_png_bytes(str(index).encode("ascii")))
        paths.append(path)
    with pytest.raises(MultimodalProviderError, match="at most 4"):
        compare_images(
            tuple(paths),
            "too many images",
            MockMultimodalProvider(),
            workspace_root=tmp_path,
        )


def test_image_to_asset_brief_embeds_existing_asset_schema(tmp_path: Path):
    image = tmp_path / "asset.png"
    image.write_bytes(_png_bytes())
    report = image_to_asset_brief(
        image,
        "prepare a reviewable prop brief",
        MockMultimodalProvider(),
        workspace_root=tmp_path,
    )

    assert isinstance(report, ImageToAssetBriefReport)
    assert isinstance(report.asset_brief, AssetBrief)
    assert report.asset_brief.untrusted_provider_output is True
    assert report.asset_brief.validation_checklist
    assert report.modeling_notes
    assert report.texture_notes
    assert report.untrusted is True


def test_vision_asset_brief_cli_returns_nested_asset_brief(tmp_path: Path):
    image = tmp_path / "asset.png"
    image.write_bytes(_png_bytes())
    proc = _run_cli(
        tmp_path,
        "vision",
        "asset-brief",
        "--image",
        str(image),
        "--task",
        "prepare a reviewable prop brief",
        "--provider",
        "mock",
        "--json",
    )

    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["asset_brief"]["untrusted_provider_output"] is True
    assert payload["source_image_sha256"]
    assert payload["untrusted"] is True


def test_text_only_provider_rejects_rich_vision_before_loading_image(tmp_path: Path):
    config = RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=tmp_path,
    )
    provider = get_multimodal_provider("ollama", config)
    with pytest.raises(UnsupportedCapabilityError, match="does not support vision"):
        understand_image(
            tmp_path / "missing.png",
            "unsupported provider",
            provider,
            workspace_root=tmp_path,
        )

    proc = _run_cli(
        tmp_path,
        "vision",
        "understand",
        "--image",
        "missing.png",
        "--task",
        "unsupported provider",
        "--provider",
        "ollama",
    )
    assert proc.returncode == 1
    assert "does not support vision" in proc.stderr
    assert "Traceback" not in proc.stderr


def test_understand_rejects_missing_and_oversized_images(tmp_path: Path):
    with pytest.raises(ImageInputError, match="not found"):
        understand_image(
            tmp_path / "missing.png",
            "missing input",
            MockMultimodalProvider(),
            workspace_root=tmp_path,
        )

    oversized = tmp_path / "oversized.png"
    with oversized.open("wb") as output:
        output.seek(MOCK_MAX_IMAGE_BYTES)
        output.write(b"x")
    with pytest.raises(ImageInputError, match="exceeds provider limit"):
        understand_image(
            oversized,
            "oversized input",
            MockMultimodalProvider(),
            workspace_root=tmp_path,
        )


class FalseSemanticConfidenceProvider(MockMultimodalProvider):
    def understand_image(self, request):
        output = super().understand_image(request)
        return ImageUnderstandingProviderOutput(
            detected_subjects=output.detected_subjects,
            environment_notes=output.environment_notes,
            composition_notes=output.composition_notes,
            lighting_notes=output.lighting_notes,
            color_palette_notes=output.color_palette_notes,
            material_notes=output.material_notes,
            style_notes=output.style_notes,
            mood_notes=output.mood_notes,
            gameplay_relevance=output.gameplay_relevance,
            asset_opportunities=output.asset_opportunities,
            map_design_opportunities=output.map_design_opportunities,
            risks=output.risks,
            limitations=output.limitations,
            confidence=0.8,
            semantic_analysis_performed=False,
        )


def test_provider_cannot_claim_confidence_without_semantic_analysis(tmp_path: Path):
    image = tmp_path / "input.png"
    image.write_bytes(_png_bytes())
    with pytest.raises(MultimodalProviderError, match="confidence without semantic"):
        understand_image(
            image,
            "invalid provider output",
            FalseSemanticConfidenceProvider(),
            workspace_root=tmp_path,
        )


def test_existing_vision_analyze_still_works(tmp_path: Path):
    image = tmp_path / "input.png"
    image.write_bytes(_png_bytes())
    proc = _run_cli(
        tmp_path,
        "vision",
        "analyze",
        "--image",
        str(image),
        "--task",
        "basic report",
        "--provider",
        "mock",
        "--json",
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["observed_elements"] == []
    assert payload["confidence"] == 0.0
    assert payload["untrusted"] is True


def test_rich_vision_writes_only_reports_and_modifies_no_inputs(tmp_path: Path):
    source = tmp_path / "source.real"
    first = tmp_path / "first.png"
    second = tmp_path / "second.png"
    source.write_text("module main;\n", encoding="utf-8")
    first.write_bytes(_png_bytes(b"first"))
    second.write_bytes(_png_bytes(b"second"))
    before = {path: path.read_bytes() for path in (source, first, second)}

    commands = (
        (
            "vision",
            "understand",
            "--image",
            str(first),
            "--task",
            "understand",
            "--provider",
            "mock",
            "--write",
        ),
        (
            "vision",
            "compare",
            "--image",
            str(first),
            "--image",
            str(second),
            "--task",
            "compare",
            "--provider",
            "mock",
            "--write",
        ),
        (
            "vision",
            "asset-brief",
            "--image",
            str(first),
            "--task",
            "asset brief",
            "--provider",
            "mock",
            "--write",
        ),
    )
    for args in commands:
        proc = _run_cli(tmp_path, *args)
        assert proc.returncode == 0, proc.stderr

    assert all(path.read_bytes() == contents for path, contents in before.items())
    outputs = tuple((tmp_path / ".realforge" / "multimodal").rglob("*.*"))
    assert len(outputs) == 3
    assert all(path.suffix == ".json" for path in outputs)
