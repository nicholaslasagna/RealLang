import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.multimodal.generation_report import build_image_prompt_spec
from realforge.multimodal.image_inputs import ImageInputError, load_image_input
from realforge.multimodal.image_outputs import write_multimodal_report
from realforge.multimodal.mock import MOCK_MAX_IMAGE_BYTES, MockMultimodalProvider
from realforge.multimodal.models import ImagePromptSpec, VisionAnalysis
from realforge.multimodal.provider_base import (
    MultimodalProviderError,
    UnsupportedCapabilityError,
    VisionProviderOutput,
)
from realforge.multimodal.registry import get_multimodal_provider
from realforge.multimodal.vision_report import analyze_image

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


def _png_bytes(width: int = 2, height: int = 3) -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00" * 8
        + width.to_bytes(4, "big")
        + height.to_bytes(4, "big")
        + b"mock-payload"
    )


def test_mock_multimodal_capabilities_are_deterministic():
    first = MockMultimodalProvider().capabilities()
    second = MockMultimodalProvider().capabilities()
    assert first == second
    assert first.provider == "mock"
    assert first.supports_text is True
    assert first.supports_vision is True
    assert first.supports_image_generation is True
    assert first.supports_embeddings is False
    assert first.max_images == 4
    assert first.max_image_bytes == MOCK_MAX_IMAGE_BYTES


def test_multimodal_capabilities_cli_supports_json(tmp_path: Path):
    proc = _run_cli(tmp_path, "multimodal", "capabilities", "--provider", "mock", "--json")
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["provider"] == "mock"
    assert payload["supports_vision"] is True
    assert payload["supports_image_generation"] is True
    assert payload["experimental"] is True


def test_vision_analysis_hashes_image_and_is_untrusted(tmp_path: Path):
    image = tmp_path / "input.png"
    data = _png_bytes()
    image.write_bytes(data)

    report = analyze_image(
        image,
        "inspect this image through the mock workflow",
        MockMultimodalProvider(),
        workspace_root=tmp_path,
    )

    assert isinstance(report, VisionAnalysis)
    assert report.image_sha256_values == (hashlib.sha256(data).hexdigest(),)
    assert report.provider == "mock"
    assert report.untrusted is True
    assert report.observed_elements == ()
    assert report.confidence == 0.0
    assert any("does not inspect semantic image content" in item for item in report.limitations)


def test_image_input_records_safe_metadata(tmp_path: Path):
    image = tmp_path / "input.png"
    image.write_bytes(_png_bytes(7, 11))
    loaded = load_image_input(image, workspace_root=tmp_path)
    assert loaded.media_type == "image/png"
    assert loaded.width == 7
    assert loaded.height == 11
    assert loaded.workspace_relative_path == "input.png"
    assert loaded.metadata["semantic_analysis_performed"] is False


def test_vision_rejects_outside_workspace_path(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside.png"
    outside.write_bytes(_png_bytes())
    with pytest.raises(ImageInputError, match="outside workspace"):
        analyze_image(
            outside,
            "outside path test",
            MockMultimodalProvider(),
            workspace_root=workspace,
        )


def test_vision_rejects_missing_file(tmp_path: Path):
    with pytest.raises(ImageInputError, match="not found"):
        analyze_image(
            tmp_path / "missing.png",
            "missing file test",
            MockMultimodalProvider(),
            workspace_root=tmp_path,
        )


def test_vision_rejects_directory_input(tmp_path: Path):
    directory = tmp_path / "image.png"
    directory.mkdir()
    with pytest.raises(ImageInputError, match="regular file"):
        analyze_image(
            directory,
            "directory test",
            MockMultimodalProvider(),
            workspace_root=tmp_path,
        )


def test_vision_rejects_file_above_provider_limit(tmp_path: Path):
    image = tmp_path / "large.png"
    with image.open("wb") as output:
        output.seek(MOCK_MAX_IMAGE_BYTES)
        output.write(b"x")
    with pytest.raises(ImageInputError, match="exceeds provider limit"):
        analyze_image(
            image,
            "large file test",
            MockMultimodalProvider(),
            workspace_root=tmp_path,
        )


def test_image_prompt_returns_untrusted_spec_without_binary_output(tmp_path: Path):
    report = build_image_prompt_spec(
        "design a dark cinematic forest monster concept",
        MockMultimodalProvider(),
        style_notes=("practical creature effects", "high silhouette readability"),
        target_use_case="concept review",
    )
    assert isinstance(report, ImagePromptSpec)
    assert report.untrusted is True
    assert report.prompt
    assert "prompt specification only" in report.constraints
    assert not (tmp_path / ".realforge").exists()
    assert tuple(tmp_path.glob("*.png")) == ()


def test_multimodal_writes_stay_under_expected_directories(tmp_path: Path):
    image = tmp_path / "input.png"
    image.write_bytes(_png_bytes())
    vision = analyze_image(
        image,
        "write report",
        MockMultimodalProvider(),
        workspace_root=tmp_path,
    )
    prompt = build_image_prompt_spec("write prompt", MockMultimodalProvider())
    vision_path = write_multimodal_report(vision, tmp_path, category="vision")
    prompt_path = write_multimodal_report(prompt, tmp_path, category="image_prompts")
    assert vision_path.resolve().is_relative_to(
        (tmp_path / ".realforge" / "multimodal" / "vision").resolve()
    )
    assert prompt_path.resolve().is_relative_to(
        (tmp_path / ".realforge" / "multimodal" / "image_prompts").resolve()
    )
    assert json.loads(vision_path.read_text(encoding="utf-8"))["untrusted"] is True
    assert json.loads(prompt_path.read_text(encoding="utf-8"))["untrusted"] is True


def test_text_only_provider_fails_unsupported_capabilities_safely(tmp_path: Path):
    config = RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=tmp_path,
    )
    provider = get_multimodal_provider("ollama", config)
    assert provider.capabilities().supports_vision is False
    with pytest.raises(UnsupportedCapabilityError, match="does not support vision"):
        analyze_image(
            tmp_path / "not-read.png",
            "unsupported test",
            provider,
            workspace_root=tmp_path,
        )
    with pytest.raises(UnsupportedCapabilityError, match="image generation"):
        build_image_prompt_spec("unsupported test", provider)


