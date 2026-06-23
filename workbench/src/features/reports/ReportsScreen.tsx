import { reportImport } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon, SectionHeading } from "../../components/primitives";
import { CliBridgePanel } from "./CliBridgePanel";
import { ImportPreviewPanel } from "./ImportPreview";
import { ApprovalAuditLog } from "../audit/ApprovalAuditLog";

export function ReportsScreen() {
  const importRaw = useWorkbenchStore((s) => s.importRaw);
  const importType = useWorkbenchStore((s) => s.importType);
  const importPreview = useWorkbenchStore((s) => s.importPreview);
  const setImportRaw = useWorkbenchStore((s) => s.setImportRaw);
  const setImportType = useWorkbenchStore((s) => s.setImportType);
  const previewImport = useWorkbenchStore((s) => s.previewImport);
  const clearImport = useWorkbenchStore((s) => s.clearImport);
  const loadSample = useWorkbenchStore((s) => s.loadSample);

  const types = reportImport.IMPORT_TYPES;
  const samples = reportImport.getSamples();

  return (
    <div className="screen reports-screen">
      <SectionHeading
        eyebrow="REPORTS"
        title="Preview a report."
        description="Paste JSON, load a sample, or pull a read-only CLI report. RealForge shows it locally and never applies changes from it."
      />
      <div className="import-banner">
        <Icon name="shield-alert" />
        <span>
          <b>Imported JSON is untrusted.</b> RealForge will not execute commands or apply changes from this report.
        </span>
        <Badge label="LOCAL PREVIEW" tone="cyan" />
      </div>
      <details className="reports-activity-disclosure">
        <summary>Activity log</summary>
        <ApprovalAuditLog />
      </details>
      <div className="reports-layout">
        <div className="reports-left">
          <CliBridgePanel />
          <section className="import-panel">
            <div className="import-samples">
              <span>
                <Icon name="database" />
                Load a sample
              </span>
              <div>
                {samples.length ? (
                  samples.map((sample) => (
                    <button key={sample.id} type="button" className="import-sample" onClick={() => loadSample(sample.id)}>
                      <Icon name="file-text" />
                      <span>{sample.label}</span>
                    </button>
                  ))
                ) : (
                  <small>No fixtures available.</small>
                )}
              </div>
            </div>
            <label className="import-type">
              <span>Report type</span>
              <select id="import-type" name="import-type" value={importType} onChange={(e) => setImportType(e.target.value)}>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sr-only" htmlFor="import-input">
              Report JSON
            </label>
            <textarea
              id="import-input"
              className="import-input"
              spellCheck={false}
              autoComplete="off"
              placeholder="Paste a RealForge report as JSON…"
              value={importRaw}
              onChange={(e) => setImportRaw(e.target.value)}
            />
            <div className="import-actions">
              <Button label="Preview report" iconName="scan-eye" variant="primary" onClick={previewImport} />
              <Button label="Clear" iconName="x" variant="ghost" onClick={clearImport} />
              <span className="import-hint">
                <Icon name="file-x" />
                Parsed in-browser only
              </span>
            </div>
          </section>
        </div>
        <section className="import-preview" aria-live="polite">
          <ImportPreviewPanel preview={importPreview} />
        </section>
      </div>
    </div>
  );
}
