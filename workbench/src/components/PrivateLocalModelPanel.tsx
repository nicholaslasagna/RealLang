import { useCallback, useEffect, useState } from "react";
import { isDesktopRuntime, loadProviderStatus } from "../bridge";
import type { ProviderStatus } from "../bridge";
import { derivePrivateProviderReadiness } from "../providers";
import type { ProviderSmokeSessionStatus } from "../providers";
import { PrivateChatSandboxCard } from "./PrivateChatSandboxCard";
import { PrivateImageProviderCard } from "./PrivateImageProviderCard";
import { ProviderReadinessDashboard } from "./ProviderReadinessDashboard";
import { ProviderSafetyBoundary } from "./ProviderSafetyBoundary";
import { ProviderSmokeCard } from "./ProviderSmokeCard";
import { ProviderStatusSummary } from "./ProviderStatusSummary";

export function PrivateLocalModelPanel() {
  const desktop = isDesktopRuntime();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(desktop);
  const [smokeSessionStatus, setSmokeSessionStatus] = useState<ProviderSmokeSessionStatus>("not_run");

  const refreshStatus = useCallback(async () => {
    if (!desktop) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setStatus(await loadProviderStatus());
    setLoading(false);
  }, [desktop]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const readiness = derivePrivateProviderReadiness(status, desktop, smokeSessionStatus);

  return (
    <div className="private-local-model provider-console" data-testid="private-local-model-panel">
      <ProviderReadinessDashboard
        readiness={readiness}
        loading={loading}
        desktop={desktop}
        onRefreshStatus={() => void refreshStatus()}
      />
      <ProviderStatusSummary status={status} loading={loading} desktop={desktop} />
      <ProviderSmokeCard onSessionStatusChange={setSmokeSessionStatus} />
      <PrivateChatSandboxCard />
      <PrivateImageProviderCard status={status} desktop={desktop} />
      <ProviderSafetyBoundary readiness={readiness} />
    </div>
  );
}
