from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

from realforge.config_file import ModelSettings, find_config_file, load_model_settings
from realforge.private_provider_config import (
    DEFAULT_TRUST,
    PrivateProviderConfigError,
    build_private_image_provider_status,
    build_private_provider_status,
    load_private_local_config_bundle,
    parse_local_endpoint,
    private_local_config_path,
)


@dataclass(frozen=True)
class ProviderStatusError:
    code: str
    message: str


@dataclass(frozen=True)
class ProviderStatusReport:
    ok: bool
    configured: bool
    source: str
    provider_kind: str | None
    trust: str
    endpoint_configured: bool
    endpoint_host: str | None
    model_configured: bool
    api_key_configured: bool
    image_provider_configured: bool
    image_provider_kind: str | None
    image_endpoint_host: str | None
    image_provider_execution_enabled: bool
    warnings: tuple[str, ...]
    errors: tuple[ProviderStatusError, ...]

    def to_dict(self) -> dict[str, object]:
        payload = asdict(self)
        payload["errors"] = [asdict(item) for item in self.errors]
        return payload


def build_provider_status_report(workspace_root: Path | None = None) -> ProviderStatusReport:
    root = (workspace_root or Path.cwd()).resolve()
    warnings: list[str] = []
    errors: list[ProviderStatusError] = []

    private_bundle = None
    try:
        private_bundle = load_private_local_config_bundle()
    except PrivateProviderConfigError as err:
        errors.append(ProviderStatusError(code=err.code, message=err.message))

    repo_settings = ModelSettings()
    config_path = find_config_file(root)
    if config_path is not None:
        try:
            repo_settings = load_model_settings(config_path, workspace_root=root)
        except Exception as err:  # noqa: BLE001 — surface repo parse issues without secrets
            errors.append(ProviderStatusError(code="repo_config_error", message=str(err)))

    private_runtime = private_bundle.chat if private_bundle is not None else None
    private_image_runtime = private_bundle.image if private_bundle is not None else None
    private_status = build_private_provider_status(private_runtime)
    image_status = build_private_image_provider_status(private_image_runtime)

    effective = repo_settings
    source = "defaults"
    model_identity_redacted = False

    if private_runtime is not None and private_runtime.configured:
        effective = ModelSettings(
            provider=private_runtime.provider or repo_settings.provider,
            model=private_runtime.model,
            base_url=private_runtime.base_url,
            api_key=private_runtime.api_key,
            display_name=private_runtime.display_name,
            trust=private_runtime.trust,
        )
        source = "home_private"
        model_identity_redacted = True
    elif config_path is not None and (
        repo_settings.provider != "mock"
        or repo_settings.model
        or repo_settings.base_url
    ):
        source = "repo"

    ollama_env = os.environ.get("REALFORGE_OLLAMA_URL")
    openai_env = os.environ.get("REALFORGE_OPENAI_COMPAT_URL")
    env_base_url: str | None = None
    if effective.provider == "ollama" and ollama_env:
        env_base_url = ollama_env.strip()
        warnings.append("base_url supplied by REALFORGE_OLLAMA_URL environment variable")
    elif effective.provider in {"openai_compatible_local", "openai-compatible-local"} and openai_env:
        env_base_url = openai_env.strip()
        warnings.append("base_url supplied by REALFORGE_OPENAI_COMPAT_URL environment variable")

    if env_base_url:
        effective = ModelSettings(
            provider=effective.provider,
            model=effective.model,
            base_url=env_base_url,
            api_key=effective.api_key,
            display_name=effective.display_name,
            trust=effective.trust,
        )
        if source == "defaults":
            source = "env"

    endpoint_configured, endpoint_host = _redacted_endpoint(effective.base_url)
    model_configured = _model_is_configured(effective.model, redacted=model_identity_redacted)
    api_key_configured = bool(effective.api_key)

    provider_kind = effective.provider if effective.provider != "mock" or source != "defaults" else "mock"
    configured = _provider_is_configured(
        provider_kind=provider_kind,
        endpoint_configured=endpoint_configured,
        model_configured=model_configured,
    )

    if errors and private_local_config_path().is_file():
        configured = False

    if not private_local_config_path().is_file() and source == "defaults":
        warnings = tuple(warnings)

    return ProviderStatusReport(
        ok=not errors,
        configured=configured,
        source=source,
        provider_kind=provider_kind,
        trust=effective.trust or DEFAULT_TRUST,
        endpoint_configured=endpoint_configured,
        endpoint_host=endpoint_host,
        model_configured=model_configured,
        api_key_configured=api_key_configured,
        image_provider_configured=image_status.configured,
        image_provider_kind=image_status.provider_kind,
        image_endpoint_host=(
            f"{image_status.endpoint_scheme}://{image_status.endpoint_host}"
            if image_status.endpoint_scheme and image_status.endpoint_host
            else None
        ),
        image_provider_execution_enabled=image_status.execution_enabled,
        warnings=tuple(warnings),
        errors=tuple(errors),
    )


