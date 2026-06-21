import type { NavigationItem } from "../state/types";
import { cliReportSources } from "./cli/cli-report-sources";
import { fixtureBundle } from "./fixtures";
import { reportImport } from "./import/report-import";
import { createFixtureViewModels } from "./view-models/workbench-view-models";

export interface WorkbenchMockData {
  version: string;
  workbenchVersion: string;
  navigation: readonly NavigationItem[];
  capabilities: Array<{
    domain: string;
    icon: string;
    status: string;
    safety: string;
    writes: string;
    staff: boolean;
    network: boolean;
    description: string;
    next: string;
  }>;
  commands: Array<{
    command: string;
    domain: string;
    description: string;
    safety: string;
    writes: string;
    staff: boolean;
    network: boolean;
  }>;
  settingsSections: Array<{ id: string; label: string; icon: string }>;
  settings: Record<string, Array<[string, string, string]>>;
  doctor: {
    totals: { pass: number; warn: number; blocked: number };
    checks: Array<{ name: string; detail: string; status: string }>;
  };
  benchmarks: {
    overall: string;
    gate: string;
    tasks: string;
    domains: string[];
    scores: number[];
  };
  updateStages: Array<[string, string]>;
  updateBundle: {
    version: string;
    proposal: { title: string };
    validationSummary: string;
  };
  studio: Record<
    string,
    {
      eyebrow: string;
      title: string;
      description: string;
      accent: string;
      example: [string, string, string, string, string];
      items: Array<[string, string, string, string, string]>;
    }
  >;
}

const navigation: readonly NavigationItem[] = Object.freeze([
  { id: "home", label: "Home", icon: "house", group: "Core" },
  { id: "workbench", label: "Workbench", icon: "square-terminal", group: "Core" },
  { id: "capabilities", label: "Capabilities", icon: "layers", group: "Core" },
  { id: "code", label: "Code", icon: "code-xml", group: "Engineering" },
  { id: "research", label: "Research", icon: "globe", group: "Engineering" },
  { id: "creative", label: "Creative", icon: "drama", group: "Studio" },
  { id: "image", label: "Image", icon: "image", group: "Studio" },
  { id: "vision", label: "Vision", icon: "eye", group: "Studio" },
  { id: "engine", label: "Engine", icon: "box", group: "Studio" },
  { id: "assets", label: "Assets", icon: "package", group: "Studio" },
  { id: "benchmarks", label: "Benchmarks", icon: "gauge", group: "Evaluate" },
  { id: "reports", label: "Reports", icon: "clipboard-list", group: "Evaluate" },
  { id: "security", label: "Security", icon: "shield-alert", group: "Advanced" },
  { id: "updates", label: "Updates", icon: "shield", group: "System" },
  { id: "settings", label: "Settings", icon: "settings", group: "System" }
]);

let cachedMockData: WorkbenchMockData | null = null;

export function ensureMockData(): WorkbenchMockData {
  if (cachedMockData) return cachedMockData;
  const reports = createFixtureViewModels(fixtureBundle, { staffMode: false });
  cachedMockData = Object.freeze({
    ...reports,
    version: "2.7",
    workbenchVersion: "0.12",
    navigation
  }) as WorkbenchMockData;
  return cachedMockData;
}

export function getWorkbenchData(): WorkbenchMockData {
  return ensureMockData();
}

export function parseImportReport(
  raw: string,
  typeChoice: string,
  options: { staffMode: boolean }
) {
  return reportImport.parseAndAdapt(raw, typeChoice, options);
}

export { reportImport, cliReportSources, fixtureBundle, createFixtureViewModels };
