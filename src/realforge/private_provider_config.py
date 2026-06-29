from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

CONFIG_FILE_NAME = ".realforge.local.toml"
MAX_FILE_BYTES = 32 * 1024
MAX_FIELD_LEN = 256
DEFAULT_TRUST = "local_untrusted"
LOCAL_PROVIDER = "openai_compatible_local"
LOCAL_IMAGE_PROVIDER = "local_image_provider"


class PrivateProviderConfigError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PrivateProviderRuntimeSettings:
    provider: str | None
    display_name: str | None
    model: str | None
    base_url: str | None
    api_key: str | None
    trust: str

    @property
    def configured(self) -> bool:
        if self.provider != LOCAL_PROVIDER:
            return False
        endpoint = parse_local_endpoint(self.base_url or "")
        model = (self.model or "").strip()
        return endpoint is not None and bool(model) and model != "<configured-locally>"


@dataclass(frozen=True)
class PrivateProviderStatus:
    configured: bool
    provider_kind: str | None
    endpoint_scheme: str | None
    endpoint_host: str | None
    model_configured: bool
    display_name_configured: bool
    trust: str
    config_source: str
    message: str


@dataclass(frozen=True)
class PrivateImageProviderRuntimeSettings:
    kind: str | None
    display_name: str | None
    base_url: str | None
    trust: str
    # Runtime-only — needed to call the endpoint. Never surfaced in *Status (redacted).
    model: str | None = None
    api_key: str | None = None

    @property
    def configured(self) -> bool:
        if self.kind != LOCAL_IMAGE_PROVIDER:
            return False
        return parse_local_endpoint(self.base_url or "") is not None


@dataclass(frozen=True)
class PrivateImageProviderStatus:
    future: bool
    configured: bool
    provider_kind: str | None
    endpoint_scheme: str | None
    endpoint_host: str | None
    display_name_configured: bool
    trust: str
    config_source: str
    message: str
    execution_enabled: bool


@dataclass(frozen=True)
class PrivateLocalMultimodalStatus:
    chat: PrivateProviderStatus
    image: PrivateImageProviderStatus
    trust: str
    config_source: str


def private_local_config_path() -> Path:
    return Path.home() / CONFIG_FILE_NAME


def load_private_provider_runtime(*, path: Path | None = None) -> PrivateProviderRuntimeSettings | None:
    """Load runtime private chat provider settings, or None when the file is absent."""
    bundle = load_private_local_config_bundle(path=path)
    return bundle.chat


def load_private_local_config_bundle(*, path: Path | None = None) -> PrivateLocalConfigBundle:
    """Load chat and optional image provider metadata from the fixed home config file."""
    config_path = path or private_local_config_path()
    if not config_path.is_file():
        return PrivateLocalConfigBundle(chat=None, image=None)

    data = _read_private_local_toml(config_path)
    return PrivateLocalConfigBundle(
        chat=_parse_chat_runtime(data),
        image=_parse_image_runtime(data),
    )


@dataclass(frozen=True)
class PrivateLocalConfigBundle:
    chat: PrivateProviderRuntimeSettings | None
    image: PrivateImageProviderRuntimeSettings | None


def _read_private_local_toml(config_path: Path) -> dict:
    try:
        metadata = config_path.stat()
    except OSError as err:
        raise PrivateProviderConfigError("metadata_failed", f"Could not read private local config metadata: {err}") from err

    if metadata.st_size > MAX_FILE_BYTES:
        raise PrivateProviderConfigError(
            "config_too_large",
            "Private local config file exceeds the allowed size.",
        )

    try:
        text = config_path.read_text(encoding="utf-8")
    except OSError as err:
        raise PrivateProviderConfigError("read_failed", f"Could not read private local config: {err}") from err

    try:
        return tomllib.loads(text)
    except tomllib.TOMLDecodeError as err:
        raise PrivateProviderConfigError("invalid_toml", f"Private local config TOML is invalid: {err}") from err


def _parse_chat_runtime(data: dict) -> PrivateProviderRuntimeSettings:
    section = data.get("provider")
    section_name = "provider"
    kind_field = "kind"
    if section is None:
        # Keep the existing private chat schema readable for local installations.
        section = data.get("model")
        section_name = "model"
        kind_field = "provider"
    if section is None:
        return PrivateProviderRuntimeSettings(
            provider=None,
            display_name=None,
            model=None,
            base_url=None,
            api_key=None,
            trust=DEFAULT_TRUST,
        )

    if not isinstance(section, dict):
        raise PrivateProviderConfigError(
            "invalid_provider_section",
            f"[{section_name}] must be a table",
        )

    provider = _sanitize_optional_string(section.get(kind_field))
    display_name = _sanitize_optional_string(section.get("display_name"))
    model = _sanitize_optional_string(section.get("model"))
    base_url = _sanitize_optional_string(section.get("base_url"))
    api_key = _sanitize_optional_string(section.get("api_key"))
    trust = _sanitize_optional_string(section.get("trust")) or DEFAULT_TRUST

    if base_url and base_url.startswith("file:"):
        raise PrivateProviderConfigError(
            "invalid_base_url",
            f"[{section_name}].base_url must be an HTTP(S) endpoint, not a file URL",
        )

    return PrivateProviderRuntimeSettings(
        provider=provider,
        display_name=display_name,
        model=model,
        base_url=base_url,
        api_key=api_key,
        trust=DEFAULT_TRUST if trust != DEFAULT_TRUST else DEFAULT_TRUST,
    )