def format_provider_status(report: ProviderStatusReport) -> str:
    lines = ["RealForge provider status (sanitized)"]
    lines.append(f"ok: {'yes' if report.ok else 'no'}")
    lines.append(f"configured: {'yes' if report.configured else 'no'}")
    lines.append(f"source: {report.source}")
    lines.append(f"provider_kind: {report.provider_kind or '(unset)'}")
    lines.append(f"trust: {report.trust}")
    lines.append(f"endpoint_configured: {'yes' if report.endpoint_configured else 'no'}")
    if report.endpoint_host:
        lines.append(f"endpoint_host: {report.endpoint_host}")
    lines.append(f"model_configured: {'yes' if report.model_configured else 'no'}")
    lines.append(f"api_key_configured: {'yes' if report.api_key_configured else 'no'}")
    lines.append(
        f"image_provider_configured: {'yes' if report.image_provider_configured else 'no'}"
    )
    lines.append(f"image_provider_kind: {report.image_provider_kind or '(unset)'}")
    if report.image_endpoint_host:
        lines.append(f"image_endpoint_host: {report.image_endpoint_host}")
    lines.append(
        "image_provider_execution_enabled: "
        f"{'yes' if report.image_provider_execution_enabled else 'no'}"
    )
    if report.warnings:
        lines.append("warnings:")
        lines.extend(f"  - {warning}" for warning in report.warnings)
    if report.errors:
        lines.append("errors:")
        lines.extend(f"  - [{error.code}] {error.message}" for error in report.errors)
    if not report.ok and private_local_config_path().is_file():
        lines.append(
            "note: invalid ~/.realforge.local.toml blocks load_config() for other commands "
            "until fixed; provider status reports the error without printing private values."
        )
    lines.append("provider output remains local_untrusted")
    return "\n".join(lines)


def format_provider_status_json(report: ProviderStatusReport) -> str:
    return json.dumps(report.to_dict(), indent=2, sort_keys=True)


def _model_is_configured(model: str | None, *, redacted: bool) -> bool:
    if not model or not model.strip():
        return False
    if redacted:
        return model.strip() != "<configured-locally>"
    return True


def _provider_is_configured(
    *,
    provider_kind: str | None,
    endpoint_configured: bool,
    model_configured: bool,
) -> bool:
    if provider_kind in {None, "mock"}:
        return False
    if provider_kind == "ollama":
        return endpoint_configured and model_configured
    if provider_kind in {"openai_compatible_local", "openai-compatible-local"}:
        return endpoint_configured and model_configured
    return model_configured


def _redacted_endpoint(base_url: str | None) -> tuple[bool, str | None]:
    if not base_url or not base_url.strip():
        return False, None
    parsed = parse_local_endpoint(base_url)
    if parsed is not None:
        return True, f"{parsed.scheme}://{parsed.host}"
    return True, None
