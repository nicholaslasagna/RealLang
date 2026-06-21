// Allowlist of read-only RealForge CLI report sources for Workbench 0.4.
//
// Single source of truth shared by the browser UI (read-only catalog) and the
// local Node bridge (workbench/tools/realforge-report-bridge.mjs).
//
// Hard rules for every entry:
//   * `argv` is a FIXED argument array, never a shell string.
//   * Only read-only commands that print JSON to stdout. No writes, no network,
//     no apply, no scheduler, no staff execution, no file mutation, no args
//     supplied by a user.
//   * Loaded output is untrusted import data until adapted by the import pipeline.

/** One allowlisted read-only CLI report source. */
export interface CliReportSource {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly argv: readonly string[];
  readonly displayCommand: string;
  readonly detectType: string;
  readonly readOnly: true;
  readonly writes: false;
  readonly network: false;
  readonly staff: false;
  readonly apply: false;
}

export interface CliReportSourcesApi {
  readonly SOURCES: readonly CliReportSource[];
  readonly SOURCE_IDS: readonly string[];
  readonly DENIED_SUBCOMMANDS: readonly string[];
  getSource(id: string): CliReportSource | null;
  isAllowed(id: string): boolean;
  isReadOnlySource(source: unknown): source is CliReportSource;
}

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
]) as readonly CliReportSource[];

const SOURCE_IDS = Object.freeze(SOURCES.map((source) => source.id));

const DENIED_SUBCOMMANDS = Object.freeze([
  "repair",
  "generate",
  "improve",
  "propose-patch",
  "experiment",
  "propose-merge",
  "apply-proposal",
  "cycle",
  "research",
  "scheduler-run",
  "improve-channel",
  "update-bundle",
  "update-check",
  "index"
]);

function getSource(id: string): CliReportSource | null {
  return SOURCES.find((source) => source.id === id) ?? null;
}

function isAllowed(id: string): boolean {
  return SOURCE_IDS.includes(id);
}

function isReadOnlySource(source: unknown): source is CliReportSource {
  if (!source || typeof source !== "object") return false;
  const entry = source as Record<string, unknown>;
  if (entry.readOnly !== true) return false;
  if (entry.writes === true || entry.staff === true || entry.apply === true || entry.network === true) return false;
  if (!Array.isArray(entry.argv) || entry.argv.length === 0) return false;
  if (!entry.argv.every((token): token is string => typeof token === "string" && token.length > 0)) return false;
  if (typeof entry.argv[0] === "string" && DENIED_SUBCOMMANDS.includes(entry.argv[0])) return false;
  return true;
}

export const cliReportSources: CliReportSourcesApi = Object.freeze({
  SOURCES,
  SOURCE_IDS,
  DENIED_SUBCOMMANDS,
  getSource,
  isAllowed,
  isReadOnlySource
});