def _parse_image_runtime(data: dict) -> PrivateImageProviderRuntimeSettings | None:
    section = data.get("image_provider")
    section_name = "image_provider"
    if section is None:
        # Compatibility with the initial metadata-only schema.
        providers = data.get("providers")
        if providers is not None and not isinstance(providers, dict):
            raise PrivateProviderConfigError("invalid_providers_section", "[providers] must be a table")
        section = providers.get("image") if isinstance(providers, dict) else None
        section_name = "providers.image"
        if section is None:
            return None
    if not isinstance(section, dict):
        raise PrivateProviderConfigError(
            "invalid_image_section",
            f"[{section_name}] must be a table",
        )

    kind = _sanitize_optional_string(section.get("kind"))
    display_name = _sanitize_optional_string(section.get("display_name"))
    base_url = _sanitize_optional_string(section.get("base_url"))
    trust = _sanitize_optional_string(section.get("trust")) or DEFAULT_TRUST

    if base_url and base_url.startswith("file:"):
        raise PrivateProviderConfigError(
            "invalid_image_base_url",
            f"[{section_name}].base_url must be an HTTP(S) endpoint, not a file URL",
        )

    return PrivateImageProviderRuntimeSettings(
        kind=kind,
        display_name=display_name,
        base_url=base_url,
        trust=DEFAULT_TRUST if trust != DEFAULT_TRUST else DEFAULT_TRUST,
        model=_sanitize_optional_string(section.get("model")),
        api_key=_sanitize_optional_string(section.get("api_key")),
    )


def build_private_image_provider_status(
    runtime: PrivateImageProviderRuntimeSettings | None,
) -> PrivateImageProviderStatus:
    if runtime is None:
        return PrivateImageProviderStatus(
            future=True,
            configured=False,
            provider_kind=None,
            endpoint_scheme=None,
            endpoint_host=None,
            display_name_configured=False,
            trust=DEFAULT_TRUST,
            config_source="home_local",
            message="Optional private local image provider is not configured.",
            execution_enabled=False,
        )

    endpoint = parse_local_endpoint(runtime.base_url or "") if runtime.base_url else None
    if runtime.kind != LOCAL_IMAGE_PROVIDER:
        return PrivateImageProviderStatus(
            future=True,
            configured=False,
            provider_kind=None,
            endpoint_scheme=None,
            endpoint_host=None,
            display_name_configured=runtime.display_name is not None,
            trust=DEFAULT_TRUST,
            config_source="home_local",
            message="Private local image provider kind is not local_image_provider.",
            execution_enabled=False,
        )

    configured = endpoint is not None
    if configured:
        message = "Private local image provider metadata detected (execution not enabled yet)."
    else:
        message = "Private local image provider is present but the endpoint is missing or not local."

    return PrivateImageProviderStatus(
        future=True,
        configured=configured,
        provider_kind=runtime.kind,
        endpoint_scheme=endpoint.scheme if endpoint else None,
        endpoint_host=endpoint.host if endpoint else None,
        display_name_configured=runtime.display_name is not None,
        trust=DEFAULT_TRUST,
        config_source="home_local",
        message=message,
        execution_enabled=False,
    )


def format_redacted_image_provider_status(status: PrivateImageProviderStatus) -> str:
    parts = [
        f"future={status.future}",
        f"configured={status.configured}",
        f"provider_kind={status.provider_kind or '(unset)'}",
        f"trust={status.trust}",
        f"execution_enabled={status.execution_enabled}",
        f"config_source={status.config_source}",
    ]
    if status.endpoint_scheme and status.endpoint_host:
        parts.append(f"endpoint={status.endpoint_scheme}://{status.endpoint_host}")
    return ", ".join(parts)


