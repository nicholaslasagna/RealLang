import { useState } from "react";
import {
  cancelPrivateProviderChatSandbox,
  isDesktopRuntime,
  runPrivateProviderChatSandbox,
  type BridgeError,
  type ProviderChatSandboxResult
} from "../bridge";
import { Badge, Button, Icon } from "./primitives";

const MAX_PROMPT_CHARS = 2_000;
const MAX_RESPONSE_CHARS = 4_096;

function statusLabel(status: string): string {
  if (status === "pass") return "RESPONSE READY";
  if (status === "not_configured") return "NOT CONFIGURED";
  if (status === "rejected") return "REJECTED";
  return "FAILED";
}

function clampCharacters(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join("");
}

function bridgeErrorTitle(error: BridgeError): string {
  if (error.code === "cancelled") return "Request cancelled";
  if (error.code === "timeout") return "Request timed out";
  if (error.code === "request_in_progress") return "Request already running";
  return "Private chat sandbox unavailable";
}

export function PrivateChatSandboxCard() {
  const desktop = isDesktopRuntime();
  const [prompt, setPrompt] = useState("");
  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<ProviderChatSandboxResult | null>(null);
  const [controlError, setControlError] = useState<BridgeError | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "unavailable">("idle");

  const promptLength = Array.from(prompt).length;
  const canSend = desktop && prompt.trim().length > 0 && approved && !running;
  const report = result?.ok ? result.data : null;
  const response = report?.response
    ? clampCharacters(report.response, MAX_RESPONSE_CHARS)
    : null;
  const responseTruncated = Boolean(
    report?.response_truncated ||
    (report?.response && Array.from(report.response).length > MAX_RESPONSE_CHARS)
  );

  async function sendPrompt(): Promise<void> {
    if (!canSend) return;
    setRunning(true);
    setResult(null);
    setControlError(null);
    setCopyStatus("idle");
    try {
      const nextResult = await runPrivateProviderChatSandbox({
        prompt,
        approvalAcknowledged: true
      });
      setControlError(null);
      setResult(nextResult);
    } finally {
      setApproved(false);
      setCancelling(false);
      setRunning(false);
    }
  }

  async function cancelPrompt(): Promise<void> {
    if (!desktop || !running || cancelling) return;
    setCancelling(true);
    setControlError(null);
    const cancellation = await cancelPrivateProviderChatSandbox();
    if (!cancellation.ok) {
      setControlError(cancellation.error);
      setCancelling(false);
    }
  }

  function clearResponse(): void {
    if (running) return;
    setResult(null);
    setControlError(null);
    setCopyStatus("idle");
  }

  async function copyResponse(): Promise<void> {
    if (!response || !navigator.clipboard?.writeText) {
      setCopyStatus("unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(`LOCAL UNTRUSTED\n\n${response}`);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("unavailable");
    }
  }

  function clearSandbox(): void {
    if (running) return;
    setPrompt("");
    setApproved(false);
    setResult(null);
    setControlError(null);
    setCopyStatus("idle");
  }

  return (
    <section
      className="private-chat-sandbox"
      data-testid="private-chat-sandbox"
      aria-labelledby="private-chat-sandbox-title"
    >
      <header className="private-chat-sandbox__header">
        <span className="private-chat-sandbox__icon"><Icon name="cpu" /></span>
        <div>
          <p className="eyebrow">SINGLE-TURN LOCAL SANDBOX</p>
          <h2 id="private-chat-sandbox-title">Private Chat Sandbox</h2>
          <p>
            Send one bounded text request to the configured local provider. No workspace, files, tools, memory, or history are included.
          </p>
        </div>
        <Badge label="LOCAL UNTRUSTED" tone="amber" />
      </header>

      <div className="private-chat-sandbox__facts" aria-label="Private chat sandbox safety facts">
        <span><Icon name="file-x" /> No files or context</span>
        <span><Icon name="terminal" /> No tools or shell</span>
        <span><Icon name="shield-check" /> No memory or history</span>
        <span><Icon name="lock-keyhole" /> Approval per send</span>
      </div>

      <label className="private-chat-sandbox__prompt">
        <span>
          <b>Your sandbox text</b>
          <small>{promptLength.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()} characters</small>
        </span>
        <textarea
          value={prompt}
          maxLength={MAX_PROMPT_CHARS}
          disabled={!desktop || running}
          placeholder="Enter one bounded local request"
          onChange={(event) => setPrompt(clampCharacters(event.currentTarget.value, MAX_PROMPT_CHARS))}
        />
      </label>

      <label className={`private-chat-sandbox__approval ${!desktop ? "is-disabled" : ""}`}>
        <input
          type="checkbox"
          checked={approved}
          disabled={!desktop || running || !prompt.trim()}
          onChange={(event) => setApproved(event.currentTarget.checked)}
        />
        <span>
          <b>Approve this one local provider request</b>
          <small>The entered text is sent to the local provider. Output remains untrusted and is not persisted.</small>
        </span>
      </label>

      <div className="private-chat-sandbox__actions">
        <Button
          label={running ? "Waiting for local response" : desktop ? "Send approved text" : "Desktop app required"}
          iconName="arrow-up"
          variant="primary"
          disabled={!canSend}
          onClick={() => void sendPrompt()}
        />
        {running ? (
          <Button
            label={cancelling ? "Cancelling request" : "Cancel request"}
            iconName="x"
            variant="secondary"
            disabled={cancelling}
            onClick={() => void cancelPrompt()}
          />
        ) : null}
        <Button
          label="Clear response"
          iconName="x"
          variant="secondary"
          disabled={running || (!result && !controlError)}
          onClick={clearResponse}
        />
        <Button
          label="Clear sandbox"
          iconName="x"
          variant="secondary"
          disabled={running || (!prompt && !result)}
          onClick={clearSandbox}
        />
        <span>{desktop ? "One request only · no automatic follow-up" : "Web preview cannot contact providers"}</span>
      </div>

      {controlError ? (
        <div className="private-chat-sandbox__error" role="alert" data-testid="chat-sandbox-control-error">
          <Icon name="triangle-alert" />
          <span>
            <b>[{controlError.code}] Cancellation unavailable</b>
            <small>{controlError.message}</small>
          </span>
        </div>
      ) : null}

      {result && !result.ok ? (
        <div className="private-chat-sandbox__error" role="alert" data-testid="chat-sandbox-bridge-error">
          <Icon name="triangle-alert" />
          <span>
            <b>[{result.error.code}] {bridgeErrorTitle(result.error)}</b>
            <small>{result.error.message}</small>
          </span>
        </div>
      ) : null}

      {report ? (
        <div className="private-chat-sandbox__result" role="status" data-testid="chat-sandbox-result">
          <header>
            <div>
              <p className="eyebrow">SINGLE-TURN RESULT</p>
              <h3>{statusLabel(report.status)}</h3>
            </div>
            <Badge label={report.status === "pass" ? "UNTRUSTED RESPONSE" : statusLabel(report.status)} tone="amber" />
          </header>
          <dl>
            <div><dt>Attempted</dt><dd>{report.attempted ? "YES" : "NO"}</dd></div>
            <div><dt>Input length</dt><dd>{report.input_length} chars</dd></div>
            <div><dt>Duration</dt><dd>{report.duration_ms} ms</dd></div>
            <div><dt>Persistence</dt><dd>NONE</dd></div>
          </dl>
          {report.error ? (
            <p className="private-chat-sandbox__structured-error">
              <Icon name="triangle-alert" />
              <span><b>[{report.error.code}]</b> {report.error.message}</span>
            </p>
          ) : null}
          {response ? (
            <div className="private-chat-sandbox__response">
              <div>
                <b>Local provider output</b>
                <Badge label="LOCAL UNTRUSTED" tone="amber" />
                {responseTruncated ? <Badge label="TRUNCATED" tone="neutral" /> : null}
                <button
                  className="private-chat-sandbox__copy"
                  type="button"
                  onClick={() => void copyResponse()}
                >
                  <Icon name="clipboard-list" />
                  {copyStatus === "copied" ? "Copied untrusted response" : "Copy response"}
                </button>
              </div>
              <pre aria-label="Untrusted private chat sandbox response">{response}</pre>
              <small>
                {copyStatus === "unavailable"
                  ? "Clipboard unavailable. The response remains visible and unsaved."
                  : "Review before use. Copy includes the LOCAL UNTRUSTED label; nothing is copied to diagnostics."}
              </small>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
