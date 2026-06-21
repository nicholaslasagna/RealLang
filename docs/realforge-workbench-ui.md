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

Run and validation instructions are in [`workbench/README.md`](../workbench/README.md).
