"""Approval-gated local image generation (sandbox-only).

One bounded prompt -> the user-configured local image provider's OpenAI-compatible
`/images/generations` endpoint -> one base64 PNG. No model name, API key, path, or
private config is ever returned. Output is LOCAL UNTRUSTED and not persisted here.
"""

from __future__ import annotations

import base64
import binascii
import json
import time
import unicodedata
from collections.abc import Callable
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import urljoin

from realforge.private_provider_config import (
    LOCAL_IMAGE_PROVIDER,
    PrivateProviderConfigError,
    load_private_local_config_bundle,
    parse_local_endpoint,
)
from realforge.providers.http_util import HTTPProviderError, post_json

IMAGE_MAX_PROMPT_CHARS = 2_000
IMAGE_TIMEOUT_SECONDS = 60.0  # ponytail: image gen is slow; generous vs chat's 20s
IMAGE_MAX_BYTES = 8 * 1024 * 1024  # decoded PNG cap
IMAGE_MAX_RESPONSE_BYTES = 12 * 1024 * 1024  # raw JSON cap (b64 is ~33% larger)


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
    if image.kind != LOCAL_IMAGE_PROVIDER or parse_local_endpoint(image.base_url or "") is None:
        return _fail(started, clock, "not_configured", "Private local image provider endpoint is missing or not local.", status="not_configured", input_length=input_length, configured=True)

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

    return ProviderImageReport(
        ok=True,
        attempted=True,
        configured=True,
        status="pass",
        input_length=input_length,
        duration_ms=_ms(started, clock),
        image_base64=b64,
        mime="image/png",
        image_bytes=len(base64.b64decode(b64)),
        untrusted_output=True,
        error=None,
    )


def format_provider_image_gen_json(report: ProviderImageReport) -> str:
    return json.dumps(report.to_dict(), sort_keys=True)


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
    if len(raw) > IMAGE_MAX_BYTES:
        return None, ProviderImageError("image_too_large", "Local image exceeded the sandbox size limit.")
    if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return None, ProviderImageError("invalid_response", "Local image provider returned a non-PNG image.")
    return b64, None


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
