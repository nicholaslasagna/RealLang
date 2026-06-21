import capabilities from "./capabilities.json";
import doctorStatus from "./doctor-status.json";
import settings from "./settings.json";
import skillBenchmark from "./skill-benchmark.json";
import slashCommands from "./slash-commands.json";
import studioReports from "./studio-reports.json";
import updateBundle from "./update-bundle.json";

export interface FixtureBundle {
  capabilities: typeof capabilities;
  doctorStatus: typeof doctorStatus;
  settings: typeof settings;
  skillBenchmark: typeof skillBenchmark;
  slashCommands: typeof slashCommands;
  studioReports: typeof studioReports;
  updateBundle: typeof updateBundle;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as object).forEach(deepFreeze);
  return Object.freeze(value);
}

export const fixtureBundle = deepFreeze({
  capabilities,
  doctorStatus,
  settings,
  skillBenchmark,
  slashCommands,
  studioReports,
  updateBundle
}) as FixtureBundle;

export type { FixtureBundle as RealForgeFixtureData };
