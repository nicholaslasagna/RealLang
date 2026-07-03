"""Approval-gated local image generation (sandbox-only).

One bounded prompt -> the user-configured local image backend -> one base64 PNG.
Two pluggable backends:
  * ``local_image_provider`` — any OpenAI-compatible ``/images/generations`` server.
  * ``comfyui`` — a local ComfyUI install (queue ``/prompt``, poll ``/history``,
    fetch ``/view``); the user's API-format workflow carries a ``%prompt%`` token.
No model name, API key, path, workflow, or private config is ever returned. Output
is LOCAL UNTRUSTED and not persisted here.
"""

from __future__ import annotations

import base64
import binascii
import json
import time
import unicodedata
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urljoin
from uuid import uuid4

from realforge.private_provider_config import (
    COMFYUI_IMAGE_PROVIDER,
    LOCAL_IMAGE_PROVIDER,
    PrivateImageProviderRuntimeSettings,
    PrivateProviderConfigError,
    load_private_local_config_bundle,
    parse_local_endpoint,
)
from realforge.providers.http_util import HTTPProviderError, get_bytes, get_json, post_json

IMAGE_MAX_PROMPT_CHARS = 2_000
IMAGE_TIMEOUT_SECONDS = 60.0  # ponytail: image gen is slow; generous vs chat's 20s
IMAGE_MAX_BYTES = 8 * 1024 * 1024  # decoded PNG cap
IMAGE_MAX_RESPONSE_BYTES = 12 * 1024 * 1024  # raw JSON cap (b64 is ~33% larger)
COMFYUI_PROMPT_TOKEN = "%prompt%"  # injected into the user's workflow text node
COMFYUI_POLL_INTERVAL_SECONDS = 0.5
COMFYUI_MAX_WORKFLOW_BYTES = 1024 * 1024  # workflow_path file cap
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class ProviderImageError:
    code: str
    message: str


@dataclass(frozen=True)
class ProviderImageReport:
    ok: bool
    attempted: bool
    configured: bool
    status: str  # pass | not_configured | rejected | fail
    input_length: int
    duration_ms: int
    image_base64: str | None
    mime: str | None
    image_bytes: int
    untrusted_output: bool
    error: ProviderImageError | None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def run_private_provider_image_gen(
    prompt: str,
    *,
    opener: Callable[..., Any] | None = None,
    clock: Callable[[], float] = time.perf_counter,
    sleep: Callable[[float], None] = time.sleep,
) -> ProviderImageReport:
    started = clock()
    validated, err = _validate_prompt(prompt)
    if err is not None:
        return _fail(started, clock, err.code, err.message, status="rejected")
    assert validated is not None
    input_length = len(validated)

    try:
        bundle = load_private_local_config_bundle()
    except PrivateProviderConfigError:
        return _fail(started, clock, "invalid_config", "Private local provider configuration is invalid.", input_length=input_length)

    image = bundle.image
    if image is None or not image.configured:
        return _fail(started, clock, "not_configured", "Private local image provider is not configured.", status="not_configured", input_length=input_length)
    if parse_local_endpoint(image.base_url or "") is None:
        return _fail(started, clock, "not_configured", "Private local image provider endpoint is missing or not local.", status="not_configured", input_length=input_length, configured=True)

    if image.kind == LOCAL_IMAGE_PROVIDER:
        return _generate_openai_compatible(image, validated, input_length, started, clock, opener)
    if image.kind == COMFYUI_IMAGE_PROVIDER:
        return _generate_comfyui(image, validated, input_length, started, clock, opener, sleep)
    return _fail(started, clock, "not_configured", "Private local image provider backend is not supported.", status="not_configured", input_length=input_length, configured=True)


def format_provider_image_gen_json(report: ProviderImageReport) -> str:
    return json.dumps(report.to_dict(), sort_keys=True)


# --- OpenAI-compatible /images/generations backend -------------------------------


