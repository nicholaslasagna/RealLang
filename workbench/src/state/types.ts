import type { CommandActionId } from "../composer/action-model";

export type WorkbenchScreen =
  | "home"
  | "workbench"
  | "capabilities"
  | "code"
  | "research"
  | "creative"
  | "image"
  | "vision"
  | "engine"
  | "assets"
  | "benchmarks"
  | "reports"
  | "security"
  | "updates"
  | "settings";

export interface NavigationItem {
  id: WorkbenchScreen;
  label: string;
  icon: string;
  group: string;
}

export interface ImportPreview {
  parseError?: boolean;
  error?: string;
  empty?: boolean;
  ok?: boolean;
  selectionMode?: string;
  typeId?: string;
  label?: string;
  meta?: {
    status?: string;
    kind?: string;
    id?: string;
    provider?: string;
    model?: string;
  };
  safetyLabels?: string[];
  hasProvider?: boolean;
  claimedValidated?: boolean;
  untrusted?: boolean;
  reviewOnly?: boolean;
  gated?: boolean;
  staffOnly?: boolean;
  approvalRequired?: boolean;
  dryRun?: boolean;
  generic?: boolean;
  reason?: string;
  mismatch?: { detectedLabel: string; selectedLabel: string };
  fields?: ImportField[];
  suggestedCommands?: string[];
  suggestedCommandsMore?: number;
  warnings?: { path: string; code: string; message: string }[];
}

export interface ImportField {
  label: string;
  type: string;
  value: unknown;
  moreCount?: number;
  truncatedChars?: number;
}

export type DesktopLoadStatus = "idle" | "loading" | "error";

export interface WorkbenchState {
  screen: WorkbenchScreen;
  settingsSection: string;
  staffPreview: boolean;
  commandQuery: string;
  sidebarOpen: boolean;
  operationStatus: string;
  lastCommand: string;
  stagedTask: string;
  composedActionId: CommandActionId;
  importRaw: string;
  importType: string;
  importPreview: ImportPreview | null;
  paletteOpen: boolean;
  toast: { message: string; tone: "safe" | "warn" } | null;
  desktopLoadStatus: DesktopLoadStatus;
  desktopLoadSourceId: string | null;
  desktopLoadError: string | null;
}
