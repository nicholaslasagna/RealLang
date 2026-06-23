import { create } from "zustand";
import {
  appendApprovalAuditEntry,
  mergeApprovalAuditEntries,
  prepareApprovalAuditEntriesForPersistence,
  sanitizePersistedApprovalAuditEntries,
  type ApprovalAuditEntry
} from "../audit/approval-audit";
import {
  clearApprovalAuditLog,
  isDesktopRuntime,
  loadApprovalAuditLog,
  loadReadOnlyReportSource,
  saveApprovalAuditLog
} from "../bridge";
import { getActionDefinition, getActionForSlashCommand, type CommandActionId } from "../composer/action-model";
import { cliReportSources, getWorkbenchData, reportImport } from "../data/workbench-data";
import type { ImportPreview, WorkbenchLayoutMode, WorkbenchScreen, WorkbenchState } from "./types";

type WorkbenchActions = {
  navigate: (screen: WorkbenchScreen) => void;
  setWorkbenchMode: (mode: WorkbenchLayoutMode) => void;
  setSettingsSection: (section: string) => void;
  toggleSidebar: () => void;
  toggleStaffPreview: () => void;
  openPalette: (query?: string) => void;
  closePalette: () => void;
  setCommandQuery: (query: string) => void;
  previewCommand: (command: string) => void;
  composeActionPreview: (actionId: CommandActionId) => void;
  safePlaceholder: () => void;
  setImportRaw: (raw: string) => void;
  setImportType: (type: string) => void;
  previewImport: () => void;
  clearImport: () => void;
  loadSample: (sampleId: string) => void;
  loadDesktopReport: (sourceId: string) => Promise<boolean>;
  copyCliCommand: (sourceId: string) => void;
  stageTask: (task: string) => void;
  showToast: (message: string, tone?: "safe" | "warn") => void;
  clearToast: () => void;
  computeImportPreview: () => void;
  initializeApprovalAuditHistory: () => Promise<void>;
  clearApprovalAuditHistory: () => Promise<boolean>;
  recordApprovalAuditEntry: (entry: ApprovalAuditEntry) => void;
  setPrivateLocalEndpoint: (endpoint: string) => void;
  setPrivateLocalModelLabel: (modelLabel: string) => void;
  markPrivateLocalConfigured: () => void;
  clearPrivateLocalModelSession: () => void;
};