def _generate_openai_compatible(
    image: PrivateImageProviderRuntimeSettings,
    validated: str,
    input_length: int,
    started: float,
    clock: Callable[[], float],
    opener: Callable[..., Any] | None,
) -> ProviderImageReport:
    url = urljoin((image.base_url or "") + "/", "images/generations")
    payload: dict[str, Any] = {"prompt": validated, "n": 1, "response_format": "b64_json"}
    if image.model:
        payload["model"] = image.model
    headers = {"Authorization": f"Bearer {image.api_key}"} if image.api_key else {}

    try:
        data = post_json(url, payload, timeout=IMAGE_TIMEOUT_SECONDS, extra_headers=headers, opener=opener, max_response_bytes=IMAGE_MAX_RESPONSE_BYTES)
    except HTTPProviderError as exc:
        return _fail(started, clock, exc.code, _redact(exc.code), attempted=True, input_length=input_length, configured=True)
    except Exception:  # noqa: BLE001 - never surface provider internals or private values
        return _fail(started, clock, "provider_error", "Local image provider request failed.", attempted=True, input_length=input_length, configured=True)

    b64, decode_error = _extract_image(data)
    if decode_error is not None:
        return _fail(started, clock, decode_error.code, decode_error.message, attempted=True, input_length=input_length, configured=True)
    assert b64 is not None
    return _ok(started, clock, input_length, b64, len(base64.b64decode(b64)))


def _extract_image(data: dict) -> tuple[str | None, ProviderImageError | None]:
    items = data.get("data")
    first = items[0] if isinstance(items, list) and items and isinstance(items[0], dict) else None
    b64 = first.get("b64_json") if isinstance(first, dict) else None
    if not isinstance(b64, str) or not b64:
        return None, ProviderImageError("invalid_response", "Local image provider returned no image data.")
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        return None, ProviderImageError("invalid_response", "Local image provider returned malformed image data.")
    error = _validate_png(raw)
    if error is not None:
        return None, error
    return b64, None


# --- ComfyUI backend -------------------------------------------------------------


def _generate_comfyui(
    image: PrivateImageProviderRuntimeSettings,
    validated: str,
    input_length: int,
    started: float,
    clock: Callable[[], float],
    opener: Callable[..., Any] | None,
    sleep: Callable[[float], None],
) -> ProviderImageReport:
    workflow_text, load_err = _load_comfyui_workflow(image)
    if load_err is not None:
        return _fail(started, clock, load_err.code, load_err.message, input_length=input_length, configured=True)
    assert workflow_text is not None

    injected, inject_err = _inject_prompt(workflow_text, validated)
    if inject_err is not None:
        return _fail(started, clock, inject_err.code, inject_err.message, input_length=input_length, configured=True)
    try:
        workflow = json.loads(injected)
    except json.JSONDecodeError:
        return _fail(started, clock, "invalid_workflow", "ComfyUI workflow is not valid JSON after prompt injection.", input_length=input_length, configured=True)
    if not isinstance(workflow, dict):
        return _fail(started, clock, "invalid_workflow", "ComfyUI workflow must be a node graph object.", input_length=input_length, configured=True)

    base = (image.base_url or "").rstrip("/")
    try:
        queued = post_json(urljoin(base + "/", "prompt"), {"prompt": workflow, "client_id": uuid4().hex}, timeout=IMAGE_TIMEOUT_SECONDS, opener=opener, max_response_bytes=IMAGE_MAX_RESPONSE_BYTES)
    except HTTPProviderError as exc:
        return _fail(started, clock, exc.code, _redact(exc.code), attempted=True, input_length=input_length, configured=True)
    except Exception:  # noqa: BLE001 - never surface provider internals or private values
        return _fail(started, clock, "provider_error", "Local image provider request failed.", attempted=True, input_length=input_length, configured=True)

    prompt_id = queued.get("prompt_id")
    if not isinstance(prompt_id, str) or not prompt_id:
        return _fail(started, clock, "invalid_response", "ComfyUI did not accept the workflow.", attempted=True, input_length=input_length, configured=True)

    ref, poll_err = _poll_comfyui_history(base, prompt_id, opener, sleep, started, clock)
    if poll_err is not None:
        return _fail(started, clock, poll_err.code, poll_err.message, attempted=True, input_length=input_length, configured=True)
    assert ref is not None

    raw, fetch_err = _fetch_comfyui_image(base, ref, opener)
    if fetch_err is not None:
        return _fail(started, clock, fetch_err.code, fetch_err.message, attempted=True, input_length=input_length, configured=True)
    assert raw is not None

    png_err = _validate_png(raw)
    if png_err is not None:
        return _fail(started, clock, png_err.code, png_err.message, attempted=True, input_length=input_length, configured=True)
    return _ok(started, clock, input_length, base64.b64encode(raw).decode("ascii"), len(raw))


