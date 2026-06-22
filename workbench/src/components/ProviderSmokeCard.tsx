import { useState } from "react";
import {
  isDesktopRuntime,
  runPrivateProviderSmoke,
  type ProviderSmokeResult
} from "../bridge";
import { Badge, Button, Icon } from "./primitives";

const RESPONSE_PREVIEW_LIMIT = 160;

function yesNo(value: boolean): string {
  return value ? "YES" : "NO";
}

function resultTone(status: string): string {
  if (status === "pass") return "green";
  return "amber";
}

function resultLabel(status: string): string {
  if (status === "pass") return "PASS";
  if (status === "not_configured") return "NOT CONFIGURED";
  return "FAILED";
}

export function ProviderSmokeCard() {
  const desktop = isDesktopRuntime();
  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProviderSmokeResult | null>(null);

  async function runSmoke(): Promise<void> {
    if (!desktop || !approved || running) return;
    setRunning(true);
    setResult(null);
    const nextResult = await runPrivateProviderSmoke({ approvalAcknowledged: true });
    setResult(nextResult);
    setApproved(false);
    setRunning(false);
  }

  const report = result?.ok ? result.data : null;
  const responsePreview = report?.response_preview
    ? Array.from(report.response_preview).slice(0, RESPONSE_PREVIEW_LIMIT).join("")
    : null;
  const responseTruncated = Boolean(
    report?.response_truncated ||
    (report?.response_preview && Array.from(report.response_preview).length > RESPONSE_PREVIEW_LIMIT)
  );

  return (
    <section className="provider-smoke" data-testid="provider-smoke-card" aria-labelledby="provider-smoke-title">
      <header className="provider-smoke__header">
        <span className="provider-smoke__icon">
          <Icon name="activity" />
        </span>
        <div>
          <p className="eyebrow">FIXED LOCAL CHECK</p>
          <h2 id="provider-smoke-title">Provider Smoke Test</h2>
          <p>
            Minimal reachability check only. No workspace files, tools, model files, or user-entered prompt are sent.
          </p>
        </div>
        <Badge label="LOCAL UNTRUSTED" tone="amber" />
      </header>

      <div className="provider-smoke__facts" aria-label="Provider smoke safety facts">
        <span><Icon name="lock-keyhole" /> Fixed command</span>
        <span><Icon name="file-x" /> No file contents</span>
        <span><Icon name="terminal" /> No arbitrary args</span>
        <span><Icon name="shield-check" /> No persistence</span>
      </div>

      <label className={`provider-smoke__approval ${!desktop ? "is-disabled" : ""}`}>
        <input
          type="checkbox"
          checked={approved}
          disabled={!desktop || running}
          onChange={(event) => setApproved(event.currentTarget.checked)}
        />
        <span>
          <b>Approve one fixed provider smoke check</b>
          <small>
            Runs <code>realforge provider smoke --json</code> once with a short timeout. The response remains untrusted.
          </small>
        </span>
      </label>

      <div className="provider-smoke__actions">
        <Button
          label={running ? "Running fixed check" : desktop ? "Run provider smoke" : "Desktop app required"}
          iconName="activity"
          variant="primary"
          disabled={!desktop || !approved || running}
          onClick={() => void runSmoke()}
        />
        <span>
          {desktop
            ? "Approval resets after every attempt. Result stays in this session only."
            : "Web preview cannot execute provider checks."}
        </span>
      </div>

      {result && !result.ok ? (
        <div className="provider-smoke__error" role="alert" data-testid="provider-smoke-bridge-error">
          <Icon name="triangle-alert" />
          <span>
            <b>[{result.error.code}] Provider smoke unavailable</b>
            <small>{result.error.message}</small>
          </span>
        </div>
      ) : null}

      {report ? (
        <div className="provider-smoke__result" role="status" data-testid="provider-smoke-result">
          <header>
            <div>
              <p className="eyebrow">SANITIZED RESULT</p>
              <h3>{resultLabel(report.status)}</h3>
            </div>
            <Badge label={resultLabel(report.status)} tone={resultTone(report.status)} />
          </header>
          <dl>
            <div><dt>Attempted</dt><dd>{yesNo(report.attempted)}</dd></div>
            <div><dt>Configured</dt><dd>{yesNo(report.configured)}</dd></div>
            <div><dt>Endpoint configured</dt><dd>{yesNo(report.endpoint_configured)}</dd></div>
            <div><dt>Endpoint host</dt><dd>{report.endpoint_host ?? "(not configured)"}</dd></div>
            <div><dt>Model configured</dt><dd>{yesNo(report.model_configured)}</dd></div>
            <div><dt>API key configured</dt><dd>{yesNo(report.api_key_configured)}</dd></div>
            <div><dt>Duration</dt><dd>{report.duration_ms} ms</dd></div>
            <div><dt>Output trust</dt><dd>UNTRUSTED</dd></div>
          </dl>
          {report.error ? (
            <p className="provider-smoke__structured-error">
              <Icon name="triangle-alert" />
              <span><b>[{report.error.code}]</b> {report.error.message}</span>
            </p>
          ) : null}
          {responsePreview ? (
            <div className="provider-smoke__preview">
              <div>
                <b>Response preview</b>
                <Badge label="UNTRUSTED" tone="amber" />
                {responseTruncated ? <Badge label="TRUNCATED" tone="neutral" /> : null}
              </div>
              <pre aria-label="Untrusted provider response preview">{responsePreview}</pre>
              <small>Not persisted, copied, or added to diagnostics.</small>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
