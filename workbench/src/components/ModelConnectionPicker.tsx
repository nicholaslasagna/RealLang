import type { ChangeEvent } from "react";
import type { ProviderStatus } from "../bridge";
import {
  MODEL_PROVIDER_PROFILES,
  trustLevelLabel,
  type ModelProviderProfile
} from "../providers";
import { useWorkbenchStore } from "../state/workbench-store";
import { Badge, Icon } from "./primitives";

interface ModelConnectionPickerProps {
  status: ProviderStatus | null;
  loading: boolean;
  desktop: boolean;
}

function profileTone(profile: ModelProviderProfile, status: ProviderStatus | null, desktop: boolean): "green" | "amber" | "neutral" | "cyan" {
  if (profile.id === "mock") return "cyan";
  if (profile.id === "private-local-image") return "neutral";
  if (!desktop) return "amber";
  if (status?.configured) return "green";
  return "amber";
}

function profileStatus(profile: ModelProviderProfile, status: ProviderStatus | null, desktop: boolean): string {
  if (profile.id === "mock") return "Preview only";
  if (profile.id === "private-local-image") {
    if (!desktop) return "Desktop app";
    return status?.image_provider_configured ? "Ready" : "Set up in file";
  }
  if (!desktop) return "Desktop app required";
  if (status?.configured) return "Configured";
  return "Needs setup";
}

function profileHint(profile: ModelProviderProfile, status: ProviderStatus | null): string {
  if (profile.id === "mock") {
    return "Deterministic preview runtime. It never contacts a model.";
  }
  if (profile.id === "private-local-image") {
    return "ComfyUI or any OpenAI-compatible image server. Configure it in your private file, then generate on the Image screen.";
  }
  if (status?.configured) {
    return "Uses your configured local provider. Exact model identity stays private.";
  }
  return "Connect a user-configured local provider from private home config.";
}

