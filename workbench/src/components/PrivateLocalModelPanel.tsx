import { useCallback, useEffect, useState } from "react";
import { isDesktopRuntime, loadProviderStatus } from "../bridge";
import type { ProviderStatus } from "../bridge";
import { derivePrivateProviderReadiness } from "../providers";
import type { ProviderSmokeSessionStatus } from "../providers";
import { ModelConnectionPicker } from "./ModelConnectionPicker";
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
      <ModelConnectionPicker status={status} loading={loading} desktop={desktop} />
      <ProviderReadinessDashboard
        readiness={readiness}
        loading={loading}
        desktop={desktop}
        onRefreshStatus={() => void refreshStatus()}
      />
      <section className="provider-safe-actions" data-testid="provider-safe-actions" aria-label="Safe provider actions">
        <ProviderSmokeCard onSessionStatusChange={setSmokeSessionStatus} />
        <PrivateChatSandboxCard />
      </section>
      <details className="settings-disclosure provider-advanced" data-testid="provider-advanced-details">
        <summary>Advanced provider details</summary>
        <div className="provider-console__stack">
          <ProviderStatusSummary status={status} loading={loading} desktop={desktop} />
          <PrivateImageProviderCard status={status} desktop={desktop} />
          <ProviderSafetyBoundary readiness={readiness} />
        </div>
      </details>
    </div>
  );
}
