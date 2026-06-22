from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from typing import Any

from realforge.config import RealForgeConfig
from realforge.config_file import ModelSettings
from realforge.private_provider_config import (
    DEFAULT_TRUST,
    LOCAL_PROVIDER,
    PrivateProviderConfigError,
    build_private_provider_status,
    load_private_local_config_bundle,
)
from realforge.providers.http_util import HTTPProviderError
from realforge.providers.openai_compatible_local import OpenAICompatibleLocalProvider

SMOKE_TIMEOUT_SECONDS = 5.0
SMOKE_MAX_TOKENS = 4
RESPONSE_PREVIEW_CHARS = 160


@dataclass(frozen=True)
class ProviderSmokeError:
    code: str
    message: str


@dataclass(frozen=True)
class ProviderSmokeReport:
    ok: bool
    configured: bool
    attempted: bool
    provider_kind: str | None
    endpoint_configured: bool
    endpoint_host: str | None
    model_configured: bool
    api_key_configured: bool
    status: str
    duration_ms: int
    response_preview: str | None
    response_truncated: bool
    untrusted_output: bool
    error: ProviderSmokeError | None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def run_private_provider_smoke(
    *,
    opener: Callable[..., Any] | None = None,
    clock: Callable[[], float] = time.perf_counter,
) -> ProviderSmokeReport:
    started = clock()
    try:
        bundle = load_private_local_config_bundle()
    except PrivateProviderConfigError as err:
        return _failure_report(
            started=started,
            clock=clock,
            code=err.code,
            message="Private local provider configuration is invalid.",
        )

    runtime = bundle.chat
    redacted = build_private_provider_status(runtime)
    common = {
        "configured": redacted.configured,
        "provider_kind": redacted.provider_kind,
        "endpoint_configured": redacted.endpoint_host is not None,
        "endpoint_host": (
            f"{redacted.endpoint_scheme}://{redacted.endpoint_host}"
            if redacted.endpoint_scheme and redacted.endpoint_host
            else None
        ),
        "model_configured": redacted.model_configured,
        "api_key_configured": bool(runtime.api_key) if runtime is not None else False,
    }

    if runtime is None:
        return _failure_report(
            started=started,
            clock=clock,
            code="not_configured",
            message="Private local provider is not configured.",
            status="not_configured",
            **common,
        )
    if runtime.provider != LOCAL_PROVIDER:
        return _failure_report(
            started=started,
            clock=clock,
            code="unsupported_provider",
            message="Provider smoke supports only the OpenAI-compatible local provider.",
            **common,
        )
    if not runtime.configured:
        return _failure_report(
            started=started,
            clock=clock,
            code="not_configured",
            message="Private local provider configuration is incomplete or not local.",
            status="not_configured",
            **common,
        )

    config = RealForgeConfig(
        realc_command=(),
        model=ModelSettings(
            provider=LOCAL_PROVIDER,
            model=runtime.model,
            base_url=runtime.base_url,
            api_key=runtime.api_key,
            display_name=None,
            trust=DEFAULT_TRUST,
        ),
        model_identity_redacted=True,
    )
    provider = OpenAICompatibleLocalProvider(config)
    try:
        response = provider.smoke_chat(
            opener=opener,
            timeout=SMOKE_TIMEOUT_SECONDS,
            max_tokens=SMOKE_MAX_TOKENS,
        )
    except HTTPProviderError as err:
        return _failure_report(
            started=started,
            clock=clock,
            attempted=True,
            code=err.code,
            message=err.message,
            **common,
        )
    except Exception:  # noqa: BLE001 - never surface provider internals or private values
        return _failure_report(
            started=started,
            clock=clock,
            attempted=True,
            code="provider_error",
            message="Local provider smoke request failed.",
            **common,
        )

    preview, truncated = _response_preview(response)
    return ProviderSmokeReport(
        ok=True,
        attempted=True,
        status="pass",
        duration_ms=_duration_ms(started, clock),
        response_preview=preview,
        response_truncated=truncated,
        untrusted_output=True,
        error=None,
        **common,
    )


def format_provider_smoke(report: ProviderSmokeReport) -> str:
    lines = ["RealForge provider smoke (sanitized)"]
    lines.append(f"configured: {'true' if report.configured else 'false'}")
    lines.append(f"provider_kind: {report.provider_kind or '(unset)'}")
    if report.endpoint_host:
        lines.append(f"endpoint_host: {report.endpoint_host}")
    lines.append(f"request attempted: {'true' if report.attempted else 'false'}")
    lines.append(f"status: {report.status}")
    lines.append(f"duration_ms: {report.duration_ms}")
    if report.error:
        lines.append(f"error: [{report.error.code}] {report.error.message}")
    if report.response_preview is not None:
        suffix = " (truncated)" if report.response_truncated else ""
        lines.append(f"response preview (UNTRUSTED){suffix}: {report.response_preview}")
    lines.append("provider output remains local_untrusted")
    return "\n".join(lines)


def format_provider_smoke_json(report: ProviderSmokeReport) -> str:
    return json.dumps(report.to_dict(), indent=2, sort_keys=True)


def _failure_report(
    *,
    started: float,
    clock: Callable[[], float],
    code: str,
    message: str,
    configured: bool = False,
    provider_kind: str | None = None,
    endpoint_configured: bool = False,
    endpoint_host: str | None = None,
    model_configured: bool = False,
    api_key_configured: bool = False,
    attempted: bool = False,
    status: str = "fail",
) -> ProviderSmokeReport:
    return ProviderSmokeReport(
        ok=False,
        configured=configured,
        attempted=attempted,
        provider_kind=provider_kind,
        endpoint_configured=endpoint_configured,
        endpoint_host=endpoint_host,
        model_configured=model_configured,
        api_key_configured=api_key_configured,
        status=status,
        duration_ms=_duration_ms(started, clock),
        response_preview=None,
        response_truncated=False,
        untrusted_output=True,
        error=ProviderSmokeError(code=code, message=message),
    )


def _duration_ms(started: float, clock: Callable[[], float]) -> int:
    return max(0, round((clock() - started) * 1000))


def _response_preview(response: str) -> tuple[str, bool]:
    safe = "".join(character if character.isprintable() else " " for character in response)
    safe = " ".join(safe.split())
    truncated = len(safe) > RESPONSE_PREVIEW_CHARS
    return safe[:RESPONSE_PREVIEW_CHARS], truncated
