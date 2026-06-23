import type { ProviderChatSandboxResult, ProviderStatus } from "../../bridge";
import { Button, Icon } from "../../components/primitives";

type ChatReadinessTone = "ready" | "configured" | "blocked" | "neutral";

interface WorkbenchProviderReadinessProps {
  desktop: boolean;
  loading: boolean;
  status: ProviderStatus | null;
  lastResult: ProviderChatSandboxResult | null;
  onOpenSettings: () => void;
}

interface ChatReadinessView {
  title: string;
  detail: string;
  tone: ChatReadinessTone;
}

function safeEndpointLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.includes("localhost") || lower.includes("127.0.0.1") || lower.includes("[::1]")) {
    return "loopback host";
  }
  return "endpoint host configured";
}

function resultReadiness(result: ProviderChatSandboxResult | null): ChatReadinessView | null {
  if (!result) return null;
  if (!result.ok) {
    if (result.error.code === "unsupported_web") {
      return {
        title: "Desktop only",
        detail: "Open the desktop app to use the configured local provider.",
        tone: "neutral"
      };
    }
    return {
      title: "Local provider not reachable",
      detail:
        "Open Settings → Local model to check provider status. Make sure your local OpenAI-compatible server is running. Then run a smoke check.",
      tone: "blocked"
    };
  }
  if (result.data.status === "pass") {
    return {
      title: "Local provider ready",
      detail: "The last local chat request succeeded. Output remains local_untrusted.",
      tone: "ready"
    };
  }
  if (result.data.status === "not_configured") {
    return {
      title: "Local provider not configured",
      detail: "Open Settings → Local model to check provider status before trying chat again.",
      tone: "blocked"
    };
  }
  return {
    title: "Local provider not reachable",
    detail:
      "Open Settings → Local model to check provider status. Make sure your local OpenAI-compatible server is running. Then run a smoke check.",
    tone: "blocked"
  };
}

function statusReadiness(desktop: boolean, loading: boolean, status: ProviderStatus | null): ChatReadinessView {
  if (!desktop) {
    return {
      title: "Desktop only",
      detail: "Web preview is execution-free. Open the desktop app to use the configured local provider.",
      tone: "neutral"
    };
  }
  if (loading && !status) {
    return {
      title: "Local provider configured, not verified",
      detail: "Checking sanitized local-provider status.",
      tone: "configured"
    };
  }
  if (status && (!status.ok || status.errors.length > 0)) {
    return {
      title: "Local provider not reachable",
      detail: "Open Settings → Local model to review sanitized provider status, then run a smoke check.",
      tone: "blocked"
    };
  }
  if (status?.configured) {
    const endpoint = safeEndpointLabel(status.endpoint_host);
    return {
      title: "Local provider configured, not verified",
      detail: endpoint
        ? `Sanitized status found a configured ${endpoint}. Run a smoke check if chat fails.`
        : "Sanitized status is configured. Run a smoke check if chat fails.",
      tone: "configured"
    };
  }
  return {
    title: "Local provider not configured",
    detail: "Open Settings → Local model to configure a private local provider. Secrets stay outside the repo.",
    tone: "blocked"
  };
}

export function WorkbenchProviderReadiness({
  desktop,
  loading,
  status,
  lastResult,
  onOpenSettings
}: WorkbenchProviderReadinessProps) {
  const view = resultReadiness(lastResult) ?? statusReadiness(desktop, loading, status);

  return (
    <section
      className={`chat-provider-readiness chat-provider-readiness--${view.tone}`}
      data-testid="chat-provider-readiness"
      aria-label="Local provider readiness"
    >
      <span className="chat-provider-readiness__icon" aria-hidden="true">
        <Icon name={view.tone === "ready" ? "circle-check" : view.tone === "blocked" ? "triangle-alert" : "activity"} />
      </span>
      <span className="chat-provider-readiness__copy">
        <b>{view.title}</b>
        <small>{view.detail}</small>
        <small>Preview runtime is mock; Chat uses the configured local provider.</small>
      </span>
      <Button
        label="Local model settings"
        iconName="settings"
        variant="ghost"
        onClick={onOpenSettings}
      />
    </section>
  );
}
