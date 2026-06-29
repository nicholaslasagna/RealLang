from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

import realforge.provider_image_gen as img
from realforge.private_provider_config import CONFIG_FILE_NAME
from realforge.provider_image_gen import run_private_provider_image_gen

SECRET_MODEL = "private-image-model-x"
SECRET_API_KEY = "super-secret-image-key-x"

# Real 1x1 PNG.
PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Z2wAAAAAElFTkSuQmCC"
)


def _write_image_config(home: Path) -> None:
    home.mkdir(parents=True, exist_ok=True)
    (home / CONFIG_FILE_NAME).write_text(
        "\n".join(
            [
                "[image_provider]",
                'kind = "local_image_provider"',
                'display_name = "Private Local Image Model"',
                'base_url = "http://localhost:8188/v1"',
                f'model = "{SECRET_MODEL}"',
                f'api_key = "{SECRET_API_KEY}"',
                'trust = "local_untrusted"',
            ]
        )
        + "\n",
        encoding="utf-8",
    )


class _FakeResp:
    def __init__(self, body: bytes) -> None:
        self._b = body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def read(self, _limit: int) -> bytes:
        return self._b


def _opener(b64: str = PNG_B64):
    captured: list[object] = []

    def opener(request, timeout=0):
        captured.append(request)
        return _FakeResp(json.dumps({"data": [{"b64_json": b64}]}).encode())

    opener.captured = captured  # type: ignore[attr-defined]
    return opener


def test_image_gen_pass(isolated_home_env: Path):
    _write_image_config(isolated_home_env)
    report = run_private_provider_image_gen("a red circle", opener=_opener())
    assert report.ok is True
    assert report.status == "pass"
    assert report.mime == "image/png"
    assert report.image_base64 == PNG_B64
    assert report.image_bytes > 0
    assert report.untrusted_output is True


def test_image_gen_redacts_model_and_key(isolated_home_env: Path):
    _write_image_config(isolated_home_env)
    report = run_private_provider_image_gen("x", opener=_opener())
    blob = format_blob(report)
    assert SECRET_MODEL not in blob
    assert SECRET_API_KEY not in blob


def format_blob(report) -> str:
    from realforge.provider_image_gen import format_provider_image_gen_json

    return format_provider_image_gen_json(report)


def test_image_gen_not_configured(isolated_home_env: Path):
    report = run_private_provider_image_gen("hi", opener=_opener())
    assert report.ok is False
    assert report.error.code == "not_configured"


def test_image_gen_rejects_empty(isolated_home_env: Path):
    _write_image_config(isolated_home_env)
    report = run_private_provider_image_gen("   ", opener=_opener())
    assert report.status == "rejected"
    assert report.error.code == "empty_input"


def test_image_gen_malformed_b64(isolated_home_env: Path):
    _write_image_config(isolated_home_env)
    report = run_private_provider_image_gen("x", opener=_opener("!!!notb64!!!"))
    assert report.ok is False
    assert report.error.code == "invalid_response"


def test_image_gen_rejects_non_png(isolated_home_env: Path):
    _write_image_config(isolated_home_env)
    not_png = base64.b64encode(b"GIF89a not a png").decode()
    report = run_private_provider_image_gen("x", opener=_opener(not_png))
    assert report.error.code == "invalid_response"


def test_image_gen_size_cap(isolated_home_env: Path, monkeypatch: pytest.MonkeyPatch):
    _write_image_config(isolated_home_env)
    monkeypatch.setattr(img, "IMAGE_MAX_BYTES", 4)  # 1x1 PNG is larger than 4 bytes
    report = run_private_provider_image_gen("x", opener=_opener())
    assert report.error.code == "image_too_large"


def test_image_gen_http_error_redacted(isolated_home_env: Path):
    _write_image_config(isolated_home_env)
    from realforge.providers.http_util import HTTPProviderError

    def boom(request, timeout=0):
        raise HTTPProviderError("timeout", "Local image provider request timed out.")

    report = run_private_provider_image_gen("x", opener=boom)
    assert report.error.code == "timeout"
    assert report.ok is False
