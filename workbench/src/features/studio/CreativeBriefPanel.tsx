import { useEffect, useState } from "react";
import {
  isDesktopRuntime,
  loadProviderStatus,
  runPrivateProviderChatSandbox,
  setChatStreamDeltaListener,
  type ProviderChatSandboxResult,
  type ProviderStatus
} from "../../bridge";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon } from "../../components/primitives";

// Direction cap keeps the composed prompt well under the 2000-char sandbox limit.
const MAX_DIRECTION_CHARS = 600;

/**
 * Compose the bounded brief request sent to the local model. Reuses the exact same
 * approval-gated chat sandbox as Chat — no new backend. Output is LOCAL UNTRUSTED.
 */
function composeBriefPrompt(direction: string): string {
  return [
    "You are a creative director. Turn the direction below into a concise, structured creative brief.",
    "Use these labelled sections, each on its own line:",
    "CONCEPT: one or two sentences.",
    "MOOD & TONE: 3-5 descriptors.",
    "VISUAL PROMPT: one vivid prompt ready for image generation.",
    "VARIANTS: three short alternative angles.",
    "AVOID: negative guidance - what to exclude.",
    "PRODUCTION NOTES: two or three practical notes.",
    "",
    `Direction: ${direction}`
  ].join("\n");
}

function errorTitle(code: string): string {
  if (code === "unsupported_web") return "Desktop app required";
  if (code === "not_configured") return "Local model not configured";
  if (code === "timeout") return "Request timed out";
  return "Local model request failed";
}

function errorGuidance(code: string): string {
  if (code === "unsupported_web") return "Open the desktop app to generate briefs from your local model.";
  if (code === "not_configured") return "Add your local model to ~/.realforge.local.toml (Settings -> Provider), then try again.";
  if (code === "timeout") return "Make sure your local model server is running, then try again.";
  return "Make sure your local model is running. Output is never trusted - review before use.";
}

/**
 * Real, approval-gated creative brief generation. One bounded direction -> the
 * user's local chat model (same sandbox as Chat) -> a streamed, structured brief
 * shown as LOCAL UNTRUSTED. Session-only: nothing is persisted or audited.
 */
export function CreativeBriefPanel() {
  const desktop = isDesktopRuntime();
  const navigate = useWorkbenchStore((s) => s.navigate);
  const setSettingsSection = useWorkbenchStore((s) => s.setSettingsSection);
  const [direction, setDirection] = useState("");
  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [result, setResult] = useState<ProviderChatSandboxResult | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void loadProviderStatus().then((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
    };
  }, [desktop]);

  const configured = status?.configured ?? false;
  const trimmed = direction.trim();
  const canGenerate = desktop && configured && approved && trimmed.length > 0 && !running;

  const generate = async () => {
    if (!canGenerate) return;
    setRunning(true);
    setResult(null);
    setStreamText("");
    let acc = "";
    setChatStreamDeltaListener((text) => {
      acc += text;
      setStreamText(acc);
    });
    const res = await runPrivateProviderChatSandbox({
      prompt: composeBriefPrompt(trimmed),
      approvalAcknowledged: true
    });
    setChatStreamDeltaListener(null);
    setResult(res);
    setRunning(false);
    setApproved(false); // re-approval required per send
  };

  const openProviderSettings = () => {
    setSettingsSection("provider");
    navigate("settings");
  };

  const report = result?.ok ? result.data : null;
  const bridgeError = result && !result.ok ? result.error : null;
  const structuredError = report && report.status !== "pass" ? report.error : null;
  const errorCode = bridgeError?.code ?? structuredError?.code ?? null;
  const brief = report?.response ?? null;

  return (
    <section className="creative-brief" aria-label="Creative brief generator">
      {!desktop ? (
        <div className="creative-brief__notice" role="note">
          <Icon name="cpu" />
          <span>
            <b>Desktop app required</b>
            <small>Briefs run on your local model and are available in the desktop app only.</small>
          </span>
        </div>
      ) : !configured ? (
        <div className="creative-brief__notice" role="note" data-testid="creative-brief-not-configured">
          <Icon name="settings" />
          <span>
            <b>Local model not configured</b>
            <small>
              Point RealForge at your local model in <code>~/.realforge.local.toml</code>. The same connection powers Chat.
            </small>
          </span>
          <Button label="Open provider settings" iconName="settings" variant="secondary" onClick={openProviderSettings} />
        </div>
      ) : null}

      <div className="creative-brief__composer">
        <label className="sr-only" htmlFor="creative-brief-direction">
          Describe a creative direction
        </label>
        <textarea
          id="creative-brief-direction"
          className="creative-brief__prompt"
          placeholder="Describe a direction... e.g. a survival-horror forest entity: readable traversal, escalating dread, moonlit palette"
          maxLength={MAX_DIRECTION_CHARS}
          rows={3}
          value={direction}
          disabled={running}
          onChange={(e) => setDirection(e.target.value)}
        />
        <div className="creative-brief__controls">
          <label className="creative-brief__approve">
            <input
              type="checkbox"
              checked={approved}
              disabled={running || !desktop || !configured}
              onChange={(e) => setApproved(e.target.checked)}
            />
            <span>I approve sending this direction to my local model.</span>
          </label>
          <span className="creative-brief__count">
            {trimmed.length}/{MAX_DIRECTION_CHARS}
          </span>
          <Button
            label={running ? "Generating…" : "Generate brief"}
            iconName="sparkles"
            variant="primary"
            disabled={!canGenerate}
            onClick={generate}
          />
        </div>
      </div>

      <div className="creative-brief__stage" aria-live="polite">
        {running && streamText ? (
          <pre className="creative-brief__output creative-brief__output--live" data-testid="creative-brief-streaming">
            {streamText}
          </pre>
        ) : running ? (
          <div className="creative-brief__pending" role="status" data-testid="creative-brief-loading">
            <span className="chat-typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              Your local model is drafting the brief…
              <small>One bounded request · it times out automatically · nothing is saved.</small>
            </span>
          </div>
        ) : bridgeError || structuredError ? (
          <div className="creative-brief__notice creative-brief__error" role="alert" data-testid="creative-brief-error">
            <Icon name="triangle-alert" />
            <span>
              <b>
                [{errorCode}] {errorTitle(errorCode ?? "")}
              </b>
              <small>{errorGuidance(errorCode ?? "")}</small>
            </span>
            {errorCode === "not_configured" ? (
              <Button label="Open provider settings" iconName="settings" variant="secondary" onClick={openProviderSettings} />
            ) : null}
          </div>
        ) : brief ? (
          <div className="creative-brief__result" data-testid="creative-brief-result">
            <div className="creative-brief__result-bar">
              <Badge label="LOCAL UNTRUSTED" tone="amber" />
              <span className="creative-brief__meta">{report?.duration_ms} ms · review before use</span>
              <button
                type="button"
                className="creative-brief__copy"
                onClick={() => void navigator.clipboard?.writeText(`LOCAL UNTRUSTED\n\n${brief}`)}
              >
                <Icon name="clipboard-list" /> Copy brief
              </button>
            </div>
            <pre className="creative-brief__output" aria-label="Untrusted local model brief">
              {brief}
            </pre>
          </div>
        ) : (
          <div className="creative-brief__notice creative-brief__empty" data-testid="creative-brief-empty">
            <Icon name="drama" />
            <span>
              <b>Describe a direction to draft a brief</b>
              <small>Your local model shapes it into concept, mood, a visual prompt, variants, and production notes. Approve each send.</small>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
