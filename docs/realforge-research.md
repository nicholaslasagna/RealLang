# RealForge research (0.9)

RealForge research is **explicit and permissioned**. It is not autonomous web browsing.
Network access is **off by default** and only occurs when you run `realforge research`
with an allowlisted HTTPS URL.

RealForge does **not** claim to match or exceed Codex, Claude Code, Cursor, or Mythos yet.
Research results are **untrusted** snapshots that can inform planning but cannot directly
edit files or merge code.

## What 0.9 adds

```text
explicit research command → HTTPS fetch (allowlisted domain) → snapshot + metadata → optional plan context
```

Commands:

- `realforge research --url https://example.com/page --allow-domain example.com [--query "..."]`
- `realforge research-list`
- `realforge research-show <research_id>`
- `realforge plan --task "..." --include-research <research_id>`

## Safety rules

- **HTTPS only** — `http://`, `file://`, and direct IP URLs are rejected
- **Domain allowlist required** — `--allow-domain` must match the URL hostname or a parent domain
- **Blocked targets** — localhost, private/link-local/multicast/reserved IPs, metadata IP `169.254.169.254`
- **Redirect validation** — redirects to disallowed domains are rejected
- **Bounded fetch** — response size and timeout limits; no script execution
- **No credentials** — URLs with embedded credentials are rejected; cookies are not stored
- **Workspace-local storage** — snapshots live under `.realforge/research/` (gitignored)
- **Planning uses summaries** — `plan --include-research` includes citation metadata and a short summary, not full raw HTML

## Snapshot layout

```text
.realforge/research/<id>/
  metadata.json
  source.html | source.txt
  summary.txt
```

Metadata includes URL, `fetched_at`, `content_hash`, HTTP status, content type, allow domain,
optional query note, and summary text.

## Relationship to self-improvement

Research can inform `plan`, `improve`, and human review workflows, but it does **not**:

- auto-edit files
- auto-run experiments
- auto-create merge proposals
- auto-merge patches

The safe pipeline remains: **improve → experiment → propose-merge → human-approved apply**.

## Example

```bash
realforge research --url https://example.com/docs --allow-domain example.com --query "RealLang docs"
realforge research-list
realforge research-show <research_id>
realforge plan --task "summarize external docs" --include-research <research_id> --provider mock
```

Tests use mocked HTTP only; live internet is not required for CI.

## Related documents

- [RealForge overview](realforge.md)
- [Architecture](realforge-architecture.md)
- [Self-improvement](realforge-self-improvement.md)