def _load_comfyui_workflow(image: PrivateImageProviderRuntimeSettings) -> tuple[str | None, ProviderImageError | None]:
    if image.workflow:
        return image.workflow, None
    if image.workflow_path:
        try:
            path = Path(image.workflow_path).expanduser()
            if not path.is_file():
                return None, ProviderImageError("workflow_missing", "Configured ComfyUI workflow file was not found.")
            if path.stat().st_size > COMFYUI_MAX_WORKFLOW_BYTES:
                return None, ProviderImageError("workflow_too_large", "Configured ComfyUI workflow file is too large.")
            return path.read_text(encoding="utf-8"), None
        except OSError:
            return None, ProviderImageError("workflow_missing", "Configured ComfyUI workflow file could not be read.")
    return None, ProviderImageError("not_configured", "ComfyUI workflow is not configured.")


def _inject_prompt(workflow_text: str, prompt: str) -> tuple[str | None, ProviderImageError | None]:
    if COMFYUI_PROMPT_TOKEN not in workflow_text:
        return None, ProviderImageError("workflow_no_placeholder", f"ComfyUI workflow must contain the {COMFYUI_PROMPT_TOKEN} token in a text node.")
    # json.dumps escapes the prompt for embedding inside an existing JSON string.
    escaped = json.dumps(prompt)[1:-1]
    return workflow_text.replace(COMFYUI_PROMPT_TOKEN, escaped), None


def _poll_comfyui_history(
    base: str,
    prompt_id: str,
    opener: Callable[..., Any] | None,
    sleep: Callable[[float], None],
    started: float,
    clock: Callable[[], float],
) -> tuple[dict[str, str] | None, ProviderImageError | None]:
    url = urljoin(base + "/", f"history/{prompt_id}")
    while True:
        try:
            history = get_json(url, timeout=IMAGE_TIMEOUT_SECONDS, opener=opener, max_response_bytes=IMAGE_MAX_RESPONSE_BYTES)
        except HTTPProviderError as exc:
            return None, ProviderImageError(exc.code, _redact(exc.code))
        except Exception:  # noqa: BLE001 - never surface provider internals
            return None, ProviderImageError("provider_error", "Local image provider request failed.")
        entry = history.get(prompt_id) if isinstance(history, dict) else None
        if isinstance(entry, dict):
            ref = _first_image_ref(entry.get("outputs"))
            if ref is not None:
                return ref, None
            status = entry.get("status")
            if isinstance(status, dict) and status.get("status_str") == "error":
                return None, ProviderImageError("provider_error", "ComfyUI reported a workflow execution error.")
        if (clock() - started) >= IMAGE_TIMEOUT_SECONDS:
            return None, ProviderImageError("timeout", "Local image provider request timed out.")
        sleep(COMFYUI_POLL_INTERVAL_SECONDS)


