import { useEffect, useState } from "react";
import { isDesktopRuntime } from "../../bridge";
import { cliReportSources } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon } from "../../components/primitives";
import { BridgeHealthStrip } from "./BridgeHealthStrip";

function CliBridgePanel() {
  const copyCliCommand = useWorkbenchStore((s) => s.copyCliCommand);
  const loadDesktopReport = useWorkbenchStore((s) => s.loadDesktopReport);
  const desktopLoadStatus = useWorkbenchStore((s) => s.desktopLoadStatus);
  const desktopLoadSourceId = useWorkbenchStore((s) => s.desktopLoadSourceId);
  const desktopLoadError = useWorkbenchStore((s) => s.desktopLoadError);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(isDesktopRuntime());
  }, []);

  const sources = cliReportSources.SOURCES;

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
      <BridgeHealthStrip />
      <div className="cli-bridge-safety">
        <Badge label="NO WRITES" tone="green" />
        <Badge label="NO APPLY" tone="cyan" />
        <Badge label="NO SHELL" tone="cyan" />
        <Badge label="OUTPUT UNTRUSTED" tone="amber" />
      </div>
      <p className="cli-bridge-note">
        <Icon name="shield-check" />
        {desktop
          ? "The desktop shell can load only these allowlisted read-only commands via fixed argv arrays — no shell, no writes, no apply. Output enters the untrusted import preview below."
          : "A local Node bridge runs only these allowlisted, read-only commands — no shell, no writes, no apply. Run one in a terminal at the repo root, then paste its JSON into the import box below. The web app never executes commands."}
      </p>
      {desktopLoadError ? (
        <p className="cli-bridge-error" role="alert">
          <Icon name="triangle-alert" />
          {desktopLoadError}
        </p>
      ) : null}
      <div className="cli-source-list">
        {sources.map((source) => {
          const loading = desktopLoadStatus === "loading" && desktopLoadSourceId === source.id;
          return (
            <article key={source.id} className="cli-source">
              <header>
                <b>{source.label}</b>
                <Badge label="READ ONLY" tone="green" />
              </header>
              <p>{source.description}</p>
              <code className="cli-source__cmd">{source.displayCommand}</code>
              <footer>
                {desktop ? (
                  <Button
                    label={loading ? "Loading…" : "Load report"}
                    iconName="database"
                    variant="primary"
                    disabled={desktopLoadStatus === "loading"}
                    onClick={() => loadDesktopReport(source.id)}
                  />
                ) : (
                  <>
                    <code className="cli-source__bridge">node tools/realforge-report-bridge.mjs load {source.id}</code>
                    <Button
                      label="Copy command"
                      iconName="clipboard-list"
                      variant="secondary"
                      onClick={() => copyCliCommand(source.id)}
                    />
                  </>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export { CliBridgePanel };