export function ModelConnectionPicker({ status, loading, desktop }: ModelConnectionPickerProps) {
  const selectedModelProfileId = useWorkbenchStore((s) => s.selectedModelProfileId);
  const selectModelProfile = useWorkbenchStore((s) => s.selectModelProfile);
  const privateLocalModel = useWorkbenchStore((s) => s.privateLocalModel);
  const setPrivateLocalEndpoint = useWorkbenchStore((s) => s.setPrivateLocalEndpoint);
  const setPrivateLocalModelLabel = useWorkbenchStore((s) => s.setPrivateLocalModelLabel);
  const showToast = useWorkbenchStore((s) => s.showToast);
  const selectedProfile =
    MODEL_PROVIDER_PROFILES.find((profile) => profile.id === selectedModelProfileId) ??
    MODEL_PROVIDER_PROFILES[0];
  const imageProfile = MODEL_PROVIDER_PROFILES.find((profile) => profile.id === "private-local-image");
  const configuredModelLabel = privateLocalModel.modelLabel || "your-local-model-id";
  const imageEndpoint = imageProfile?.defaultBaseUrl ?? "http://localhost:8188";
  const selectedStatus = loading ? "Checking" : profileStatus(selectedProfile, status, desktop);
  const selectedTone = profileTone(selectedProfile, status, desktop);
  const chatConfigured = desktop && Boolean(status?.configured);
  const imageConfigured = desktop && Boolean(status?.image_provider_configured);

  const handleProfileChange = (event: ChangeEvent<HTMLSelectElement>) => {
    selectModelProfile(event.currentTarget.value);
  };

  const copyTemplate = () => {
    const template = [
      "# Save as ~/.realforge.local.toml",
      "# Keep this file out of git. Do not paste secrets into public issues.",
      "",
      "[provider]",
      'kind = "openai_compatible_local"',
      `base_url = "${privateLocalModel.endpoint || "http://localhost:8000/v1"}"`,
      `model = "${configuredModelLabel}"`,
      'trust = "local_untrusted"',
      "",
      "[image_provider]",
      "# ComfyUI (recommended). Or kind = \"local_image_provider\" for an OpenAI-compatible image server.",
      'kind = "comfyui"',
      `base_url = "${imageEndpoint}"`,
      'workflow_path = "/path/to/workflow_api.json"  # export from ComfyUI (Save API Format); put %prompt% in a text node'
    ].join("\n");

    if (!navigator.clipboard?.writeText) {
      showToast("Clipboard unavailable · copy the template text manually", "warn");
      return;
    }
    void navigator.clipboard
      .writeText(template)
      .then(() => showToast("Private config template copied · save it outside the repo"))
      .catch(() => showToast("Clipboard unavailable · copy the template text manually", "warn"));
  };

  return (
    <section
      className="model-picker"
      data-testid="model-connection-picker"
      aria-labelledby="model-picker-title"
    >
      <header className="model-picker__header">
        <span className="model-picker__icon"><Icon name="cpu" /></span>
        <div>
          <p className="eyebrow">MODEL CONNECTION</p>
          <h2 id="model-picker-title">Model connection</h2>
          <p>Choose what powers the app. Exact model names, endpoints, keys, and paths stay out of the UI.</p>
        </div>
        <Badge label={trustLevelLabel(selectedProfile.trustLevel)} tone={selectedProfile.trustLevel === "deterministic" ? "cyan" : "amber"} />
      </header>

      <div className="model-picker__chooser">
        <label className="model-picker__select-label" htmlFor="model-connection-select">
          <span>Connection</span>
          <select
            id="model-connection-select"
            className="model-picker__select"
            aria-describedby="model-picker-current-hint"
            value={selectedProfile.id}
            onChange={handleProfileChange}
          >
            {MODEL_PROVIDER_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id} disabled={profile.id === "private-local-image"}>
                {profile.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="model-picker__current" data-testid="model-picker-current">
          <span className="model-picker__option-icon" aria-hidden="true">
            <Icon name={selectedProfile.id === "mock" ? "flask-conical" : selectedProfile.id === "private-local-image" ? "image" : "cpu"} />
          </span>
          <span className="model-picker__option-copy">
            <b>{selectedProfile.displayName}</b>
            <small id="model-picker-current-hint">{profileHint(selectedProfile, status)}</small>
          </span>
          <Badge label={selectedStatus} tone={selectedTone} />
        </div>
      </div>

      <div className="model-picker__summary" aria-label="Connection summary">
        <span>
          <Icon name={chatConfigured ? "circle-check" : "triangle-alert"} />
          Chat {chatConfigured ? "configured" : "needs setup"}
        </span>
        <span>
          <Icon name={imageConfigured ? "circle-check" : "image"} />
          Image {imageConfigured ? "configured" : "optional"}
        </span>
        <span>
          <Icon name="shield-check" />
          Approval required
        </span>
        <span>
          <Icon name="hard-drive" />
          Private config only
        </span>
      </div>

      <p className="model-picker__note">
        Selection is session-local UI state. Chat uses <b>Private Local Model</b>; image generation runs from your configured image backend on the Image screen.
      </p>

      <details className="model-setup" data-testid="provider-setup-guide">
        <summary>
          <Icon name="sliders-horizontal" />
          Connect local providers
          <small>private config · no repo writes</small>
        </summary>
        <div className="model-setup__body">
          <p>
            RealForge connects to a running local provider endpoint. It does not scan model folders or inspect
            weights. Save the real endpoint, model name, and any key in your gitignored home private config.
          </p>
          <div className="model-setup__grid">
            <label>
              <span>Chat endpoint preview</span>
              <input
                value={privateLocalModel.endpoint}
                aria-label="Local chat endpoint preview"
                onChange={(event) => setPrivateLocalEndpoint(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>Configured model label</span>
              <input
                value={privateLocalModel.modelLabel}
                aria-label="Configured model label preview"
                placeholder="your-local-model-id"
                onChange={(event) => setPrivateLocalModelLabel(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>Image endpoint preview</span>
              <input
                value={imageEndpoint}
                aria-label="Local image endpoint preview"
                readOnly
              />
            </label>
          </div>
          <div className="model-setup__actions">
            <button type="button" className="button button--secondary" onClick={copyTemplate}>
              <Icon name="clipboard-list" />
              <span>Copy private config template</span>
            </button>
            <small>
              Template only. Workbench never writes <code>~/.realforge.local.toml</code> or stores secrets.
            </small>
          </div>
        </div>
      </details>
    </section>
  );
}
