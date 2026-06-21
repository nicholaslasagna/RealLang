# RealForge Workbench UI prototype

The repository includes an experimental static RealForge Workbench prototype in
`workbench/`. It translates the approved cockpit design into an offline-safe,
repository-owned interface foundation for future CLI/report JSON integration.

The prototype includes Home, Workbench, Capabilities, Code, Research, Creative,
Image, Vision, Engine, Assets, Benchmarks, Updates, and Settings screens plus a
searchable slash-command palette. Staff workflows are hidden behind a clearly
labeled visual preview and remain off by default.

This is not a backend integration. All values are mocked, no RealForge command
is executed, and no source, proposal, Git, provider, network, engine, or asset
operation is available. No auto-apply, auto-commit, or auto-merge path exists.

The current polish pass strengthens the primary-action hierarchy, adds
domain-aware command search, clarifies read-only settings, presents Staff Off as
an intentional policy state, and gives each creative engineering domain a
concrete safe-start example. These remain presentation-only interactions.

## Workbench 0.2 data architecture

Workbench 0.2 adds TypeScript declaration contracts, defensive report adapters,
status normalization, source JSON fixtures, and UI view-model composition under
`workbench/src/data/`. Capabilities, settings, doctor status, skill benchmarks,
update metadata, slash commands, and studio examples now pass through this data
layer before rendering.

Adapters tolerate missing optional fields, return validation warnings for
malformed values, default provider output to `UNTRUSTED`, and preserve dry-run,
staff-only, approval, local-only, network-off, readonly, and no-write states.
Staff-only reports remain gated unless an explicit preview context is supplied.

Workbench remains offline and static. It does not execute RealForge commands,
read live provider output, or import arbitrary files. The intended integration
order is JSON/report import, then read-only CLI report loading, then separately
reviewed safe command composition. Provider output remains untrusted throughout.

Run and validation instructions are in [`workbench/README.md`](../workbench/README.md).
