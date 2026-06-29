from __future__ import annotations

import json
import time
import unicodedata
from collections.abc import Callable, Iterator
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

CHAT_SANDBOX_MAX_PROMPT_CHARS = 2_000
CHAT_SANDBOX_MAX_PROMPT_BYTES = 8 * 1024
CHAT_SANDBOX_MAX_RESPONSE_CHARS = 4_096
CHAT_SANDBOX_TIMEOUT_SECONDS = 20.0
CHAT_SANDBOX_MAX_TOKENS = 512


@dataclass(frozen=True)
class ProviderChatSandboxError:
    code: str
    message: str


@dataclass(frozen=True)
class ProviderChatSandboxReport:
    ok: bool
    attempted: bool
    configured: bool
    provider_kind: str | None
    status: str
    input_length: int
    duration_ms: int
    response: str | None
    response_truncated: bool
    untrusted_output: bool
    error: ProviderChatSandboxError | None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def run_private_provider_chat_sandbox(
    prompt: str,
    *,
    opener: Callable[..., Any] | None = None,
    clock: Callable[[], float] = time.perf_counter,
) -> ProviderChatSandboxReport:
    started = clock()
    validated, validation_error = _validate_prompt(prompt)
    if validation_error is not None:
        return _failure_report(
            started=started,
            clock=clock,
            code=validation_error.code,
            message=validation_error.message,
            status="rejected",
        )
    assert validated is not None
    input_length = len(validated)

    try:
        bundle = load_private_local_config_bundle()
    except PrivateProviderConfigError:
        return _failure_report(
            started=started,
            clock=clock,
            code="invalid_config",
            message="Private local provider configuration is invalid.",
            input_length=input_length,
        )

    runtime = bundle.chat
    redacted = build_private_provider_status(runtime)
    common = {
        "configured": redacted.configured,
        "provider_kind": redacted.provider_kind,
        "input_length": input_length,
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
            message="Private chat sandbox supports only the OpenAI-compatible local provider.",
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
        response = provider.chat_sandbox(
            validated,
            opener=opener,
            timeout=CHAT_SANDBOX_TIMEOUT_SECONDS,
            max_tokens=CHAT_SANDBOX_MAX_TOKENS,
        )
    except HTTPProviderError as err:
        return _failure_report(
            started=started,
            clock=clock,
            attempted=True,
            code=err.code,
            message=_redacted_error_message(err.code),
            **common,
        )
    except Exception:  # noqa: BLE001 - provider internals and private values stay hidden
        return _failure_report(
            started=started,
            clock=clock,
            attempted=True,
            code="provider_error",
            message="Local provider chat request failed.",
            **common,
        )

    safe_response, truncated = _sanitize_response(response)
    return ProviderChatSandboxReport(
        ok=True,
        attempted=True,
        status="pass",
        duration_ms=_duration_ms(started, clock),
        response=safe_response,
        response_truncated=truncated,
        untrusted_output=True,
        error=None,
        **common,
    )


def format_provider_chat_sandbox(report: ProviderChatSandboxReport) -> str:
    lines = ["RealForge private chat sandbox (sanitized)"]
    lines.append(f"configured: {'true' if report.configured else 'false'}")
    lines.append(f"provider_kind: {report.provider_kind or '(unset)'}")
    lines.append(f"request attempted: {'true' if report.attempted else 'false'}")
    lines.append(f"status: {report.status}")
    lines.append(f"input_length: {report.input_length}")
    lines.append(f"duration_ms: {report.duration_ms}")
    if report.error:
        lines.append(f"error: [{report.error.code}] {report.error.message}")
    if report.response is not None:
        suffix = " (truncated)" if report.response_truncated else ""
        lines.append(f"response (LOCAL UNTRUSTED){suffix}: {report.response}")
    lines.append("prompt and response are not persisted")
    return "\n".join(lines)


def format_provider_chat_sandbox_json(report: ProviderChatSandboxReport) -> str:
    return json.dumps(report.to_dict(), indent=2, sort_keys=True)


def _validate_prompt(
    prompt: str,
) -> tuple[str | None, ProviderChatSandboxError | None]:
    if len(prompt) > CHAT_SANDBOX_MAX_PROMPT_CHARS:
        return None, ProviderChatSandboxError(
            code="input_too_long",
            message=f"Chat sandbox input exceeds {CHAT_SANDBOX_MAX_PROMPT_CHARS} characters.",
        )
    if len(prompt.encode("utf-8")) > CHAT_SANDBOX_MAX_PROMPT_BYTES:
        return None, ProviderChatSandboxError(
            code="input_too_large",
            message="Chat sandbox input exceeds the byte limit.",
        )
    if any(
        unicodedata.category(character) in {"Cc", "Cf", "Cs"}
        and character not in "\n\r\t"
        for character in prompt
    ):
        return None, ProviderChatSandboxError(
            code="invalid_input",
            message="Chat sandbox input contains unsupported control characters.",
        )
    stripped = prompt.strip()
    if not stripped:
        return None, ProviderChatSandboxError(
            code="empty_input",
            message="Chat sandbox input must not be empty.",
        )
    return stripped, None


def _failure_report(
    *,
    started: float,
    clock: Callable[[], float],
    code: str,
    message: str,
    configured: bool = False,
    provider_kind: str | None = None,
    input_length: int = 0,
    attempted: bool = False,
    status: str = "fail",
) -> ProviderChatSandboxReport:
    return ProviderChatSandboxReport(
        ok=False,
        attempted=attempted,
        configured=configured,
        provider_kind=provider_kind,
        status=status,
        input_length=input_length,
        duration_ms=_duration_ms(started, clock),
        response=None,
        response_truncated=False,
        untrusted_output=True,
        error=ProviderChatSandboxError(code=code, message=message),
    )


def _duration_ms(started: float, clock: Callable[[], float]) -> int:
    return max(0, round((clock() - started) * 1000))


def _sanitize_text(text: str) -> str:
    """Replace unsupported control characters; preserves newlines/tabs. No trimming."""
    return "".join(
        character if character.isprintable() or character in "\n\t" else " "
        for character in text
    )


def _sanitize_response(response: str) -> tuple[str, bool]:
    safe = _sanitize_text(response).strip()
    truncated = len(safe) > CHAT_SANDBOX_MAX_RESPONSE_CHARS
    return safe[:CHAT_SANDBOX_MAX_RESPONSE_CHARS], truncated


def _redacted_error_message(code: str) -> str:
    return {
        "not_configured": "Private local provider is not configured.",
        "connection_failed": "Local provider connection failed.",
        "timeout": "Local provider chat request timed out.",
        "http_error": "Local provider returned an HTTP error.",
        "invalid_json": "Local provider returned invalid JSON.",
        "invalid_response": "Local provider returned an unsupported response.",
        "response_too_large": "Local provider response exceeded the sandbox limit.",
    }.get(code, "Local provider chat request failed.")


def _load_chat_provider(
    input_length: int,
) -> tuple[OpenAICompatibleLocalProvider | None, dict[str, object], ProviderChatSandboxError | None]:
    """Resolve the sanitized local chat provider, or a redacted config error."""
    try:
        bundle = load_private_local_config_bundle()
    except PrivateProviderConfigError:
        return None, {"input_length": input_length}, ProviderChatSandboxError(
            code="invalid_config",
            message="Private local provider configuration is invalid.",
        )
    runtime = bundle.chat
    redacted = build_private_provider_status(runtime)
    common: dict[str, object] = {
        "configured": redacted.configured,
        "provider_kind": redacted.provider_kind,
        "input_length": input_length,
    }
    if runtime is None:
        return None, common, ProviderChatSandboxError("not_configured", "Private local provider is not configured.")
    if runtime.provider != LOCAL_PROVIDER:
        return None, common, ProviderChatSandboxError(
            "unsupported_provider",
            "Private chat sandbox supports only the OpenAI-compatible local provider.",
        )
    if not runtime.configured:
        return None, common, ProviderChatSandboxError(
            "not_configured",
            "Private local provider configuration is incomplete or not local.",
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
    return OpenAICompatibleLocalProvider(config), common, None


def _stream_error_event(
    started: float,
    clock: Callable[[], float],
    code: str,
    message: str,
    *,
    status: str = "fail",
    configured: bool = False,
    provider_kind: str | None = None,
    input_length: int = 0,
    attempted: bool = False,
) -> dict:
    return {
        "type": "error",
        "ok": False,
        "attempted": attempted,
        "status": status,
        "duration_ms": _duration_ms(started, clock),
        "configured": configured,
        "provider_kind": provider_kind,
        "input_length": input_length,
        "untrusted_output": True,
        "error": {"code": code, "message": message},
    }


def run_private_provider_chat_sandbox_stream(
    prompt: str,
    *,
    opener: Callable[..., Any] | None = None,
    clock: Callable[[], float] = time.perf_counter,
) -> Iterator[dict]:
    """Stream one bounded chat-sandbox request as a sequence of sanitized events.

    Yields ``{"type": "delta", "text": ...}`` for each capped, control-stripped
    content chunk, then a terminal ``{"type": "final", ...}`` event, or a single
    ``{"type": "error", ...}`` on validation/config/provider failure. Boundary is
    identical to the non-streaming sandbox: no system prompt, context, tools, or
    persistence; total visible output is capped at the response-char limit; no
    provider identity, key, path, or token usage is ever emitted.
    """
    started = clock()
    validated, validation_error = _validate_prompt(prompt)
    if validation_error is not None:
        yield _stream_error_event(
            started, clock, validation_error.code, validation_error.message, status="rejected"
        )
        return
    assert validated is not None
    input_length = len(validated)

    provider, common, load_error = _load_chat_provider(input_length)
    if load_error is not None:
        yield _stream_error_event(
            started,
            clock,
            load_error.code,
            load_error.message,
            status="not_configured" if load_error.code == "not_configured" else "fail",
            **common,  # type: ignore[arg-type]
        )
        return
    assert provider is not None

    emitted_chars = 0
    truncated = False
    try:
        for delta in provider.stream_chat_sandbox(
            validated,
            opener=opener,
            timeout=CHAT_SANDBOX_TIMEOUT_SECONDS,
            max_tokens=CHAT_SANDBOX_MAX_TOKENS,
        ):
            if emitted_chars >= CHAT_SANDBOX_MAX_RESPONSE_CHARS:
                truncated = True
                break
            safe = _sanitize_text(delta)
            remaining = CHAT_SANDBOX_MAX_RESPONSE_CHARS - emitted_chars
            if len(safe) > remaining:
                safe = safe[:remaining]
                truncated = True
            if safe:
                emitted_chars += len(safe)
                yield {"type": "delta", "text": safe}
    except HTTPProviderError as err:
        yield _stream_error_event(
            started, clock, err.code, _redacted_error_message(err.code), attempted=True, **common  # type: ignore[arg-type]
        )
        return
    except Exception:  # noqa: BLE001 - provider internals and private values stay hidden
        yield _stream_error_event(
            started, clock, "provider_error", "Local provider chat request failed.", attempted=True, **common  # type: ignore[arg-type]
        )
        return

    yield {
        "type": "final",
        "ok": True,
        "attempted": True,
        "status": "pass",
        "duration_ms": _duration_ms(started, clock),
        "input_length": input_length,
        "response_truncated": truncated,
        "untrusted_output": True,
        "configured": common.get("configured", True),
        "provider_kind": common.get("provider_kind"),
    }