def _first_image_ref(outputs: object) -> dict[str, str] | None:
    if not isinstance(outputs, dict):
        return None
    for node in outputs.values():
        images = node.get("images") if isinstance(node, dict) else None
        if not isinstance(images, list):
            continue
        for item in images:
            filename = item.get("filename") if isinstance(item, dict) else None
            if isinstance(filename, str) and filename:
                subfolder = item.get("subfolder")
                kind = item.get("type")
                return {
                    "filename": filename,
                    "subfolder": subfolder if isinstance(subfolder, str) else "",
                    "type": kind if isinstance(kind, str) else "output",
                }
    return None


def _fetch_comfyui_image(
    base: str,
    ref: dict[str, str],
    opener: Callable[..., Any] | None,
) -> tuple[bytes | None, ProviderImageError | None]:
    query = urlencode({"filename": ref["filename"], "subfolder": ref["subfolder"], "type": ref["type"]})
    url = urljoin(base + "/", "view") + "?" + query
    try:
        raw = get_bytes(url, timeout=IMAGE_TIMEOUT_SECONDS, opener=opener, max_bytes=IMAGE_MAX_BYTES)
    except HTTPProviderError as exc:
        if exc.code == "response_too_large":
            return None, ProviderImageError("image_too_large", "Local image exceeded the sandbox size limit.")
        return None, ProviderImageError(exc.code, _redact(exc.code))
    except Exception:  # noqa: BLE001 - never surface provider internals
        return None, ProviderImageError("provider_error", "Local image provider request failed.")
    return raw, None


# --- shared helpers --------------------------------------------------------------


def _validate_png(raw: bytes) -> ProviderImageError | None:
    if len(raw) > IMAGE_MAX_BYTES:
        return ProviderImageError("image_too_large", "Local image exceeded the sandbox size limit.")
    if not raw.startswith(PNG_SIGNATURE):
        return ProviderImageError("invalid_response", "Local image provider returned a non-PNG image.")
    return None


def _ok(
    started: float,
    clock: Callable[[], float],
    input_length: int,
    b64: str,
    image_bytes: int,
) -> ProviderImageReport:
    return ProviderImageReport(
        ok=True,
        attempted=True,
        configured=True,
        status="pass",
        input_length=input_length,
        duration_ms=_ms(started, clock),
        image_base64=b64,
        mime="image/png",
        image_bytes=image_bytes,
        untrusted_output=True,
        error=None,
    )


def _validate_prompt(prompt: str) -> tuple[str | None, ProviderImageError | None]:
    if len(prompt) > IMAGE_MAX_PROMPT_CHARS:
        return None, ProviderImageError("input_too_long", f"Image prompt exceeds {IMAGE_MAX_PROMPT_CHARS} characters.")
    if any(unicodedata.category(c) in {"Cc", "Cf", "Cs"} and c not in "\n\r\t" for c in prompt):
        return None, ProviderImageError("invalid_input", "Image prompt contains unsupported control characters.")
    stripped = prompt.strip()
    if not stripped:
        return None, ProviderImageError("empty_input", "Image prompt must not be empty.")
    return stripped, None


def _redact(code: str) -> str:
    return {
        "not_configured": "Private local image provider is not configured.",
        "connection_failed": "Local image provider connection failed.",
        "timeout": "Local image provider request timed out.",
        "http_error": "Local image provider returned an HTTP error.",
        "invalid_json": "Local image provider returned invalid JSON.",
        "response_too_large": "Local image provider response exceeded the sandbox limit.",
    }.get(code, "Local image provider request failed.")


def _ms(started: float, clock: Callable[[], float]) -> int:
    return max(0, round((clock() - started) * 1000))


def _fail(
    started: float,
    clock: Callable[[], float],
    code: str,
    message: str,
    *,
    status: str = "fail",
    configured: bool = False,
    input_length: int = 0,
    attempted: bool = False,
) -> ProviderImageReport:
    return ProviderImageReport(
        ok=False,
        attempted=attempted,
        configured=configured,
        status=status,
        input_length=input_length,
        duration_ms=_ms(started, clock),
        image_base64=None,
        mime=None,
        image_bytes=0,
        untrusted_output=True,
        error=ProviderImageError(code=code, message=message),
    )
