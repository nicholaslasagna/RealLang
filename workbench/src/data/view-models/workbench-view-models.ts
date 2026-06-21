import { reportAdapters } from "../adapters/report-adapters";
import type { AdapterResult, AdapterWarning, CapabilityEntry, ReportMeta, SlashCommandEntry } from "../contracts/report-contracts";
import type { FixtureBundle } from "../fixtures";

const adapters = reportAdapters;

type AdapterOutcome = AdapterResult<ReportMeta & Record<string, unknown>>;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as object).forEach(deepFreeze);
  return Object.freeze(value);
}

export interface ViewModelOptions {
  staffMode?: boolean;
}

export interface CapabilityViewModel {
  domain: string;
  icon: string;
  status: string;
  safety: string;
  writes: string;
  staff: boolean;
  network: boolean;
  description: string;
  next: string;
}

export interface CommandViewModel {
  command: string;
  domain: string;
  description: string;
  safety: string;
  writes: string;
  staff: boolean;
  network: boolean;
}

export interface BenchmarkViewModel {
  overall: string;
  gate: string;
  tasks: string;
  domains: string[];
  scores: number[];
  reportId: string;
  safetyLabels: string[];
}

export interface StudioPresentation {
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  example: [string, string, string, string, string];
  items: Array<[string, string, string, string, string]>;
}

export interface AdapterWarningWithSource extends AdapterWarning {
  source: string;
}

export interface FixtureViewModels {
  capabilities: CapabilityViewModel[];
  commands: CommandViewModel[];
  settingsSections: Array<{ id: string; label: string; icon: string }>;
  settings: Record<string, Array<[string, string, string]>>;
  doctor: ReportMeta & { checks: Array<{ name: string; detail: string; status: string }>; totals: { pass: number; warn: number; blocked: number } };
  benchmarks: BenchmarkViewModel;
  updateStages: Array<[string, string]>;
  updateBundle: ReportMeta & { version: string; proposal: { title: string }; stages: Array<{ title: string; description: string }>; validationSummary: string };
  studio: Record<string, StudioPresentation>;
  studioReports: Record<string, ReportMeta & Record<string, unknown>>;
  adapterWarnings: AdapterWarningWithSource[];
}

function collectWarnings(
  results: Array<[string, { warnings: AdapterWarning[] }]>
): AdapterWarningWithSource[] {
  return results.flatMap(([source, adapterResult]) =>
    adapterResult.warnings.map((item) => ({ source, ...item }))
  );
}

export function createFixtureViewModels(fixtures: FixtureBundle, options: ViewModelOptions = {}): FixtureViewModels {
  const capabilityResult = adapters.adaptCapabilityRegistry(fixtures.capabilities) as AdapterOutcome & {
    data: { capabilities: CapabilityEntry[] };
  };
  const commandResult = adapters.adaptSlashCommandRegistry(fixtures.slashCommands) as AdapterOutcome & {
    data: { commands: SlashCommandEntry[] };
  };
  const settingsResult = adapters.adaptSettingsSummary(fixtures.settings) as AdapterOutcome & {
    data: { sections: Array<{ id: string; label: string; icon: string; values: Array<{ label: string; value: string; note: string }> }> };
  };
  const doctorResult = adapters.adaptDoctorSummary(fixtures.doctorStatus) as AdapterOutcome & {
    data: FixtureViewModels["doctor"];
  };
  const skillResult = adapters.adaptSkillBenchmarkReport(fixtures.skillBenchmark) as AdapterOutcome & {
    data: { overall: number; gate: number; taskCount: number; domains: Array<{ domain: string; score: number }>; id: string; safetyLabels: string[] };
  };
  const updateResult = adapters.adaptUpdateBundle(fixtures.updateBundle, { staffMode: options.staffMode === true }) as AdapterOutcome & {
    data: FixtureViewModels["updateBundle"];
  };
  const studioSource = fixtures.studioReports;
  const studioResults = {
    creative: adapters.adaptCreativeBrief(studioSource.creative?.report) as AdapterOutcome,
    image: adapters.adaptImageJob(studioSource.image?.report) as AdapterOutcome,
    vision: adapters.adaptVisionReport(studioSource.vision?.report) as AdapterOutcome,
    engine: adapters.adaptEngineProjectProfile(studioSource.engine?.report) as AdapterOutcome,
    assets: adapters.adaptAssetPipelinePlan(studioSource.assets?.report) as AdapterOutcome
  };

  const settingsSections = settingsResult.data.sections.map((section) => ({
    id: section.id,
    label: section.label,
    icon: section.icon
  }));
  const settings = Object.fromEntries(
    settingsResult.data.sections.map((section) => [
      section.id,
      section.values.map((entry) => [entry.label, entry.value, entry.note] as [string, string, string])
    ])
  );
  const studio = Object.fromEntries(
    Object.entries(studioSource).map(([domain, entry]) => [domain, entry.presentation])
  ) as Record<string, StudioPresentation>;

  const results: Array<[string, { warnings: AdapterWarning[] }]> = [
    ["capabilities", capabilityResult],
    ["slashCommands", commandResult],
    ["settings", settingsResult],
    ["doctorStatus", doctorResult],
    ["skillBenchmark", skillResult],
    ["updateBundle", updateResult],
    ...Object.entries(studioResults).map(([domain, adapterResult]) => [`studio.${domain}`, adapterResult] as [string, { warnings: AdapterWarning[] }])
  ];

  return deepFreeze({
    capabilities: capabilityResult.data.capabilities.map((capability) => ({
      domain: capability.domain,
      icon: capability.icon,
      status: capability.status,
      safety: capability.safety,
      writes: capability.writes,
      staff: capability.staffRequired,
      network: capability.networkRequired,
      description: capability.description,
      next: capability.suggestedCommand
    })),
    commands: commandResult.data.commands.map((command) => ({
      command: command.command,
      domain: command.domain,
      description: command.description,
      safety: command.safety,
      writes: command.writes,
      staff: command.staffOnly,
      network: command.networkRequired
    })),
    settingsSections,
    settings,
    doctor: doctorResult.data,
    benchmarks: {
      overall: skillResult.data.overall.toFixed(2),
      gate: skillResult.data.gate.toFixed(2),
      tasks: String(skillResult.data.taskCount),
      domains: skillResult.data.domains.map((entry) => entry.domain),
      scores: skillResult.data.domains.map((entry) => entry.score),
      reportId: skillResult.data.id,
      safetyLabels: skillResult.data.safetyLabels
    },
    updateStages: updateResult.data.stages.map((stage) => [stage.title, stage.description]),
    updateBundle: updateResult.data,
    studio,
    studioReports: Object.fromEntries(
      Object.entries(studioResults).map(([domain, adapterResult]) => [domain, adapterResult.data])
    ),
    adapterWarnings: collectWarnings(results)
  }) as FixtureViewModels;
}

export const viewModels = Object.freeze({ createFixtureViewModels });
