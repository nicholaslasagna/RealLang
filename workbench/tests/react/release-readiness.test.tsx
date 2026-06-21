import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReleaseReadinessPanel } from "../../src/features/updates/ReleaseReadinessPanel";
import {
  RELEASE_VALIDATION_COMMANDS,
  buildReleaseChecklist,
  summarizeReleaseReadiness
} from "../../src/data/release/release-readiness";

afterEach(() => {
  cleanup();
});

const baseInput = {
  workbenchVersion: "0.16.0",
  expectedVersion: "0.16.0",
  updaterPublicKeyConfigured: false,
  updaterEndpointConfigured: false
};

describe("release readiness model (0.17)", () => {
  it("produces an honest 15-item checklist", () => {
    const items = buildReleaseChecklist(baseInput);
    expect(items.length).toBe(15);
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    expect(byId.version_aligned.status).toBe("pass");
    // Signing/notarization must never be pass when not configured.
    expect(byId.macos_signing.status).toBe("deferred");
    expect(byId.macos_notarization.status).toBe("deferred");
    expect(byId.windows_signing.status).toBe("deferred");
    // Updater + artifacts default missing.
    expect(byId.updater_public_key.status).toBe("missing");
    expect(byId.updater_endpoint.status).toBe("missing");
    expect(byId.signed_artifact.status).toBe("missing");
    expect(byId.install_verified.status).toBe("missing");
    expect(items.some((item) => item.status === "pass" && /sign|notariz|updater|install/i.test(item.label))).toBe(false);
  });

  it("flags version drift as warn", () => {
    const items = buildReleaseChecklist({ ...baseInput, workbenchVersion: "0.12.0" });
    expect(items.find((i) => i.id === "version_aligned")?.status).toBe("warn");
  });

  it("only marks updater items pass when configured", () => {
    const items = buildReleaseChecklist({
      ...baseInput,
      updaterPublicKeyConfigured: true,
      updaterEndpointConfigured: true
    });
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    expect(byId.updater_public_key.status).toBe("pass");
    expect(byId.updater_endpoint.status).toBe("pass");
    // Even with the updater configured, stable is not ready (signing deferred, no artifact).
    const summary = summarizeReleaseReadiness(items);
    expect(summary.readyForStable).toBe(false);
  });

  it("never reports stable-ready by default", () => {
    const summary = summarizeReleaseReadiness(buildReleaseChecklist(baseInput));
    expect(summary.total).toBe(15);
    expect(summary.readyForStable).toBe(false);
    expect(summary.deferred).toBe(3);
    expect(summary.missing).toBeGreaterThanOrEqual(5);
  });
});

describe("ReleaseReadinessPanel", () => {
  it("renders missing updater state and never claims a fake release", () => {
    render(<ReleaseReadinessPanel currentVersion="0.16.0" publicKeyConfigured={false} endpointConfigured={false} />);
    const panel = screen.getByTestId("update-release-checklist");
    expect(within(panel).getByText("Updater public key configured")).toBeInTheDocument();
    expect(within(panel).getByText("Updater endpoint configured")).toBeInTheDocument();
    expect(within(panel).getAllByText("MISSING").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("DEFERRED").length).toBe(3);
    // No install/apply/run button exists in the readiness panel.
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("shows the unsigned + private-key safety statements", () => {
    render(<ReleaseReadinessPanel currentVersion="0.16.0" publicKeyConfigured={false} endpointConfigured={false} />);
    const panel = screen.getByTestId("update-release-checklist");
    expect(within(panel).getByText(/No unsigned updates will be installed/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Private signing keys are never stored/i)).toBeInTheDocument();
  });

  it("shows validation commands as display-only (not run by UI)", () => {
    render(<ReleaseReadinessPanel currentVersion="0.16.0" publicKeyConfigured={false} endpointConfigured={false} />);
    const panel = screen.getByTestId("update-release-checklist");
    expect(within(panel).getByText(/NOT RUN BY UI/i)).toBeInTheDocument();
    for (const command of RELEASE_VALIDATION_COMMANDS) {
      expect(within(panel).getByText(command)).toBeInTheDocument();
    }
  });
});
