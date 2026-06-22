# Provider smoke bridge threat model (Workbench 0.25)

Workbench 0.25 exposes one narrowly scoped desktop operation for confirming that a
user-configured local provider is reachable. It is equivalent to the existing CLI
command:

```text
realforge provider smoke --json
```

This operation is a fixed diagnostic, not a chat or general provider bridge.

## Authority boundary

The desktop command accepts only an explicit approval acknowledgement. Rust owns
the executable, Python module, subcommands, flags, timeout, working directory, and
output limits. The frontend cannot provide a prompt, path, command string, argument,
endpoint, model identifier, workspace context, file content, or tool request.

The implementation uses a direct process spawn with fixed arguments. It does not
use a shell, shell plugin, browser request, command interpolation, or a general
command allowlist. Web mode always returns `unsupported_web` and cannot run the
diagnostic.

## Data sent to the provider

The existing CLI smoke implementation sends its built-in minimal reachability
request. Workbench cannot view or replace that request. The operation sends:

- no workspace context;
- no repository or file contents;
- no user-entered prompt;
- no tool definitions or tool calls;
- no image-generation request;
- no model-management or model-file operation.

The bridge does not inspect private model directories, discover model files, manage
weights, or rearrange runtime files. It invokes only the existing provider smoke
command, which uses the existing provider configuration mechanism.

## Approval and runtime limits

Each run requires a fresh acknowledgement in Settings. Requests without
`approvalAcknowledged: true` are rejected before workspace or provider resolution.
The acknowledgement does not persist between runs.

The subprocess has a short timeout and independently capped stdout and stderr.
The CLI JSON is parsed, validated, and converted into a second sanitized Rust DTO.
Non-JSON output, oversized output, timeout, spawn failure, and non-zero exit states
produce structured redacted errors.

## Returned fields

The IPC response may contain only:

- success, attempted, and configured booleans;
- generic provider kind;
- endpoint-configured and safe endpoint-host metadata;
- model-configured and API-key-configured booleans;
- status and duration;
- a capped response preview and truncation flag;
- `untrusted_output: true`;
- a structured redacted error.

The bridge never returns an API key, exact model identity, model path, private
request, full base URL, private configuration contents, full response, environment
variables, or process arguments. Provider output is inert and **UNTRUSTED**.

## Persistence and audit policy

Workbench keeps the latest smoke result in component memory only. It is cleared by
reload or application restart. The response preview is not written to app config,
the workspace, the repository, `.realforge`, browser storage, diagnostics, or the
approval audit log.

Workbench 0.25 does not extend the persisted approval-audit schema. Adding smoke
metadata to that store would require a separate schema and privacy review. Until
then, no provider response body, endpoint, model metadata, or configuration state is
recorded there.

## Explicit non-goals

This milestone adds no arbitrary prompting, chat UI, image generation, model-file
management, provider configuration write, workspace read, write bridge, patch or
proposal apply, scheduler operation, update install, commit, merge, or general
provider execution API.
