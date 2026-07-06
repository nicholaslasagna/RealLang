import { useEffect, useState } from "react";
import {
  isDesktopRuntime,
  loadProviderStatus,
  runPrivateProviderChatSandbox,
  setChatStreamDeltaListener,
  type ProviderChatSandboxResult,
  type ProviderStatus
} from "../../bridge";
import { Badge, Button, Icon } from "../../components/primitives";
import { useWorkbenchStore } from "../../state/workbench-store";

interface LocalModelTextPanelCopy {
  ariaLabel: string;
  inputId: string;
  inputLabel: string;
  placeholder: string;
  approvalLabel: string;
  submitLabel: string;
  runningLabel: string;
  pendingTitle: string;
  pendingDetail: string;
  desktopRequiredTitle: string;
  desktopRequiredDetail: string;
  notConfiguredTitle: string;
  notConfiguredDetail: string;
  emptyIcon: string;
  emptyTitle: string;
  emptyDetail: string;
  copyLabel: string;
  copyPrefix: string;
  outputAriaLabel: string;
  resultMeta: (durationMs: number | undefined) => string;
  errorFallback: string;
}

interface LocalModelTextPanelTestIds {
  notConfigured: string;
  empty: string;
  loading: string;
  streaming: string;
  error: string;
  result: string;
}

interface LocalModelTextPanelProps {
  copy: LocalModelTextPanelCopy;
  testIds: LocalModelTextPanelTestIds;
  maxInputChars: number;
  composePrompt: (input: string) => string;
  submitIconName: string;
}

function errorTitle(code: string): string {
  if (code === "unsupported_web") return "Desktop app required";
  if (code === "not_configured") return "Local model not configured";
  if (code === "timeout") return "Request timed out";
  return "Local model request failed";
}

function errorGuidance(code: string, fallback: string): string {
  if (code === "unsupported_web") return "Open the desktop app to run this local model workflow.";
  if (code === "not_configured") return "Add your local model to ~/.realforge.local.toml (Settings -> Provider), then try again.";
  if (code === "timeout") return "Make sure your local model server is running, then try again.";
  return fallback;
}

function bridgeFailure(message: string): ProviderChatSandboxResult {
  return {
    ok: false,
    error: {
      code: "frontend_error",
      message
    }
  };
}

/**
 * Shared approval-gated text-generation surface for studio workflows. It uses
 * the same bounded chat sandbox as Chat: no tools, no files, no persistence, and
 * every result stays LOCAL UNTRUSTED until a human reviews it.
 */
