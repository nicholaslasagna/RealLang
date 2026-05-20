# Security policy

RealLang is an early experimental compiler project. It is not production-ready,
and it has not received a formal security audit.

## Supported versions

Only the current `main` branch is considered for security fixes.

## Reporting security issues

If the repository enables GitHub private vulnerability reporting, use that
channel.

If private reporting is not available, open a GitHub issue with a high-level
description and avoid posting working exploit details publicly. A maintainer can
then coordinate a safer disclosure path.

## Scope

Security-relevant issues may include:

- compiler crashes on untrusted input
- generated C that introduces memory-unsafe behavior beyond documented language
  semantics
- command execution or path traversal in tooling
- benchmark or study scripts that execute unexpected files
- dependency or packaging issues

## Current limitations

RealLang currently compiles local source files through Python tooling and an
external C compiler. Do not run untrusted RealLang source, generated C, or study
submissions outside an isolated environment.

The compiler does not currently provide sandboxing.

