import { useEffect, useState } from "react";
import type { ComposedAction } from "../../composer/action-model";
import { listRealFiles, runApprovedDryRunAction } from "../../bridge";
import type { ApprovedDryRunExecution } from "../../bridge";
import { createApprovalAuditEntry } from "../../audit/approval-audit";
import { Button, Icon, StateNote } from "../../components/primitives";
import { useWorkbenchStore } from "../../state/workbench-store";
import { WorkbenchResultCard } from "../workbench/WorkbenchResultCard";

interface ApprovedDryRunPanelProps {
  action: ComposedAction;
  workspacePath: string;
  onClose: () => void;
}

type RunState = "idle" | "running" | "complete" | "error";
type FilesState = "idle" | "loading" | "ready" | "error";

export function ApprovedDryRunPanel({ action, workspacePath, onClose }: ApprovedDryRunPanelProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [result, setResult] = useState<ApprovedDryRunExecution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordApprovalAuditEntry = useWorkbenchStore((state) => state.recordApprovalAuditEntry);

  // Workspace .real file selection (only for the workspace-file action).
  const requiresFile = action.requiresWorkspaceFile === true;
  const [filesState, setFilesState] = useState<FilesState>(requiresFile ? "loading" : "idle");
  const [files, setFiles] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");

  const approvedActionId = action.approvedDryRunActionId;

  useEffect(() => {
    if (!requiresFile) return;
    let active = true;
    setFilesState("loading");
    listRealFiles().then((res) => {
      if (!active) return;
      if (!res.ok) {
        setFilesError(res.error?.message ?? "Could not list workspace .real files.");
        setFilesState("error");
        return;
      }
      setFiles(res.files);
      setTruncated(res.truncated);
      setSelected(res.files[0] ?? "");
      setFilesState("ready");
    });
    return () => {
      active = false;
    };
  }, [requiresFile, approvedActionId]);

  if (!approvedActionId) return null;

  const hasFile = !requiresFile || selected.length > 0;
  // The exact argv preview substitutes the chosen file for the <relative-path> slot.
  const argvPreview = (action.fixedArgvTemplate ?? []).map((token) =>
    token === "<relative-path>" ? (selected || "<relative-path>") : token
  );

  const runApprovedCheck = async () => {
    if (!acknowledged || !hasFile || runState === "running") return;
    setRunState("running");
    setAcknowledged(false);
    setResult(null);
    setError(null);
    const startedAt = Date.now();
    const response = await runApprovedDryRunAction(
      approvedActionId,
      requiresFile ? { approvalAcknowledged: true, relativePath: selected } : { approvalAcknowledged: true }
    );
    recordApprovalAuditEntry(
      createApprovalAuditEntry({
        actionId: approvedActionId,
        actionTitle: action.title,
        targetRelativePath: requiresFile ? selected : "examples/hello.real",
        result: response,
        measuredDurationMs: Date.now() - startedAt
      })
    );
    if (!response.ok) {
      setRunState("error");
      setError(`${response.error.code}: ${response.error.message}`);
      return;
    }
    setResult(response.data);
    setRunState("complete");
  };

  return (
    <section className="approval-panel" data-testid="approval-panel" aria-labelledby="approval-panel-title">
      <header>
        <span className="approval-panel__icon"><Icon name="shield-check" /></span>
        <div>
          <p className="eyebrow">ONE-TIME LOCAL CHECK APPROVAL</p>
          <h2 id="approval-panel-title">{action.title}</h2>
          <p>This approval applies only to the dry-run check shown below.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close approval panel" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>

      {requiresFile ? (
        <div className="approval-panel__file" data-testid="approval-file-picker">
          <label htmlFor="approval-real-file">
            <span>Workspace .real file</span>
            <small>Chosen from the read-only file list. Validated: no traversal, no symlink escape, .real only.</small>
          </label>
          {filesState === "loading" ? (
            <StateNote icon="activity" what="Listing .real files…" />
          ) : filesState === "error" ? (
            <StateNote
              icon="triangle-alert"
              tone="warn"
              what="Could not list workspace files"
              why={filesError ?? "The bridge returned an error."}
              next="Confirm the workspace is selected and healthy in Settings → Workspace."
            />
          ) : files.length === 0 ? (
            <StateNote
              icon="circle-dot"
              what="No .real files found"
              why="No workspace-relative .real files are available to check."
              next="Add a .real file to the workspace, or use the fixed hello.real check."
            />
          ) : (
            <>
              <select
                id="approval-real-file"
                value={selected}
                disabled={runState === "running"}
                onChange={(event) => {
                  setSelected(event.currentTarget.value);
                  setAcknowledged(false);
                }}
              >
                {files.map((file) => (
                  <option key={file} value={file}>
                    {file}
                  </option>
                ))}
              </select>
              {truncated ? <small className="approval-panel__truncated">Showing the first {files.length} files.</small> : null}
            </>
          )}
        </div>
      ) : null}

      <div className="approval-panel__command" aria-label="Exact approved command">
        <span>{requiresFile ? "VALIDATED ARGV" : "FIXED ARGV"}</span>
        <div>
          {argvPreview.map((token, index) => <code key={`${token}-${index}`}>{token}</code>)}
        </div>
      </div>

      <dl className="approval-panel__facts">
        <div><dt>Workspace</dt><dd>{workspacePath}</dd></div>
        {requiresFile ? <div><dt>Selected file</dt><dd>{selected || "—"}</dd></div> : null}
        <div><dt>Writes files</dt><dd>FALSE</dd></div>
        <div><dt>Network required</dt><dd>FALSE</dd></div>
        <div><dt>Output trust</dt><dd>UNTRUSTED</dd></div>
      </dl>

      <label className="approval-confirmation">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={runState === "running" || !hasFile}
          onChange={(event) => setAcknowledged(event.currentTarget.checked)}
        />
        <span>
          <b>I understand this runs a local dry-run/check command.</b>
          <small>
            {requiresFile
              ? "Only the .real file is chosen from the workspace list; argv, flags, environment, and command text cannot be changed."
              : "No file path, argv, environment, or command text can be changed."}
          </small>
        </span>
      </label>

      <div className="approval-panel__actions">
        <span><Icon name="triangle-alert" /> Process output remains untrusted and inert.</span>
        <Button
          label={runState === "running" ? "Running check" : "Run approved check"}
          iconName={runState === "running" ? "activity" : "play"}
          variant="primary"
          disabled={!acknowledged || !hasFile || runState === "running"}
          onClick={runApprovedCheck}
        />
      </div>

      <WorkbenchResultCard result={result} error={error} />
    </section>
  );
}
