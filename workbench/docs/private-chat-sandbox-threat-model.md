# Private chat sandbox threat model (Workbench 0.26)

Workbench 0.26 introduces one single-turn text sandbox for a user-configured local
provider. It is an approval-gated diagnostic interaction, not an agent, workspace
assistant, tool runner, or memory system.

## Input boundary

User-written text is accepted only by the Private Chat Sandbox. The UI applies a
visible character limit, and Rust independently validates character and byte caps.
Every send requires a fresh acknowledgement. Approval resets after the attempt.

The desktop IPC accepts only:

- `prompt`: one bounded text value;
- `approvalAcknowledged`: one boolean.

Unknown fields are rejected. The IPC accepts no path, file attachment, workspace
selector, command, argument array, endpoint, model identifier, tool definition,
image request, or persistence option.

## Provider request boundary

Tauri invokes one fixed CLI command using a direct process spawn:

```text
realforge provider chat-sandbox --stdin --json
```

Rust owns the executable, Python module, subcommands, flags, timeout, working
directory, and output limits. The validated user text is written only to child
stdin. No shell, shell plugin, command interpolation, browser request, or general
command bridge is used.

The runtime request contains the user text only. It includes no workspace context,
repository or file contents, tools, tool calls, system memory, chat history, image
generation request, or automatic follow-up. It does not inspect or manage model
files or private model directories. The existing private provider configuration
mechanism remains the only provider connection source.

## Output and redaction

The CLI and Rust independently cap output. Rust parses the CLI JSON and constructs a
second sanitized response containing only status, attempted/configured booleans,
generic provider kind, input length, duration, capped response text, truncation,
`untrusted_output: true`, and a structured redacted error.

The response never includes an API key, exact model identity, model path, endpoint
URL, request headers, private configuration, child environment, command arguments,
or raw stderr. Provider text is always **LOCAL UNTRUSTED** and requires user review.

## Persistence and audit policy

Prompt and response text remain in component memory only. Clear removes both from
the current UI state; reload or application restart also removes them. Workbench
does not write either body to app config, browser storage, the repository, the
workspace, `.realforge`, diagnostics, or the approval audit log.

Workbench 0.26 does not record chat audit metadata. A future metadata-only audit
entry would require a separate schema and privacy review and could contain only
bounded non-content facts such as input length, status, duration, and truncation.

## Runtime modes and non-goals

Web mode always returns `unsupported_web` and cannot contact a provider. Desktop
mode exposes only the fixed allowlisted call described above.

This milestone adds no workspace awareness, file reading, file editing, tools,
shell access, writes, image generation, autonomous actions, chat history, automatic
memory, prompt/response persistence, patch apply, command execution proposed by the
provider, scheduler operation, update install, commit, or merge.
