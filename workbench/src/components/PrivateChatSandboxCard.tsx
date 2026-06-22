import { useState } from "react";
import {
  isDesktopRuntime,
  runPrivateProviderChatSandbox,
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

export function PrivateChatSandboxCard() {
  const desktop = isDesktopRuntime();
  const [prompt, setPrompt] = useState("");
  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProviderChatSandboxResult | null>(null);

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
    try {
      setResult(
        await runPrivateProviderChatSandbox({
          prompt,
          approvalAcknowledged: true
        })
      );
    } finally {
      setApproved(false);
      setRunning(false);
    }
  }

  function clearSandbox(): void {
    if (running) return;
    setPrompt("");
    setApproved(false);
    setResult(null);
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
        <span><Icon name="shield-check" /> No persistence</span>
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
        <Button
          label="Clear sandbox"
          iconName="x"
          variant="secondary"
          disabled={running || (!prompt && !result)}
          onClick={clearSandbox}
        />
        <span>{desktop ? "One request only · no automatic follow-up" : "Web preview cannot contact providers"}</span>
      </div>

      {result && !result.ok ? (
        <div className="private-chat-sandbox__error" role="alert" data-testid="chat-sandbox-bridge-error">
          <Icon name="triangle-alert" />
          <span>
            <b>[{result.error.code}] Private chat sandbox unavailable</b>
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
              </div>
              <pre aria-label="Untrusted private chat sandbox response">{response}</pre>
              <small>Review before use. This response is not saved or copied to diagnostics.</small>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
