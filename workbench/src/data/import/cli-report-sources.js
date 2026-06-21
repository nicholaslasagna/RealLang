(function registerCliReportSources(global) {
  "use strict";

  // Allowlist of read-only RealForge CLI report sources for Workbench 0.4.
  //
  // This is the single source of truth shared by the browser UI (a read-only
  // catalog) and the local Node bridge (workbench/tools/realforge-report-bridge.mjs).
  //
  // Hard rules for every entry:
  //   * `argv` is a FIXED argument array, never a shell string.
  //   * Only read-only commands that print JSON to stdout. No writes, no network,
  //     no apply, no scheduler, no staff execution, no file mutation, no args
  //     supplied by a user.
  //   * Loaded output is untrusted import data until adapted by the import pipeline.
  //
  // Adding a source here is the ONLY way to expose a command; the bridge refuses
  // anything not listed and never accepts arbitrary command text or arguments.
  const SOURCES = Object.freeze([
    Object.freeze({
      id: "capabilities",
      label: "Capability registry",
      description: "Capability domains, safety levels, and suggested next commands.",
      argv: Object.freeze(["capabilities", "--json"]),
      displayCommand: "realforge capabilities --json",
      detectType: "capability_registry",
      readOnly: true,
      writes: false,
      network: false,
      staff: false,
      apply: false
    }),
    Object.freeze({
      id: "slash",
      label: "Slash command registry",
      description: "Read-only slash-command grammar exposed by the CLI.",
      argv: Object.freeze(["slash", "--json"]),
      displayCommand: "realforge slash --json",
      detectType: "slash_command_registry",
      readOnly: true,
      writes: false,
      network: false,
      staff: false,
      apply: false
    }),
    Object.freeze({
      id: "settings-doctor",
      label: "Settings doctor (safety posture)",
      description: "Read-only safety/configuration validation summary.",
      argv: Object.freeze(["settings", "doctor", "--json"]),
      displayCommand: "realforge settings doctor --json",
      detectType: "doctor_status",
      readOnly: true,
      writes: false,
      network: false,
      staff: false,
      apply: false
    })
  ]);

  const SOURCE_IDS = Object.freeze(SOURCES.map((source) => source.id));

  // Subcommands that may write, mutate, apply, run a proposal/scheduler, or reach
  // the network. The bridge cross-checks against this denylist as defense in depth
  // so a future careless edit to SOURCES cannot smuggle in a write-capable command.
  const DENIED_SUBCOMMANDS = Object.freeze([
    "repair", "generate", "improve", "propose-patch", "experiment", "propose-merge",
    "apply-proposal", "cycle", "research", "scheduler-run", "improve-channel",
    "update-bundle", "update-check", "index"
  ]);

  function getSource(id) {
    return SOURCES.find((source) => source.id === id) || null;
  }

  function isAllowed(id) {
    return SOURCE_IDS.includes(id);
  }

  // A source is safe only if it is read-only, supplies a fixed string argv array,
  // and its first token is not a denied (write/mutate/network) subcommand.
  function isReadOnlySource(source) {
    if (!source || typeof source !== "object") return false;
    if (source.readOnly !== true) return false;
    if (source.writes === true || source.staff === true || source.apply === true || source.network === true) return false;
    if (!Array.isArray(source.argv) || source.argv.length === 0) return false;
    if (!source.argv.every((token) => typeof token === "string" && token.length > 0)) return false;
    if (DENIED_SUBCOMMANDS.includes(source.argv[0])) return false;
    return true;
  }

  global.RealForgeCliSources = Object.freeze({
    SOURCES,
    SOURCE_IDS,
    DENIED_SUBCOMMANDS,
    getSource,
    isAllowed,
    isReadOnlySource
  });
})(typeof window !== "undefined" ? window : globalThis);