const initialState: WorkbenchState = {
  screen: "home",
  workbenchMode: "default",
  settingsSection: "general",
  staffPreview: false,
  commandQuery: "",
  sidebarOpen: false,
  operationStatus: "Idle · ready",
  lastCommand: "none · prototype ready",
  stagedTask: "",
  composedActionId: "repair-diagnostic-dry-run",
  importRaw: "",
  importType: "auto",
  importPreview: null,
  paletteOpen: false,
  toast: null,
  desktopLoadStatus: "idle",
  desktopLoadSourceId: null,
  desktopLoadError: null,
  approvalAuditEntries: [],
  approvalAuditHydrated: false,
  approvalAuditStorageStatus: "idle",
  approvalAuditStorageWarning: null,
  privateLocalModel: {
    endpoint: "http://localhost:8000/v1",
    modelLabel: "",
    configured: false
  }
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let auditPersistenceQueue: Promise<void> = Promise.resolve();

function enqueueAuditPersistence(task: () => Promise<void>): Promise<void> {
  const pending = auditPersistenceQueue.then(task, task);
  auditPersistenceQueue = pending.catch(() => undefined);
  return pending;
}

function computePreview(importRaw: string, importType: string, staffPreview: boolean): ImportPreview | null {
  const reportImportApi = reportImport as {
    parseAndAdapt?: (raw: string, type: string, options: { staffMode: boolean }) => ImportPreview;
    getSampleById?: (id: string) => { json: string; label: string } | null;
  };
  if (!reportImportApi.parseAndAdapt || !importRaw.trim()) return null;
  return reportImportApi.parseAndAdapt(importRaw, importType, { staffMode: staffPreview });
}

export const useWorkbenchStore = create<WorkbenchState & WorkbenchActions>((set, get) => ({
  ...initialState,

  navigate: (screen) => {
    const data = getWorkbenchData();
    if (!data.navigation.some((item) => item.id === screen)) return;
    set({ screen, sidebarOpen: false, workbenchMode: screen === "workbench" ? get().workbenchMode : "default" });
    document.title = `RealForge · ${data.navigation.find((item) => item.id === screen)?.label || "Workbench"}`;
  },

  setWorkbenchMode: (mode) => set({ workbenchMode: mode }),

  setSettingsSection: (section) => set({ settingsSection: section, screen: "settings" }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleStaffPreview: () => {
    const staffPreview = !get().staffPreview;
    const importPreview = get().importPreview ? computePreview(get().importRaw, get().importType, staffPreview) : null;
    set({
      staffPreview,
      importPreview,
      operationStatus: staffPreview ? "Staff UI preview · backend remains off" : "Idle · ready"
    });
    get().showToast(
      staffPreview ? "Staff UI preview enabled · backend STAFF OFF" : "Staff preview closed"
    );
  },

  openPalette: (query = "") => set({ paletteOpen: true, commandQuery: query }),

  closePalette: () => set({ paletteOpen: false, commandQuery: "" }),

  setCommandQuery: (query) => set({ commandQuery: query }),

  previewCommand: (command) => {
    const action = getActionForSlashCommand(command);
    set({
      screen: action ? "workbench" : get().screen,
      composedActionId: action?.id ?? get().composedActionId,
      lastCommand: action ? `${action.title} · composed` : `${command} · previewed`,
      operationStatus: action ? "Action composed · preview only · no execution" : "Ready · no command executed",
      paletteOpen: false,
      commandQuery: ""
    });
    get().showToast(
      action ? `${action.title} · preview only · no backend action` : `${command} · preview only · no backend action`
    );
  },

  composeActionPreview: (actionId) => {
    const action = getActionDefinition(actionId);
    if (!action) {
      get().showToast("Unknown composer action", "warn");
      return;
    }
    set({
      screen: "workbench",
      composedActionId: actionId,
      paletteOpen: false,
      commandQuery: "",
      lastCommand: `${action.title} · composed`,
      operationStatus: "Action composed · preview only · no execution"
    });
    get().showToast(`${action.title} · preview only · no backend action`);
  },

  safePlaceholder: () => {
    set({ operationStatus: "Blocked · prototype has no backend actions" });
    get().showToast("Prototype only · no write, process, apply, commit, or merge", "warn");
  },

  setImportRaw: (raw) => set({ importRaw: raw }),

  setImportType: (type) => {
    const state = get();
    const importPreview = state.importRaw.trim()
      ? computePreview(state.importRaw, type, state.staffPreview)
      : state.importPreview;
    set({ importType: type, importPreview });
  },

  computeImportPreview: () => {
    const state = get();
    set({
      importPreview: computePreview(state.importRaw, state.importType, state.staffPreview)
    });
  },

  previewImport: () => {
    const importPreview = computePreview(get().importRaw, get().importType, get().staffPreview);
    set({
      importPreview,
      operationStatus: "Report previewed locally · no backend action",
      lastCommand: "report import · preview only"
    });
    get().showToast("Imported JSON previewed · untrusted · no command executed");
  },

  clearImport: () =>
    set({
      importRaw: "",
      importType: "auto",
      importPreview: null,
      operationStatus: "Idle · ready"
    }),

  loadSample: (sampleId) => {
    const sample = reportImport.getSampleById?.(sampleId) ?? null;
    if (!sample) {
      get().showToast("Sample fixture unavailable", "warn");
      return;
    }
    const importPreview = computePreview(sample.json, "auto", get().staffPreview);
    set({
      importRaw: sample.json,
      importType: "auto",
      importPreview,
      operationStatus: "Sample report loaded · no backend action",
      lastCommand: `sample · ${sample.label}`,
      desktopLoadStatus: "idle",
      desktopLoadError: null
    });
    get().showToast(`Loaded sample: ${sample.label} · untrusted preview`);
  },

  loadDesktopReport: async (sourceId) => {
    set({ desktopLoadStatus: "loading", desktopLoadSourceId: sourceId, desktopLoadError: null });
    const result = await loadReadOnlyReportSource(sourceId);
    if (!result.ok) {
      set({
        desktopLoadStatus: "error",
        desktopLoadError: result.error.message
      });
      get().showToast(result.error.message, "warn");
      return false;
    }
    const { data } = result;
    const importPreview = computePreview(data.stdoutJson, "auto", get().staffPreview);
    set({
      desktopLoadStatus: "idle",
      desktopLoadError: null,
      importRaw: data.stdoutJson,
      importType: "auto",
      importPreview,
      operationStatus: `Desktop bridge loaded · ${data.source.label} · untrusted`,
      lastCommand: `desktop load · ${data.source.displayCommand}`
    });
    get().showToast(`Loaded ${data.source.label} via desktop bridge · untrusted preview`);
    return true;
  },

  copyCliCommand: (sourceId) => {
    const cli = cliReportSources;
    const source = cli?.getSource(sourceId);
    if (!source) {
      get().showToast("Unknown report source", "warn");
      return;
    }
    const displayCommand = String((source as { displayCommand?: string }).displayCommand ?? sourceId);
    const command = `node tools/realforge-report-bridge.mjs load ${sourceId}`;
    const announce = () => {
      set({
        operationStatus: "Bridge command copied · run it, then paste the JSON below",
        lastCommand: `copy · ${displayCommand}`
      });
      get().showToast(`Copied: ${command} · read-only · no backend command executed`);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(command).then(announce).catch(() => {
        get().showToast("Copy unavailable · the command is shown on screen to copy manually", "warn");
      });
    } else {
      announce();
    }
  },

  stageTask: (task) => {
    set({
      stagedTask: task,
      lastCommand: "task staged · no execution",
      operationStatus: "Task staged locally · no writes"
    });
    get().showToast("Task staged in prototype · no backend command executed");
  },

  showToast: (message, tone = "safe") => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: { message, tone } });
    toastTimer = setTimeout(() => {
      set({ toast: null });
      toastTimer = null;
    }, 2600);
  },

  clearToast: () => set({ toast: null }),

  initializeApprovalAuditHistory: async () => {
    const state = get();
    if (state.approvalAuditHydrated || state.approvalAuditStorageStatus === "loading") return;
    if (!isDesktopRuntime()) {
      set({
        approvalAuditHydrated: true,
        approvalAuditStorageStatus: "session_only",
        approvalAuditStorageWarning: null
      });
      return;
    }

    set({ approvalAuditStorageStatus: "loading", approvalAuditStorageWarning: null });
    const result = await loadApprovalAuditLog();
    if (!result.ok) {
      set({
        approvalAuditHydrated: true,
        approvalAuditStorageStatus: "error",
        approvalAuditStorageWarning: result.error.message
      });
      get().showToast("Persisted approval history is unavailable · session log remains active", "warn");
      return;
    }

    const sessionEntries = get().approvalAuditEntries;
    const persisted = sanitizePersistedApprovalAuditEntries(result.data.entries);
    const merged = mergeApprovalAuditEntries(sessionEntries, persisted);
    set({
      approvalAuditEntries: merged,
      approvalAuditHydrated: true,
      approvalAuditStorageStatus: "persisted",
      approvalAuditStorageWarning: result.warning?.message ?? null
    });
    if (result.warning) {
      get().showToast("Persisted approval history was sanitized · review the warning in Reports", "warn");
    }
    if (sessionEntries.some((entry) => !persisted.some((saved) => saved.id === entry.id))) {
      await enqueueAuditPersistence(async () => {
        const saved = await saveApprovalAuditLog(prepareApprovalAuditEntriesForPersistence(merged));
        if (!saved.ok) {
          set({
            approvalAuditStorageStatus: "error",
            approvalAuditStorageWarning: saved.error.message
          });
        }
      });
    }
  },

  clearApprovalAuditHistory: async () => {
    if (!isDesktopRuntime()) {
      set({
        approvalAuditEntries: [],
        approvalAuditStorageStatus: "session_only",
        approvalAuditStorageWarning: null
      });
      return true;
    }

    let cleared = false;
    await enqueueAuditPersistence(async () => {
      const result = await clearApprovalAuditLog();
      if (!result.ok) {
        set({
          approvalAuditStorageStatus: "error",
          approvalAuditStorageWarning: result.error.message
        });
        get().showToast("Could not clear persisted approval history", "warn");
        return;
      }
      cleared = true;
      set({
        approvalAuditEntries: [],
        approvalAuditStorageStatus: "persisted",
        approvalAuditStorageWarning: null,
        operationStatus: "Approval history cleared · app config only"
      });
      get().showToast("Approval history cleared from local app config");
    });
    return cleared;
  },

  recordApprovalAuditEntry: (entry) => {
    let nextEntries: ApprovalAuditEntry[] = [];
    set((state) => {
      nextEntries = appendApprovalAuditEntry(state.approvalAuditEntries, entry);
      return {
        approvalAuditEntries: nextEntries,
        operationStatus: `Approved dry-run · ${entry.status.replace("_", " ")}`,
        lastCommand: `${entry.actionTitle} · ${entry.status.replace("_", " ")}`
      };
    });
    if (!isDesktopRuntime() || !get().approvalAuditHydrated) return;

    void enqueueAuditPersistence(async () => {
      const safeEntries = prepareApprovalAuditEntriesForPersistence(nextEntries);
      const result = await saveApprovalAuditLog(safeEntries);
      if (!result.ok) {
        set({
          approvalAuditStorageStatus: "error",
          approvalAuditStorageWarning: result.error.message
        });
        get().showToast("Approved run recorded for this session, but local persistence failed", "warn");
        return;
      }
      set({
        approvalAuditStorageStatus: "persisted",
        approvalAuditStorageWarning:
          result.droppedEntries > 0
            ? `${result.droppedEntries} invalid audit entries were not persisted.`
            : null
      });
    });
  },

  setPrivateLocalEndpoint: (endpoint) =>
    set((state) => ({
      privateLocalModel: { ...state.privateLocalModel, endpoint: endpoint.trim() }
    })),

  setPrivateLocalModelLabel: (modelLabel) =>
    set((state) => ({
      privateLocalModel: { ...state.privateLocalModel, modelLabel: modelLabel.trim() }
    })),

  markPrivateLocalConfigured: () =>
    set((state) => ({
      privateLocalModel: { ...state.privateLocalModel, configured: true }
    })),

  clearPrivateLocalModelSession: () =>
    set({
      privateLocalModel: {
        endpoint: "http://localhost:8000/v1",
        modelLabel: "",
        configured: false
      }
    })
}));

export function filterCommands(query: string) {
  const data = getWorkbenchData();
  const normalized = query.trim().toLowerCase();
  return data.commands.filter(
    (command) =>
      !normalized ||
      `${command.command} ${command.domain} ${command.description} ${command.safety}`
        .toLowerCase()
        .includes(normalized)
  );
}

function commandTone(command: { staff: boolean; network: boolean; safety: string }) {
  if (command.staff) return "violet";
  if (command.network) return "amber";
  if (command.safety === "READ ONLY") return "cyan";
  if (command.safety === "BENCHMARK") return "green";
  if (command.safety === "DRY RUN" || command.safety === "PLANNING") return "blue";
  return "amber";
}

export { commandTone };
