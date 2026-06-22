import { useEffect, useState } from "react";
import type { BridgeError, ProviderChatSandboxResult } from "../../bridge";
import { Badge, Button, Icon } from "../../components/primitives";

// Visible-output cap mirrors the Rust/backend response cap. Defense in depth:
// the bridge already truncates; the UI never renders more than this.
const MAX_RESPONSE_CHARS = 4_096;

function clampCharacters(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join("");
}

function statusLabel(status: string): string {
  if (status === "pass") return "RESPONSE READY";
  if (status === "not_configured") return "NOT CONFIGURED";
  if (status === "rejected") return "REJECTED";
  return "FAILED";
}

function bridgeErrorTitle(error: BridgeError): string {
  if (error.code === "unsupported_web") return "Desktop app required";
  if (error.code === "timeout") return "Request timed out";
  if (error.code === "cancelled") return "Request cancelled";
  if (error.code === "request_in_progress") return "Request already running";
  return "Local model sandbox unavailable";
}

function bridgeErrorNext(error: BridgeError): string {
  if (error.code === "unsupported_web") return "Open the desktop app to use the local model.";
  if (error.code === "timeout") return "It timed out automatically. Retry below to try the same prompt again.";
  if (error.code === "request_in_progress") return "Wait for the current request to finish, then retry.";
  if (error.code === "cancelled") return "Retry below to send the same prompt again.";
  return "Check the local provider in Settings → Provider / Local Model, then retry.";
}

function statusNext(status: string): string | null {
  if (status === "not_configured") return "Configure a local provider in Settings → Provider / Local Model.";
  if (status === "rejected") return "The request was rejected before it reached the provider. Adjust the text and retry.";
  if (status === "fail") return "The local provider returned a failure. Retry below, or check the provider.";
  return null;
}

interface WorkbenchChatTurnProps {
  prompt: string;
  result: ProviderChatSandboxResult | null;
  running: boolean;
  onClear: () => void;
  /** Re-run the same visible prompt (only after an explicit re-approval). */
  onRetry?: () => void;
  /** Open Settings → Provider / Local Model. */
  onConfigureProvider?: () => void;
}

/**
 * One single-turn local-model exchange rendered in the Workbench thread.
 * Session-only: nothing here is persisted, added to the approval audit, or kept
 * as transcript memory. A new request replaces this turn. Output is always shown
 * as LOCAL UNTRUSTED. Retry never auto-sends — it requires an explicit re-approval.
 */
export function WorkbenchChatTurn({
  prompt,
  result,
  running,
  onClear,
  onRetry,
  onConfigureProvider
}: WorkbenchChatTurnProps) {
  const [retryAck, setRetryAck] = useState(false);

  // Re-approval never carries over to a different prompt.
  useEffect(() => setRetryAck(false), [prompt]);

  const report = result?.ok ? result.data : null;
  const bridgeError = result && !result.ok ? result.error : null;
  const response = report?.response ? clampCharacters(report.response, MAX_RESPONSE_CHARS) : null;
  const responseTruncated = Boolean(
    report?.response_truncated ||
      (report?.response && Array.from(report.response).length > MAX_RESPONSE_CHARS)
  );
  const settled = !running && result !== null;
  const showStructuredError = Boolean(report && (report.error || report.status !== "pass"));
  const notConfigured = report?.status === "not_configured";

  const confirmRetry = () => {
    if (!retryAck || running) return;
    setRetryAck(false);
    onRetry?.();
  };

  return (
    <div className="chat-turn" data-testid="workbench-chat-turn">
      <div className="thread-message thread-message--user" data-testid="chat-turn-prompt">
        {prompt}
        <small>local model sandbox · session only · not persisted</small>
      </div>

      <div className="chat-turn__assistant">
        <span className="mini-mark" aria-hidden="true" />
        <div className="chat-turn__body" aria-live="polite">
          <div className="chat-turn__label">
            <b>Local model</b>
            <Badge label="LOCAL UNTRUSTED" tone="amber" />
            {report && responseTruncated ? <Badge label="TRUNCATED" tone="neutral" /> : null}
          </div>

          {running ? (
            <p className="chat-turn__status" role="status" data-testid="chat-turn-loading">
              <Icon name="activity" /> Waiting for the local model…
              <small>One bounded request · it times out automatically.</small>
            </p>
          ) : bridgeError ? (
            <div className="chat-turn__error" role="alert" data-testid="chat-turn-error">
              <Icon name="triangle-alert" />
              <span>
                <b>[{bridgeError.code}] {bridgeErrorTitle(bridgeError)}</b>
                <small>{bridgeError.message}</small>
                <small className="chat-turn__next">{bridgeErrorNext(bridgeError)}</small>
              </span>
            </div>
          ) : report ? (
            <>
              {showStructuredError ? (
                <div className="chat-turn__error" role="alert" data-testid="chat-turn-structured-error">
                  <Icon name="triangle-alert" />
                  <span>
                    <b>[{report.error?.code ?? report.status}] {statusLabel(report.status)}</b>
                    {report.error ? <small>{report.error.message}</small> : null}
                    {statusNext(report.status) ? (
                      <small className="chat-turn__next">{statusNext(report.status)}</small>
                    ) : null}
                  </span>
                </div>
              ) : null}
              {response ? (
                <pre
                  className="chat-turn__response"
                  aria-label="Untrusted local model response"
                  data-testid="chat-turn-response"
                >
                  {response}
                </pre>
              ) : report.status === "pass" ? (
                <p className="chat-turn__status">No response text returned.</p>
              ) : null}
              <dl className="chat-turn__meta">
                <div><dt>Status</dt><dd>{statusLabel(report.status)}</dd></div>
                <div><dt>Duration</dt><dd>{report.duration_ms} ms</dd></div>
                <div><dt>Input</dt><dd>{report.input_length} chars</dd></div>
                <div><dt>Saved</dt><dd>NEVER</dd></div>
              </dl>
            </>
          ) : null}

          {settled ? (
            <div className="chat-turn__actions">
              {notConfigured && onConfigureProvider ? (
                <Button
                  label="Configure local provider"
                  iconName="settings"
                  variant="secondary"
                  onClick={onConfigureProvider}
                />
              ) : null}
              {onRetry ? (
                <label className="chat-turn__retry" data-testid="chat-turn-retry">
                  <input
                    type="checkbox"
                    checked={retryAck}
                    data-testid="chat-turn-retry-ack"
                    onChange={(event) => setRetryAck(event.currentTarget.checked)}
                  />
                  <span>Re-approve to retry the same prompt</span>
                </label>
              ) : null}
              {onRetry ? (
                <Button
                  label="Send again"
                  iconName="arrow-up"
                  variant="primary"
                  disabled={!retryAck}
                  onClick={confirmRetry}
                />
              ) : null}
              <Button label="Clear response" iconName="x" variant="ghost" onClick={onClear} />
            </div>
          ) : null}

          <p className="chat-turn__note">Single turn — a new request replaces this. Nothing is saved.</p>
        </div>
      </div>
    </div>
  );
}
