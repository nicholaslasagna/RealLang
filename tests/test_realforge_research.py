import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

from realforge.agent_loop import run_agent
from realforge.config import RealForgeConfig
from realforge.permissions import PermissionMode, Permissions
from realforge.providers.mock import MockProvider
from realforge.research import ResearchError, build_research_context, list_research, run_research_fetch, show_research
from realforge.research.fetcher import FetchResult, fetch_https_url
from realforge.research.safety import ResearchSafetyError, validate_research_url
from realforge.research.store import load_research_record, record_dir, research_root

ROOT = Path(__file__).resolve().parents[1]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _workspace(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    (root / "README.md").write_text("# workspace\n", encoding="utf-8")
    return root


@dataclass
class _MockResponse:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str


def _mock_opener(responses: dict[str, _MockResponse]):
    def opener(url: str, timeout: float) -> _MockResponse:
        if url not in responses:
            raise ResearchError(f"unexpected url: {url}")
        return responses[url]

    return opener


def _noop_resolve(_hostname: str, allow_domain: str) -> None:
    return None


def test_reject_non_https_url():
    with pytest.raises(ResearchSafetyError, match="only HTTPS"):
        validate_research_url("http://example.com/page", allow_domain="example.com")


def test_reject_file_url():
    with pytest.raises(ResearchSafetyError, match="only HTTPS"):
        validate_research_url("file:///etc/passwd", allow_domain="example.com")


def test_reject_localhost():
    with pytest.raises(ResearchSafetyError, match="blocked hostname"):
        validate_research_url("https://localhost/page", allow_domain="localhost")


def test_reject_private_ip_url():
    with pytest.raises(ResearchSafetyError, match="blocked IP address"):
        validate_research_url("https://192.168.1.10/page", allow_domain="example.com")


def test_reject_metadata_ip_url():
    with pytest.raises(ResearchSafetyError, match="blocked IP address"):
        validate_research_url("https://169.254.169.254/latest/meta-data", allow_domain="example.com")


def test_reject_domain_not_in_allowlist():
    with pytest.raises(ResearchSafetyError, match="not allowed"):
        validate_research_url("https://evil.example.org/page", allow_domain="example.com")


def test_reject_redirect_to_disallowed_domain():
    opener = _mock_opener(
        {
            "https://example.com/start": _MockResponse(
                status=302,
                headers={"Location": "https://evil.example.org/secret"},
                body=b"",
                url="https://example.com/start",
            )
        }
    )
    with pytest.raises(ResearchSafetyError, match="not allowed"):
        fetch_https_url(
            "https://example.com/start",
            allow_domain="example.com",
            opener=opener,
            resolve_host=_noop_resolve,
        )


def test_enforce_response_size_limit():
    opener = _mock_opener(
        {
            "https://example.com/big": _MockResponse(
                status=200,
                headers={"Content-Type": "text/plain"},
                body=b"x" * 300,
                url="https://example.com/big",
            )
        }
    )
    with pytest.raises(ResearchSafetyError, match="size limit"):
        fetch_https_url(
            "https://example.com/big",
            allow_domain="example.com",
            max_bytes=128,
            opener=opener,
            resolve_host=_noop_resolve,
        )


def test_store_snapshot_and_metadata(tmp_path: Path):
    root = _workspace(tmp_path)
    html = b"<html><head><title>Docs</title></head><body><p>RealLang docs page</p></body></html>"
    opener = _mock_opener(
        {
            "https://example.com/docs": _MockResponse(
                status=200,
                headers={"Content-Type": "text/html; charset=utf-8"},
                body=html,
                url="https://example.com/docs",
            )
        }
    )
    outcome = run_research_fetch(
        url="https://example.com/docs",
        allow_domain="example.com",
        workspace_root=root,
        query="RealLang docs",
        opener=opener,
        resolve_host=_noop_resolve,
    )
    record = outcome.record
    directory = record_dir(root, record.id)
    assert directory.is_dir()
    assert (directory / "metadata.json").is_file()
    assert (directory / "source.html").is_file()
    assert (directory / "summary.txt").is_file()
    metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["url"] == "https://example.com/docs"
    assert metadata["query"] == "RealLang docs"
    assert metadata["content_hash"] == record.content_hash
    assert "RealLang docs page" in metadata["summary"]
    assert directory.resolve().is_relative_to(research_root(root).resolve())


def test_research_list_and_show(tmp_path: Path):
    root = _workspace(tmp_path)
    opener = _mock_opener(
        {
            "https://example.com/a": _MockResponse(
                status=200,
                headers={"Content-Type": "text/plain"},
                body=b"alpha",
                url="https://example.com/a",
            )
        }
    )
    outcome = run_research_fetch(
        url="https://example.com/a",
        allow_domain="example.com",
        workspace_root=root,
        opener=opener,
        resolve_host=_noop_resolve,
    )
    listed = list_research(root)
    assert outcome.record.id in listed
    shown = show_research(root, outcome.record.id)
    assert "Citation:" in shown
    assert "alpha" in shown


def test_plan_include_research_uses_summary_not_raw_html(tmp_path: Path):
    root = _workspace(tmp_path)
    html = b"<html><body><p>Important docs summary text</p>" + (b"<p>noise</p>" * 500) + b"</body></html>"
    opener = _mock_opener(
        {
            "https://example.com/docs": _MockResponse(
                status=200,
                headers={"Content-Type": "text/html"},
                body=html,
                url="https://example.com/docs",
            )
        }
    )
    outcome = run_research_fetch(
        url="https://example.com/docs",
        allow_domain="example.com",
        workspace_root=root,
        opener=opener,
        resolve_host=_noop_resolve,
    )
    provider = MockProvider()
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    run_agent(
        task="use external docs",
        provider=provider,
        config=cfg,
        permissions=Permissions(mode=PermissionMode.READONLY, workspace_root=root),
        include_research=outcome.record.id,
    )
    assert provider.last_plan_request is not None
    context = provider.last_plan_request.context or ""
    assert "Important docs summary text" in context
    assert "[research:" in context
    assert "<html>" not in context
    assert "<p>" not in context
    assert "<body>" not in context


def test_build_research_context_matches_saved_record(tmp_path: Path):
    root = _workspace(tmp_path)
    record = load_research_record(
        root,
        run_research_fetch(
            url="https://example.com/page",
            allow_domain="example.com",
            workspace_root=root,
            opener=_mock_opener(
                {
                    "https://example.com/page": _MockResponse(
                        status=200,
                        headers={"Content-Type": "text/plain"},
                        body=b"hello research",
                        url="https://example.com/page",
                    )
                }
            ),
            resolve_host=_noop_resolve,
        ).record.id,
    )
    context = build_research_context(root, record.id)
    assert record.summary in context
    assert record.url in context


def test_research_cli_help():
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "research", "--help"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(ROOT),
    )
    assert proc.returncode == 0, proc.stderr
    assert "--allow-domain" in proc.stdout
    assert "--url" in proc.stdout