export function LocalModelTextPanel({
  copy,
  testIds,
  maxInputChars,
  composePrompt,
  submitIconName
}: LocalModelTextPanelProps) {
  const desktop = isDesktopRuntime();
  const navigate = useWorkbenchStore((s) => s.navigate);
  const setSettingsSection = useWorkbenchStore((s) => s.setSettingsSection);
  const [input, setInput] = useState("");
  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [result, setResult] = useState<ProviderChatSandboxResult | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

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

  useEffect(() => () => setChatStreamDeltaListener(null), []);

  const configured = status?.configured ?? false;
  const trimmed = input.trim();
  const canGenerate = desktop && configured && approved && trimmed.length > 0 && !running;

  const openProviderSettings = () => {
    setSettingsSection("provider");
    navigate("settings");
  };

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
    try {
      const res = await runPrivateProviderChatSandbox({
        prompt: composePrompt(trimmed),
        approvalAcknowledged: true
      });
      setResult(res);
    } catch {
      setResult(bridgeFailure("Local model request failed before a sanitized report was returned."));
    } finally {
      setChatStreamDeltaListener(null);
      setRunning(false);
      setApproved(false);
    }
  };

  const report = result?.ok ? result.data : null;
  const bridgeError = result && !result.ok ? result.error : null;
  const structuredError = report && report.status !== "pass" ? report.error : null;
  const errorCode = bridgeError?.code ?? structuredError?.code ?? null;
  const response = report?.response ?? null;

  return (
    <section className="local-model-text" aria-label={copy.ariaLabel}>
      {!desktop ? (
        <div className="local-model-text__notice" role="note">
          <Icon name="cpu" />
          <span>
            <b>{copy.desktopRequiredTitle}</b>
            <small>{copy.desktopRequiredDetail}</small>
          </span>
        </div>
      ) : !statusLoading && !configured ? (
        <div className="local-model-text__notice" role="note" data-testid={testIds.notConfigured}>
          <Icon name="settings" />
          <span>
            <b>{copy.notConfiguredTitle}</b>
            <small>{copy.notConfiguredDetail}</small>
          </span>
          <Button label="Open provider settings" iconName="settings" variant="secondary" onClick={openProviderSettings} />
        </div>
      ) : null}

      <div className="local-model-text__composer">
        <label className="sr-only" htmlFor={copy.inputId}>
          {copy.inputLabel}
        </label>
        <textarea
          id={copy.inputId}
          className="local-model-text__prompt"
          placeholder={copy.placeholder}
          maxLength={maxInputChars}
          rows={3}
          value={input}
          disabled={running}
          onChange={(event) => setInput(event.target.value)}
        />
        <div className="local-model-text__controls">
          <label className="local-model-text__approve">
            <input
              type="checkbox"
              checked={approved}
              disabled={running || !desktop || !configured}
              onChange={(event) => setApproved(event.target.checked)}
            />
            <span>{copy.approvalLabel}</span>
          </label>
          <span className="local-model-text__count">
            {trimmed.length}/{maxInputChars}
          </span>
          <Button
            label={running ? copy.runningLabel : copy.submitLabel}
            iconName={submitIconName}
            variant="primary"
            disabled={!canGenerate}
            onClick={generate}
          />
        </div>
      </div>

      <div className="local-model-text__stage" aria-live="polite">
        {running && streamText ? (
          <pre className="local-model-text__output local-model-text__output--live" data-testid={testIds.streaming}>
            {streamText}
          </pre>
        ) : running ? (
          <div className="local-model-text__pending" role="status" data-testid={testIds.loading}>
            <span className="chat-typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              {copy.pendingTitle}
              <small>{copy.pendingDetail}</small>
            </span>
          </div>
        ) : bridgeError || structuredError ? (
          <div className="local-model-text__notice local-model-text__error" role="alert" data-testid={testIds.error}>
            <Icon name="triangle-alert" />
            <span>
              <b>
                [{errorCode}] {errorTitle(errorCode ?? "")}
              </b>
              <small>{errorGuidance(errorCode ?? "", copy.errorFallback)}</small>
            </span>
            {errorCode === "not_configured" ? (
              <Button label="Open provider settings" iconName="settings" variant="secondary" onClick={openProviderSettings} />
            ) : null}
          </div>
        ) : response ? (
          <div className="local-model-text__result" data-testid={testIds.result}>
            <div className="local-model-text__result-bar">
              <Badge label="LOCAL UNTRUSTED" tone="amber" />
              <span className="local-model-text__meta">{copy.resultMeta(report?.duration_ms)}</span>
              <button
                type="button"
                className="local-model-text__copy"
                onClick={() => void navigator.clipboard?.writeText(`${copy.copyPrefix}\n\n${response}`)}
              >
                <Icon name="clipboard-list" /> {copy.copyLabel}
              </button>
            </div>
            <pre className="local-model-text__output" aria-label={copy.outputAriaLabel}>
              {response}
            </pre>
          </div>
        ) : (
          <div className="local-model-text__notice local-model-text__empty" data-testid={testIds.empty}>
            <Icon name={copy.emptyIcon} />
            <span>
              <b>{copy.emptyTitle}</b>
              <small>{copy.emptyDetail}</small>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
