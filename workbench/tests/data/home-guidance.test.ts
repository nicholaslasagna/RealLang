import { describe, expect, it } from "vitest";
import { homeNextStepMessage } from "../../src/features/home/home-guidance";
import { derivePrivateProviderReadiness } from "../../src/providers";

const baseStatus = {
  ok: true,
  configured: false,
  source: "defaults",
  provider_kind: "mock",
  trust: "local_untrusted" as const,
  endpoint_configured: false,
  endpoint_host: null,
  model_configured: false,
  api_key_configured: false,
  image_provider_configured: false,
  image_provider_kind: null,
  image_endpoint_host: null,
  image_provider_execution_enabled: false,
  warnings: [],
  errors: []
};

describe("home guidance copy", () => {
  it("explains web preview limits", () => {
    const readiness = derivePrivateProviderReadiness(null, false);
    expect(homeNextStepMessage(readiness, false, false)).toMatch(/desktop app/i);
  });

  it("suggests setup when provider is not configured", () => {
    const readiness = derivePrivateProviderReadiness(baseStatus, true);
    expect(homeNextStepMessage(readiness, true, false)).toMatch(/home private config/i);
  });

  it("suggests smoke when configured but not verified", () => {
    const readiness = derivePrivateProviderReadiness(
      { ...baseStatus, configured: true, source: "home_private", provider_kind: "openai_compatible_local" },
      true
    );
    expect(homeNextStepMessage(readiness, true, false)).toMatch(/smoke check/i);
  });
});