def test_unsupported_multimodal_provider_cli_fails_without_traceback(tmp_path: Path):
    proc = _run_cli(
        tmp_path,
        "image",
        "prompt",
        "--task",
        "unsupported adapter test",
        "--provider",
        "ollama",
    )
    assert proc.returncode == 1
    assert "does not support image generation workflow output" in proc.stderr
    assert "Traceback" not in proc.stderr


class InvalidVisionOutputProvider(MockMultimodalProvider):
    def analyze_vision(self, request):
        return VisionProviderOutput(
            observed_elements=(),
            style_notes=(),
            likely_use_cases=(),
            risks=(),
            limitations=(),
            confidence=2.0,
        )


def test_invalid_provider_output_fails_safely(tmp_path: Path):
    image = tmp_path / "input.png"
    image.write_bytes(_png_bytes())
    with pytest.raises(MultimodalProviderError, match="confidence outside"):
        analyze_image(
            image,
            "invalid provider output",
            InvalidVisionOutputProvider(),
            workspace_root=tmp_path,
        )


def test_vision_and_image_prompt_cli_are_safe_and_json_ready(tmp_path: Path):
    image = tmp_path / "input.png"
    image.write_bytes(_png_bytes())
    vision = _run_cli(
        tmp_path,
        "vision",
        "analyze",
        "--image",
        str(image),
        "--task",
        "mock analysis",
        "--provider",
        "mock",
        "--json",
    )
    assert vision.returncode == 0, vision.stderr
    vision_payload = json.loads(vision.stdout)
    assert vision_payload["untrusted"] is True

    prompt = _run_cli(
        tmp_path,
        "image",
        "prompt",
        "--task",
        "design a dark cinematic forest monster concept",
        "--provider",
        "mock",
        "--json",
    )
    assert prompt.returncode == 0, prompt.stderr
    prompt_payload = json.loads(prompt.stdout)
    assert prompt_payload["untrusted"] is True
    assert "prompt specification only" in prompt_payload["constraints"]
    assert not (tmp_path / ".realforge").exists()


def test_multimodal_cli_write_stores_json_only(tmp_path: Path):
    proc = _run_cli(
        tmp_path,
        "image",
        "prompt",
        "--task",
        "write prompt report",
        "--provider",
        "mock",
        "--write",
    )
    assert proc.returncode == 0, proc.stderr
    reports = tuple((tmp_path / ".realforge" / "multimodal" / "image_prompts").glob("*.json"))
    assert len(reports) == 1
    assert tuple((tmp_path / ".realforge" / "multimodal").rglob("*.png")) == ()


def test_existing_creative_image_command_still_works(tmp_path: Path):
    image = tmp_path / "input.png"
    image.write_bytes(_png_bytes())
    proc = _run_cli(tmp_path, "creative", "image", "--image", str(image))
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["metadata"]["semantic_analysis_performed"] is False
    assert payload["observed_elements"] == []


def test_multimodal_commands_do_not_modify_workspace_sources(tmp_path: Path):
    source = tmp_path / "source.txt"
    source.write_text("unchanged\n", encoding="utf-8")
    image = tmp_path / "input.png"
    image.write_bytes(_png_bytes())
    before_source = source.read_bytes()
    before_image = image.read_bytes()

    vision = _run_cli(
        tmp_path,
        "vision",
        "analyze",
        "--image",
        str(image),
        "--task",
        "read-only workflow",
        "--provider",
        "mock",
    )
    prompt = _run_cli(
        tmp_path,
        "image",
        "prompt",
        "--task",
        "read-only prompt workflow",
        "--provider",
        "mock",
    )
    assert vision.returncode == 0, vision.stderr
    assert prompt.returncode == 0, prompt.stderr
    assert source.read_bytes() == before_source
    assert image.read_bytes() == before_image
    assert not (tmp_path / ".realforge").exists()
