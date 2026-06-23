import type { BridgeError, ProviderChatSandboxResult } from "../../bridge";
import { Badge, Button, Icon } from "../../components/primitives";

// Visible-output cap mirrors the Rust/backend response cap. Defense in depth:
// the bridge already truncates; the UI never renders more than this.
const MAX_RESPONSE_CHARS = 4_096;
const PROVIDER_CONNECTION_GUIDANCE =
  "Open Settings → Local model to check provider status. Make sure your local OpenAI-compatible server is running. Then run a smoke check.";

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
  return "Local provider connection failed";
}

function bridgeErrorNext(error: BridgeError): string {
  if (error.code === "unsupported_web") return "Open the desktop app to use the local model.";
  if (error.code === "timeout") return PROVIDER_CONNECTION_GUIDANCE;
  if (error.code === "request_in_progress") return "Wait for the current request to finish, then ask again.";
  if (error.code === "cancelled") return "Ask again to send the prompt once more.";
  return PROVIDER_CONNECTION_GUIDANCE;
}

function statusNext(status: string): string | null {
  if (status === "not_configured") return "Open Settings → Local model to check provider status.";
  if (status === "rejected") return "The request was rejected before it reached the provider. Adjust the text and ask again.";
  if (status === "fail") return PROVIDER_CONNECTION_GUIDANCE;
  return null;
}

interface WorkbenchChatTurnProps {
  prompt: string;
  result: ProviderChatSandboxResult | null;
  running: boolean;
  /** True when recent visible turns were composed into this request's prompt. */
  contextIncluded?: boolean;
  /** Open Settings → Provider / Local Model (shown only on a not-configured result). */
  onConfigureProvider?: () => void;
}

/**
 * One user→assistant exchange in the session-only local chat thread.
 * Each turn is an independent bounded call (no prior turns are sent to the
 * provider). Nothing here is persisted, added to the approval audit, or kept as
 * hidden transcript memory. Output is always shown as LOCAL UNTRUSTED.
 */
export function WorkbenchChatTurn({ prompt, result, running, contextIncluded, onConfigureProvider }: WorkbenchChatTurnProps) {
  const report = result?.ok ? result.data : null;
  const bridgeError = result && !result.ok ? result.error : null;
  const response = report?.response ? clampCharacters(report.response, MAX_RESPONSE_CHARS) : null;
  const responseTruncated = Boolean(
    report?.response_truncated ||
      (report?.response && Array.from(report.response).length > MAX_RESPONSE_CHARS)
  );
  const showStructuredError = Boolean(report && (report.error || report.status !== "pass"));
  const notConfigured = report?.status === "not_configured";

  return (
    <div className="chat-turn" data-testid="workbench-chat-turn">
      <div className="thread-message thread-message--user" data-testid="chat-turn-prompt">
        {prompt}
        <small>
          local model sandbox · session only · not persisted
          {contextIncluded ? (
            <span className="chat-turn__context-tag" data-testid="chat-turn-context-tag"> · visible chat context included</span>
          ) : null}
        </small>
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
            <div className="chat-turn__pending" role="status" data-testid="chat-turn-loading">
              <span className="chat-typing" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="chat-turn__pending-text">
                Local model is responding…
                <small>One bounded request · it times out automatically.</small>
              </span>
            </div>
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
              <details className="chat-turn__meta-details" data-testid="chat-turn-meta-details">
                <summary>Response details</summary>
                <dl className="chat-turn__meta">
                  <div><dt>Status</dt><dd>{statusLabel(report.status)}</dd></div>
                  <div><dt>Duration</dt><dd>{report.duration_ms} ms</dd></div>
                  <div><dt>Input</dt><dd>{report.input_length} chars</dd></div>
                  <div><dt>Saved</dt><dd>NEVER</dd></div>
                </dl>
              </details>
              {notConfigured && onConfigureProvider ? (
                <Button
                  label="Configure local provider"
                  iconName="settings"
                  variant="secondary"
                  onClick={onConfigureProvider}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
