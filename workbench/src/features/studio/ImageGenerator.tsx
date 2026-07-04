import { useEffect, useRef, useState } from "react";
import {
  isDesktopRuntime,
  loadProviderStatus,
  runPrivateProviderImageGen,
  type ProviderImageGenResult,
  type ProviderStatus
} from "../../bridge";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon } from "../../components/primitives";

// Mirrors the Rust/backend prompt cap. Defense in depth: the bridge validates too.
const MAX_PROMPT_CHARS = 2_000;

function errorTitle(code: string): string {
  if (code === "unsupported_web") return "Desktop app required";
  if (code === "not_configured") return "Image provider not configured";
  if (code === "timeout") return "Generation timed out";
  if (code.startsWith("workflow")) return "ComfyUI workflow needs setup";
  return "Image generation failed";
}

function errorGuidance(code: string): string {
  switch (code) {
    case "unsupported_web":
      return "Open the desktop app to generate images.";
    case "not_configured":
      return "Add an [image_provider] block to ~/.realforge.local.toml (ComfyUI or an OpenAI-compatible image server), then reopen this screen.";
    case "workflow_no_placeholder":
      return "Your ComfyUI workflow must contain the token %prompt% in its positive text node.";
    case "invalid_workflow":
      return "The ComfyUI workflow is not valid JSON. Re-export it with ComfyUI → Save (API Format).";
    case "workflow_missing":
      return "The configured workflow file could not be read. Check workflow_path in your config.";
    case "workflow_too_large":
      return "The configured workflow file is too large.";
    case "image_too_large":
      return "The generated image exceeded the sandbox size limit.";
    case "timeout":
      return "Make sure your local image server is running and the model is loaded, then try again.";
    default:
      return "Make sure your local image server is running, then try again. Output is never trusted.";
  }
}

/**
 * Real, approval-gated local image generation. One bounded prompt → the user's
 * configured local backend (ComfyUI or OpenAI-compatible) → one PNG shown as
 * LOCAL UNTRUSTED. Session-only: nothing is persisted, audited, or auto-saved.
 */
export function ImageGenerator() {
  const desktop = isDesktopRuntime();
  const navigate = useWorkbenchStore((s) => s.navigate);
  const setSettingsSection = useWorkbenchStore((s) => s.setSettingsSection);
  const [prompt, setPrompt] = useState("");
  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProviderImageGenResult | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    setStatusLoading(true);
    void loadProviderStatus()
      .then((next) => {
        if (active) setStatus(next);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [desktop]);

  const configured = status?.image_provider_configured ?? false;
  const trimmed = prompt.trim();
  const canGenerate = desktop && configured && approved && trimmed.length > 0 && !running;

  const generate = async () => {
    if (!canGenerate) return;
    setRunning(true);
    setResult(null);
    const res = await runPrivateProviderImageGen({ prompt: trimmed, approvalAcknowledged: true });
    setResult(res);
    setRunning(false);
    setApproved(false); // re-approval required per send
  };

  const openImageSettings = () => {
    setSettingsSection("provider");
    navigate("settings");
  };

  const report = result?.ok ? result.data : null;
  const bridgeError = result && !result.ok ? result.error : null;
  const structuredError = report && report.status !== "pass" ? report.error : null;
  const errorCode = bridgeError?.code ?? structuredError?.code ?? null;
  const dataUrl =
    report?.image_base64 && report.mime ? `data:${report.mime};base64,${report.image_base64}` : null;

  return (
    <section className="image-gen" aria-label="Local image generation">
      {!desktop ? (
        <div className="image-gen__notice" role="note">
          <Icon name="cpu" />
          <span>
            <b>Desktop app required</b>
            <small>Image generation runs your local backend and is available in the desktop app only.</small>
          </span>
        </div>
      ) : !statusLoading && !configured ? (
        <div className="image-gen__notice" role="note" data-testid="image-gen-not-configured">
          <Icon name="settings" />
          <span>
            <b>No image backend configured</b>
            <small>
              Point RealForge at ComfyUI or any OpenAI-compatible image server in
              <code> ~/.realforge.local.toml</code>. ComfyUI is the recommended local option.
            </small>
          </span>
          <Button label="Open provider settings" iconName="settings" variant="secondary" onClick={openImageSettings} />
        </div>
      ) : null}

      <div className="image-gen__composer">
        <label className="sr-only" htmlFor="image-gen-prompt">
          Describe an image
        </label>
        <textarea
          id="image-gen-prompt"
          className="image-gen__prompt"
          placeholder="Describe an image… e.g. a calm mountain lake at sunrise, soft light, highly detailed"
          maxLength={MAX_PROMPT_CHARS}
          rows={3}
          value={prompt}
          disabled={running}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="image-gen__controls">
          <label className="image-gen__approve">
            <input
              type="checkbox"
              checked={approved}
              disabled={running || !desktop || !configured}
              onChange={(e) => setApproved(e.target.checked)}
            />
            <span>I approve sending this prompt to my local image backend.</span>
          </label>
          <span className="image-gen__count">
            {trimmed.length}/{MAX_PROMPT_CHARS}
          </span>
          <Button
            label={running ? "Generating…" : "Generate image"}
            iconName="sparkles"
            variant="primary"
            disabled={!canGenerate}
            onClick={generate}
          />
        </div>
      </div>

      <div className="image-gen__stage" aria-live="polite">
        {running ? (
          <div className="image-gen__pending" role="status" data-testid="image-gen-loading">
            <span className="chat-typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              Generating on your local backend…
              <small>One bounded request · it times out automatically · nothing is saved.</small>
            </span>
          </div>
        ) : bridgeError || structuredError ? (
          <div className="image-gen__error" role="alert" data-testid="image-gen-error">
            <Icon name="triangle-alert" />
            <span>
              <b>
                [{errorCode}] {errorTitle(errorCode ?? "")}
              </b>
              <small>{errorGuidance(errorCode ?? "")}</small>
            </span>
            {errorCode === "not_configured" ? (
              <Button label="Open provider settings" iconName="settings" variant="secondary" onClick={openImageSettings} />
            ) : null}
          </div>
        ) : report && dataUrl ? (
          <figure className="image-gen__result" data-testid="image-gen-result">
            <div className="image-gen__result-bar">
              <Badge label="LOCAL UNTRUSTED" tone="amber" />
              <span className="image-gen__meta">
                {report.duration_ms} ms · {Math.max(1, Math.round(report.image_bytes / 1024))} KB · PNG
              </span>
              <a
                className="image-gen__save"
                href={dataUrl}
                download="realforge-image.png"
                ref={(el) => {
                  objectUrlRef.current = el ? dataUrl : objectUrlRef.current;
                }}
              >
                <Icon name="download" /> Save image…
              </a>
            </div>
            <img className="image-gen__image" src={dataUrl} alt="Local model generated output (untrusted)" />
            <figcaption>Generated by your local backend. Review before use — output is never trusted.</figcaption>
          </figure>
        ) : (
          <div className="image-gen__empty" data-testid="image-gen-empty">
            <Icon name="image" />
            <span>
              <b>Describe an image to generate</b>
              <small>Your prompt runs on your own machine. Approve each send; the result appears here.</small>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
