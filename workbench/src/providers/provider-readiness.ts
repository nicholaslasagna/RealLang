import type { ProviderStatus } from "../bridge";

export type ProviderSmokeSessionStatus =
  | "not_run"
  | "pass"
  | "fail"
  | "not_configured"
  | "unavailable";

export type ProviderOverallReadiness =
  | "not_configured"
  | "configured"
  | "reachable"
  | "sandbox_ready"
  | "error";

export interface ProviderChatSandboxLimits {
  maxPromptChars: 2_000;
  maxResponseChars: 4_096;
  timeoutMs: 25_000;
  singleTurn: true;
}

/** Public-safe readiness data derived only from the sanitized provider report. */
export interface PrivateProviderReadiness {
  configDetected: boolean;
  statusAvailable: boolean;
  providerKind: "openai_compatible_local" | "mock" | null;
  trust: "local_untrusted";
  endpointConfigured: boolean;
  modelConfigured: boolean;
  apiKeyConfigured: boolean;
  smokeAvailable: boolean;
  smokeLastStatus: ProviderSmokeSessionStatus;
  chatSandboxAvailable: boolean;
  chatSandboxLimits: ProviderChatSandboxLimits;
  imageProviderConfigured: boolean;
  imageProviderExecutionEnabled: false;
  workspaceContextEnabled: false;
  fileAccessEnabled: false;
  toolsEnabled: false;
  shellEnabled: false;
  memoryEnabled: false;
  persistenceEnabled: false;
  imageGenerationEnabled: false;
  overallReadiness: ProviderOverallReadiness;
}

const CHAT_SANDBOX_LIMITS: ProviderChatSandboxLimits = {
  maxPromptChars: 2_000,
  maxResponseChars: 4_096,
  timeoutMs: 25_000,
  singleTurn: true
};

function safeProviderKind(value: string | null | undefined): PrivateProviderReadiness["providerKind"] {
  if (value === "openai_compatible_local" || value === "mock") return value;
  return null;
}

function overallReadiness(
  status: ProviderStatus | null,
  smokeLastStatus: ProviderSmokeSessionStatus,
  chatSandboxAvailable: boolean
): ProviderOverallReadiness {
  if (status && (!status.ok || (status.errors?.length ?? 0) > 0)) return "error";
  if (!status?.configured || smokeLastStatus === "not_configured") return "not_configured";
  if (smokeLastStatus === "fail") return "error";
  if (smokeLastStatus === "pass") {
    return chatSandboxAvailable ? "sandbox_ready" : "reachable";
  }
  return "configured";
}

export function derivePrivateProviderReadiness(
  status: ProviderStatus | null,
  desktopAvailable: boolean,
  smokeLastStatus: ProviderSmokeSessionStatus = "not_run"
): PrivateProviderReadiness {
  const chatSandboxAvailable = desktopAvailable && Boolean(status?.configured);
  return {
    configDetected: status?.source === "home_private",
    statusAvailable: status !== null,
    providerKind: safeProviderKind(status?.provider_kind),
    trust: "local_untrusted",
    endpointConfigured: Boolean(status?.endpoint_configured),
    modelConfigured: Boolean(status?.model_configured),
    apiKeyConfigured: Boolean(status?.api_key_configured),
    smokeAvailable: desktopAvailable,
    smokeLastStatus,
    chatSandboxAvailable,
    chatSandboxLimits: CHAT_SANDBOX_LIMITS,
    imageProviderConfigured: Boolean(status?.image_provider_configured),
    imageProviderExecutionEnabled: false,
    workspaceContextEnabled: false,
    fileAccessEnabled: false,
    toolsEnabled: false,
    shellEnabled: false,
    memoryEnabled: false,
    persistenceEnabled: false,
    imageGenerationEnabled: false,
    overallReadiness: overallReadiness(status, smokeLastStatus, chatSandboxAvailable)
  };
}

export function providerReadinessLabel(value: ProviderOverallReadiness): string {
  const labels: Record<ProviderOverallReadiness, string> = {
    not_configured: "Not configured",
    configured: "Configured",
    reachable: "Reachable",
    sandbox_ready: "Sandbox ready",
    error: "Needs attention"
  };
  return labels[value];
}
