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


# --- ComfyUI backend -------------------------------------------------------------

PNG_BYTES = base64.b64decode(PNG_B64)
WORKFLOW_INLINE = (
    '{"6": {"class_type": "CLIPTextEncode", "inputs": {"text": "%prompt%"}}, '
    '"9": {"class_type": "SaveImage", "inputs": {"images": ["6", 0]}}}'
)
COMFY_SECRET_MODEL = "private-comfy-checkpoint-x"


def _write_comfyui_config(home: Path, *, workflow: str | None = WORKFLOW_INLINE, workflow_path: str | None = None) -> None:
    home.mkdir(parents=True, exist_ok=True)
    lines = [
        "[image_provider]",
        'kind = "comfyui"',
        'base_url = "http://127.0.0.1:8188"',
        f'model = "{COMFY_SECRET_MODEL}"',
    ]
    if workflow is not None:
        lines.append("workflow = '''" + workflow + "'''")
    if workflow_path is not None:
        lines.append(f'workflow_path = "{workflow_path}"')
    (home / CONFIG_FILE_NAME).write_text("\n".join(lines) + "\n", encoding="utf-8")


def _comfyui_opener(*, history=None, png: bytes = PNG_BYTES, prompt_id: str = "pid-1"):
    calls: list[str] = []
    bodies: list[bytes] = []

    def opener(request, timeout=0):
        url = request.full_url
        calls.append(url)
        if url.endswith("/prompt"):
            bodies.append(request.data or b"")
            return _FakeResp(json.dumps({"prompt_id": prompt_id}).encode())
        if "/history/" in url:
            default = {prompt_id: {"outputs": {"9": {"images": [{"filename": "out.png", "subfolder": "", "type": "output"}]}}}}
            return _FakeResp(json.dumps(history if history is not None else default).encode())
        if "/view" in url:
            return _FakeResp(png)
        return _FakeResp(b"{}")

    opener.calls = calls  # type: ignore[attr-defined]
    opener.bodies = bodies  # type: ignore[attr-defined]
    return opener


def _stub_clock(values):
    it = iter(values)
    last = [0.0]

    def clock():
        try:
            last[0] = next(it)
        except StopIteration:
            pass
        return last[0]

    return clock


def test_comfyui_pass_inline_workflow(isolated_home_env: Path):
    _write_comfyui_config(isolated_home_env)
    opener = _comfyui_opener()
    report = run_private_provider_image_gen("a blue fox", opener=opener, sleep=lambda _: None)
    assert report.ok is True
    assert report.status == "pass"
    assert report.mime == "image/png"
    assert report.image_base64 == PNG_B64
    assert report.untrusted_output is True
    # Prompt was injected into the queued workflow; the placeholder is gone.
    sent = opener.bodies[0].decode()
    assert "a blue fox" in sent
    assert "%prompt%" not in sent


def test_comfyui_workflow_from_path(isolated_home_env: Path, tmp_path: Path):
    workflow_file = tmp_path / "workflow_api.json"
    workflow_file.write_text(WORKFLOW_INLINE, encoding="utf-8")
    _write_comfyui_config(isolated_home_env, workflow=None, workflow_path=str(workflow_file))
    report = run_private_provider_image_gen("x", opener=_comfyui_opener(), sleep=lambda _: None)
    assert report.ok is True
    assert report.image_base64 == PNG_B64


def test_comfyui_redacts_model(isolated_home_env: Path):
    _write_comfyui_config(isolated_home_env)
    report = run_private_provider_image_gen("x", opener=_comfyui_opener(), sleep=lambda _: None)
    assert COMFY_SECRET_MODEL not in format_blob(report)


def test_comfyui_not_configured_without_workflow(isolated_home_env: Path):
    _write_comfyui_config(isolated_home_env, workflow=None)
    report = run_private_provider_image_gen("x", opener=_comfyui_opener(), sleep=lambda _: None)
    assert report.ok is False
    assert report.error.code == "not_configured"


def test_comfyui_workflow_missing_placeholder(isolated_home_env: Path):
    _write_comfyui_config(isolated_home_env, workflow='{"6": {"inputs": {"text": "static"}}}')
    report = run_private_provider_image_gen("x", opener=_comfyui_opener(), sleep=lambda _: None)
    assert report.ok is False
    assert report.error.code == "workflow_no_placeholder"


def test_comfyui_history_execution_error(isolated_home_env: Path):
    _write_comfyui_config(isolated_home_env)
    history = {"pid-1": {"outputs": {}, "status": {"status_str": "error"}}}
    report = run_private_provider_image_gen("x", opener=_comfyui_opener(history=history), sleep=lambda _: None)
    assert report.ok is False
    assert report.error.code == "provider_error"


def test_comfyui_poll_timeout(isolated_home_env: Path):
    _write_comfyui_config(isolated_home_env)
    history = {"pid-1": {"outputs": {}}}  # never yields an image
    report = run_private_provider_image_gen(
        "x",
        opener=_comfyui_opener(history=history),
        clock=_stub_clock([0.0, 100.0]),
        sleep=lambda _: None,
    )
    assert report.ok is False
    assert report.error.code == "timeout"


def test_comfyui_rejects_non_png(isolated_home_env: Path):
    _write_comfyui_config(isolated_home_env)
    report = run_private_provider_image_gen(
        "x", opener=_comfyui_opener(png=b"GIF89a not a png"), sleep=lambda _: None
    )
    assert report.ok is False
    assert report.error.code == "invalid_response"
