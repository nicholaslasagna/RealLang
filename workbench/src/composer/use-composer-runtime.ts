import { useEffect, useState } from "react";
import { checkBridgeHealth, isDesktopRuntime, listReadOnlyReportSources } from "../bridge";
import { cliReportSources } from "../data/cli/cli-report-sources";
import type { ComposerRuntimeContext } from "./action-model";

export interface ComposerRuntimeState extends ComposerRuntimeContext {
  loading: boolean;
  error: string | null;
  workspacePath: string | null;
}

function initialRuntime(staffMode: boolean): ComposerRuntimeState {
  const desktop = isDesktopRuntime();
  return {
    runtime: desktop ? "desktop" : "web",
    bridgeHealthy: false,
    staffMode,
    allowlistedSourceIds: cliReportSources.SOURCE_IDS,
    loading: desktop,
    error: null,
    workspacePath: null
  };
}

export function useComposerRuntime(staffMode: boolean): ComposerRuntimeState {
  const [runtime, setRuntime] = useState<ComposerRuntimeState>(() => initialRuntime(staffMode));

  useEffect(() => {
    let active = true;
    const desktop = isDesktopRuntime();
    if (!desktop) {
      setRuntime({
        runtime: "web",
        bridgeHealthy: false,
        staffMode,
        allowlistedSourceIds: cliReportSources.SOURCE_IDS,
        loading: false,
        error: null,
        workspacePath: null
      });
      return () => {
        active = false;
      };
    }

    setRuntime((current) => ({ ...current, runtime: "desktop", staffMode, loading: true, error: null }));
    Promise.all([checkBridgeHealth(), listReadOnlyReportSources()])
      .then(([health, sources]) => {
        if (!active) return;
        setRuntime({
          runtime: "desktop",
          bridgeHealthy: health.healthy && health.resolution.bridgeMode === "read-only",
          staffMode,
          allowlistedSourceIds: sources.filter((source) => source.readOnly).map((source) => source.id),
          loading: false,
          error: null,
          workspacePath: health.resolution.repoRoot
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRuntime({
          runtime: "desktop",
          bridgeHealthy: false,
          staffMode,
          allowlistedSourceIds: [],
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          workspacePath: null
        });
      });

    return () => {
      active = false;
    };
  }, [staffMode]);

  return runtime;
}
