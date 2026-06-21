import { cliReportSources, reportImport } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon, SectionHeading } from "../../components/primitives";
import { ImportPreviewPanel } from "./ImportPreview";

function CliBridgePanel() {
  const copyCliCommand = useWorkbenchStore((s) => s.copyCliCommand);
  const cli = cliReportSources;
  const sources = cli?.SOURCES ?? [];
  if (!sources.length) return null;

  return (
    <section className="cli-bridge-panel">
      <header>
        <Icon name="terminal" />
        <div>
          <p className="eyebrow">LOAD FROM REALFORGE CLI</p>
          <h2>Read-only report sources</h2>
        </div>
        <Badge label="READ ONLY" tone="green" />
      </header>
      <div className="cli-bridge-safety">
        <Badge label="NO WRITES" tone="green" />
        <Badge label="NO APPLY" tone="cyan" />
        <Badge label="NO SHELL" tone="cyan" />
        <Badge label="OUTPUT UNTRUSTED" tone="amber" />
      </div>
      <p className="cli-bridge-note">
        <Icon name="shield-check" />A local Node bridge runs only these allowlisted, read-only commands — no shell, no writes, no apply. Run one in a terminal at the repo root, then paste its JSON into the import box below. The Workbench never executes commands.
      </p>
      <div className="cli-source-list">
        {sources.map((source: { id: string; label: string; description: string; displayCommand: string }) => {
          const id = String(source.id);
          return (
            <article key={id} className="cli-source">
              <header>
                <b>{String(source.label)}</b>
                <Badge label="READ ONLY" tone="green" />
              </header>
              <p>{String(source.description)}</p>
              <code className="cli-source__cmd">{String(source.displayCommand)}</code>
              <footer>
                <code className="cli-source__bridge">node tools/realforge-report-bridge.mjs load {id}</code>
                <Button label="Copy command" iconName="clipboard-list" variant="secondary" onClick={() => copyCliCommand(id)} />
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

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
        eyebrow="REPORTS · READ-ONLY IMPORT"
        title="Preview RealForge JSON reports."
        description="Paste, load a sample, or pull a read-only CLI report through the local bridge. Everything is parsed locally and shown as an untrusted preview. No backend, no commands, no writes."
      />
      <div className="import-banner">
        <Icon name="shield-alert" />
        <span>
          <b>Imported JSON is untrusted.</b> RealForge will not execute commands or apply changes from this report.
        </span>
        <Badge label="NO BACKEND" tone="cyan" />
        <Badge label="NO WRITES" tone="green" />
      </div>
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
