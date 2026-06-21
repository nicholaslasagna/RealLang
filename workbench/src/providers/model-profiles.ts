/** Generic model provider profiles — public-safe metadata only (no private identities). */

export type ProviderKind = "mock" | "ollama" | "openai_compatible_local";

export type ModelTrustLevel = "deterministic" | "local_untrusted" | "cloud_untrusted";

export type ProviderConfigStatus = "not_configured" | "configured_locally" | "unavailable";

export interface ModelProviderProfile {
  id: string;
  displayName: string;
  providerKind: ProviderKind;
  defaultBaseUrl: string | null;
  modelNamePlaceholder: string;
  trustLevel: ModelTrustLevel;
  repositoryVisibility: "public_safe";
  storesPrivateIdentityInRepo: false;
  description: string;
}

export const PRIVATE_LOCAL_MODEL_PROFILE: ModelProviderProfile = {
  id: "private-local",
  displayName: "Private Local Model",
  providerKind: "openai_compatible_local",
  defaultBaseUrl: "http://localhost:8000/v1",
  modelNamePlaceholder: "<configured-locally>",
  trustLevel: "local_untrusted",
  repositoryVisibility: "public_safe",
  storesPrivateIdentityInRepo: false,
  description:
    "Connect to a user-served OpenAI-compatible endpoint on localhost. Model identity and secrets belong in gitignored local config."
};

export const MOCK_PROVIDER_PROFILE: ModelProviderProfile = {
  id: "mock",
  displayName: "Deterministic Mock",
  providerKind: "mock",
  defaultBaseUrl: null,
  modelNamePlaceholder: "deterministic",
  trustLevel: "deterministic",
  repositoryVisibility: "public_safe",
  storesPrivateIdentityInRepo: false,
  description: "Offline deterministic adapter for tests and web preview."
};

export const MODEL_PROVIDER_PROFILES: ModelProviderProfile[] = [
  PRIVATE_LOCAL_MODEL_PROFILE,
  MOCK_PROVIDER_PROFILE
];

export function getModelProviderProfile(id: string): ModelProviderProfile | undefined {
  return MODEL_PROVIDER_PROFILES.find((profile) => profile.id === id);
}

export function providerConfigStatusLabel(status: ProviderConfigStatus): string {
  const labels: Record<ProviderConfigStatus, string> = {
    not_configured: "Not configured",
    configured_locally: "Configured locally",
    unavailable: "Unavailable in web preview"
  };
  return labels[status];
}

export function trustLevelLabel(level: ModelTrustLevel): string {
  if (level === "local_untrusted") return "LOCAL UNTRUSTED";
  if (level === "cloud_untrusted") return "CLOUD UNTRUSTED";
  return "DETERMINISTIC";
}
