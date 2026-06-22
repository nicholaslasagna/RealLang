import { describe, expect, it } from "vitest";
import type { ProviderStatus } from "../../src/bridge";
import { derivePrivateProviderReadiness } from "../../src/providers";

const configuredStatus: ProviderStatus = {
  ok: true,
  configured: true,
  source: "home_private",
  provider_kind: "openai_compatible_local",
  trust: "local_untrusted",
  endpoint_configured: true,
  endpoint_host: "http://localhost:8000",
  model_configured: true,
  api_key_configured: true,
  image_provider_configured: true,
  image_provider_kind: "local_image_provider",
  image_endpoint_host: "http://localhost:8188",
  image_provider_execution_enabled: false,
  warnings: [],
  errors: []
};

describe("private provider readiness", () => {
  it("derives configured state from sanitized provider booleans only", () => {
    const readiness = derivePrivateProviderReadiness(configuredStatus, true);
    expect(readiness).toMatchObject({
      configDetected: true,
      providerKind: "openai_compatible_local",
      trust: "local_untrusted",
      endpointConfigured: true,
      modelConfigured: true,
      apiKeyConfigured: true,
      smokeAvailable: true,
      smokeLastStatus: "not_run",
      chatSandboxAvailable: true,
      imageProviderConfigured: true,
      imageProviderExecutionEnabled: false,
      overallReadiness: "configured"
    });
  });

  it("uses only session smoke metadata to advance readiness", () => {
    expect(derivePrivateProviderReadiness(configuredStatus, true, "pass").overallReadiness).toBe(
      "sandbox_ready"
    );
    expect(derivePrivateProviderReadiness(configuredStatus, true, "fail").overallReadiness).toBe(
      "error"
    );
  });

  it("keeps every disconnected capability off", () => {
    const readiness = derivePrivateProviderReadiness(configuredStatus, true, "pass");
    expect(readiness.workspaceContextEnabled).toBe(false);
    expect(readiness.fileAccessEnabled).toBe(false);
    expect(readiness.toolsEnabled).toBe(false);
    expect(readiness.shellEnabled).toBe(false);
    expect(readiness.memoryEnabled).toBe(false);
    expect(readiness.persistenceEnabled).toBe(false);
    expect(readiness.imageGenerationEnabled).toBe(false);
  });

  it("drops unexpected identity fields and never enables image execution", () => {
    const unsafeInput = {
      ...configuredStatus,
      provider_kind: "unknown-private-provider",
      image_provider_execution_enabled: true,
      api_key: "secret-value",
      model: "private-identity",
      model_path: "/private/path"
    } as ProviderStatus;
    const serialized = JSON.stringify(derivePrivateProviderReadiness(unsafeInput, true));
    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("private-identity");
    expect(serialized).not.toContain("/private/path");
    expect(serialized).not.toContain("unknown-private-provider");
    expect(derivePrivateProviderReadiness(unsafeInput, true).imageProviderExecutionEnabled).toBe(false);
  });

  it("keeps web mode execution-free", () => {
    const readiness = derivePrivateProviderReadiness(configuredStatus, false, "not_run");
    expect(readiness.smokeAvailable).toBe(false);
    expect(readiness.chatSandboxAvailable).toBe(false);
    expect(readiness.overallReadiness).toBe("configured");
  });
});
