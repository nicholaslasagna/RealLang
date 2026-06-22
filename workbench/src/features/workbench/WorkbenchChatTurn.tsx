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

interface WorkbenchChatTurnProps {
  prompt: string;
  result: ProviderChatSandboxResult | null;
  running: boolean;
  onClear: () => void;
}

/**
 * One single-turn local-model exchange rendered in the Workbench thread.
 * Session-only: nothing here is persisted, added to the approval audit, or kept
 * as transcript memory. Output is always shown as LOCAL UNTRUSTED.
 */
export function WorkbenchChatTurn({ prompt, result, running, onClear }: WorkbenchChatTurnProps) {
  const report = result?.ok ? result.data : null;
  const bridgeError = result && !result.ok ? result.error : null;
  const response = report?.response ? clampCharacters(report.response, MAX_RESPONSE_CHARS) : null;
  const responseTruncated = Boolean(
    report?.response_truncated ||
      (report?.response && Array.from(report.response).length > MAX_RESPONSE_CHARS)
  );

  return (
    <div className="chat-turn" data-testid="workbench-chat-turn">
      <div className="thread-message thread-message--user" data-testid="chat-turn-prompt">
        {prompt}
        <small>local model sandbox · session only · not persisted</small>
      </div>

      <div className="chat-turn__assistant">
        <span className="mini-mark" aria-hidden="true" />
        <div className="chat-turn__body">
          <div className="chat-turn__label">
            <b>Local model</b>
            <Badge label="LOCAL UNTRUSTED" tone="amber" />
            {report && responseTruncated ? <Badge label="TRUNCATED" tone="neutral" /> : null}
          </div>

          {running ? (
            <p className="chat-turn__status" role="status">
              <Icon name="activity" /> Waiting for the local model…
            </p>
          ) : bridgeError ? (
            <div className="chat-turn__error" role="alert" data-testid="chat-turn-error">
              <Icon name="triangle-alert" />
              <span>
                <b>[{bridgeError.code}] {bridgeErrorTitle(bridgeError)}</b>
                <small>{bridgeError.message}</small>
              </span>
            </div>
          ) : report ? (
            <>
              {report.error ? (
                <div className="chat-turn__error" role="alert" data-testid="chat-turn-structured-error">
                  <Icon name="triangle-alert" />
                  <span>
                    <b>[{report.error.code}] {statusLabel(report.status)}</b>
                    <small>{report.error.message}</small>
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
              ) : !report.error ? (
                <p className="chat-turn__status">No response text returned.</p>
              ) : null}
              <div className="chat-turn__meta">
                <span>{statusLabel(report.status)}</span>
                <span>{report.duration_ms} ms</span>
                <span>{report.input_length} chars in</span>
                <span>not persisted</span>
              </div>
            </>
          ) : null}

          {!running ? (
            <Button label="Clear response" iconName="x" variant="ghost" onClick={onClear} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
