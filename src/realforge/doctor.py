from __future__ import annotations

import platform
import sys
from dataclasses import dataclass
from pathlib import Path

from realforge.config import RealForgeConfig, default_config
from realforge.private_provider_config import format_redacted_provider_status
from realforge.runner import run_command


@dataclass(frozen=True)
class DoctorCheck:
    name: str
    ok: bool
    detail: str


@dataclass(frozen=True)
class DoctorReport:
    checks: list[DoctorCheck]

    @property
    def ok(self) -> bool:
        required = [c for c in self.checks if c.name in {"python", "realc"}]
        return all(c.ok for c in required)


def run_doctor(config: RealForgeConfig | None = None) -> DoctorReport:
    cfg = config or default_config()
    checks: list[DoctorCheck] = []

    py_ok = sys.version_info >= (3, 11)
    checks.append(
        DoctorCheck(
            name="python",
            ok=py_ok,
            detail=f"{platform.python_version()} ({sys.executable})",
        )
    )

    realc_cmd = " ".join(cfg.realc_command)
    try:
        probe = Path(__file__).resolve().parents[2] / "examples" / "hello.real"
        if probe.is_file():
            result = run_command((*cfg.realc_command, str(probe), "--check"), config=cfg)
            realc_ok = result.returncode == 0
            detail = f"{realc_cmd} (exit {result.returncode})"
        else:
            realc_ok = bool(cfg.realc_command)
            detail = f"{realc_cmd} (hello.real probe unavailable)"
    except Exception as err:  # noqa: BLE001 — doctor should report probe failures
        realc_ok = False
        detail = f"{realc_cmd} ({err})"
    checks.append(DoctorCheck(name="realc", ok=realc_ok, detail=detail))

    if cfg.model_identity_redacted and cfg.private_provider_status is not None:
        model_detail = format_redacted_provider_status(cfg.private_provider_status)
    elif cfg.config_path is not None:
        model_detail = (
            f"{cfg.config_path}: provider={cfg.model.provider}, "
            f"model={cfg.model.model or '(unset)'}, "
            f"base_url={cfg.model.base_url or '(unset)'}"
        )
    elif cfg.private_provider_status is not None and cfg.private_provider_status.configured:
        model_detail = format_redacted_provider_status(cfg.private_provider_status)
    else:
        model_detail = "no .realforge.toml (default provider: mock)"

    checks.append(DoctorCheck(name="model-config", ok=True, detail=model_detail))

    if cfg.model.provider == "ollama":
        configured = cfg.model.base_url or cfg.ollama_base_url
        checks.append(
            DoctorCheck(
                name="ollama",
                ok=bool(configured and cfg.model.model),
                detail=(
                    f"provider=ollama model={cfg.model.model or '(unset)'} "
                    f"base_url={configured or '(unset)'}"
                ),
            )
        )
    elif cfg.model.provider in {"openai_compatible_local", "openai-compatible-local"}:
        configured = cfg.model.base_url or cfg.openai_compatible_base_url
        if cfg.model_identity_redacted:
            status = cfg.private_provider_status
            detail = format_redacted_provider_status(status) if status else (
                f"provider={cfg.model.provider} trust=local_untrusted"
            )
            ok = bool(
                configured
                and status is not None
                and status.model_configured
            )
        else:
            ok = bool(configured and cfg.model.model)
            detail = (
                f"provider={cfg.model.provider} model={cfg.model.model or '(unset)'} "
                f"base_url={configured or '(unset)'}"
            )
        checks.append(
            DoctorCheck(
                name="openai-compatible-local",
                ok=ok,
                detail=detail,
            )
        )
    else:
        checks.append(
            DoctorCheck(
                name="local-model",
                ok=True,
                detail=f"provider={cfg.model.provider} (offline/local adapter)",
            )
        )

    return DoctorReport(checks=checks)


def format_doctor_report(report: DoctorReport) -> str:
    lines = ["RealForge doctor"]
    for check in report.checks:
        status = "ok" if check.ok else "FAIL"
        lines.append(f"- [{status}] {check.name}: {check.detail}")
    lines.append("overall: PASS" if report.ok else "overall: FAIL")
    return "\n".join(lines)