def build_private_provider_status(runtime: PrivateProviderRuntimeSettings | None) -> PrivateProviderStatus:
    if runtime is None:
        return PrivateProviderStatus(
            configured=False,
            provider_kind=None,
            endpoint_scheme=None,
            endpoint_host=None,
            model_configured=False,
            display_name_configured=False,
            trust=DEFAULT_TRUST,
            config_source="home_local",
            message="No private local provider config found in the user home directory.",
        )

    endpoint = parse_local_endpoint(runtime.base_url or "") if runtime.base_url else None
    model_configured = bool(
        runtime.model
        and runtime.model.strip()
        and runtime.model.strip() != "<configured-locally>"
    )

    if runtime.provider != LOCAL_PROVIDER:
        return PrivateProviderStatus(
            configured=False,
            provider_kind=None,
            endpoint_scheme=None,
            endpoint_host=None,
            model_configured=False,
            display_name_configured=runtime.display_name is not None,
            trust=DEFAULT_TRUST,
            config_source="home_local",
            message="Private local config exists but provider is not openai_compatible_local.",
        )

    configured = endpoint is not None and model_configured
    if configured:
        message = "Private local provider config detected in the user home directory."
    elif endpoint is None:
        message = "Private local config is present but the endpoint is missing or not a safe local URL."
    else:
        message = "Private local config is present but the model name is not configured."

    return PrivateProviderStatus(
        configured=configured,
        provider_kind=runtime.provider,
        endpoint_scheme=endpoint.scheme if endpoint else None,
        endpoint_host=endpoint.host if endpoint else None,
        model_configured=model_configured,
        display_name_configured=runtime.display_name is not None,
        trust=DEFAULT_TRUST,
        config_source="home_local",
        message=message,
    )


@dataclass(frozen=True)
class ParsedEndpoint:
    scheme: str
    host: str


def parse_local_endpoint(raw: str) -> ParsedEndpoint | None:
    trimmed = raw.strip()
    if not trimmed or len(trimmed) > MAX_FIELD_LEN:
        return None

    parsed = urlparse(trimmed)
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or not parsed.netloc:
        return None
    if parsed.username is not None or parsed.password is not None:
        return None
    host = parsed.hostname or ""
    if not _is_local_host(host):
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if port is not None and not 1 <= port <= 65535:
        return None
    safe_host = f"[{host}]" if ":" in host else host
    if port is not None:
        safe_host = f"{safe_host}:{port}"
    return ParsedEndpoint(scheme=scheme, host=safe_host)


def format_redacted_provider_status(status: PrivateProviderStatus) -> str:
    parts = [
        f"configured={status.configured}",
        f"provider_kind={status.provider_kind or '(unset)'}",
        f"trust={status.trust}",
        f"model_configured={status.model_configured}",
        f"config_source={status.config_source}",
    ]
    if status.endpoint_scheme and status.endpoint_host:
        parts.append(f"endpoint={status.endpoint_scheme}://{status.endpoint_host}")
    return ", ".join(parts)


def redacted_status_to_dict(status: PrivateProviderStatus) -> dict[str, object]:
    payload: dict[str, object] = {
        "configured": status.configured,
        "provider_kind": status.provider_kind,
        "model_configured": status.model_configured,
        "display_name_configured": status.display_name_configured,
        "trust": status.trust,
        "config_source": status.config_source,
        "message": status.message,
    }
    if status.endpoint_scheme is not None:
        payload["endpoint_scheme"] = status.endpoint_scheme
    if status.endpoint_host is not None:
        payload["endpoint_host"] = status.endpoint_host
    return payload


def redacted_image_status_to_dict(status: PrivateImageProviderStatus) -> dict[str, object]:
    payload: dict[str, object] = {
        "configured": status.configured,
        "provider_kind": status.provider_kind,
        "display_name_configured": status.display_name_configured,
        "trust": status.trust,
        "config_source": status.config_source,
        "message": status.message,
        "execution_enabled": status.execution_enabled,
    }
    if status.endpoint_scheme is not None:
        payload["endpoint_scheme"] = status.endpoint_scheme
    if status.endpoint_host is not None:
        payload["endpoint_host"] = status.endpoint_host
    return payload


def build_private_local_multimodal_status(
    bundle: PrivateLocalConfigBundle,
) -> PrivateLocalMultimodalStatus:
    return PrivateLocalMultimodalStatus(
        chat=build_private_provider_status(bundle.chat),
        image=build_private_image_provider_status(bundle.image),
        trust=DEFAULT_TRUST,
        config_source="home_local",
    )


def redacted_multimodal_status_to_dict(
    status: PrivateLocalMultimodalStatus,
) -> dict[str, object]:
    return {
        "chat": redacted_status_to_dict(status.chat),
        "image": redacted_image_status_to_dict(status.image),
        "trust": status.trust,
        "config_source": status.config_source,
    }


def _sanitize_optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed or len(trimmed) > MAX_FIELD_LEN:
        return None
    if "\n" in trimmed or "\r" in trimmed:
        return None
    return trimmed


def _host_without_port(authority: str) -> str:
    if authority.startswith("[") and "]" in authority:
        return authority[1 : authority.index("]")]
    return authority.split(":", 1)[0]


def _is_local_host(host: str) -> bool:
    lowered = host.lower()
    return lowered in {"localhost", "127.0.0.1", "::1"}


def endpoint_host_is_local(base_url: str) -> bool:
    parsed = urlparse(base_url.strip())
    if parsed.scheme not in {"http", "https"}:
        return False
    host = parsed.hostname or ""
    return _is_local_host(host)
