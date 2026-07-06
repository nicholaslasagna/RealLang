import { getWorkbenchData } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import type { WorkbenchScreen } from "../../state/types";
import { Badge, Button, Icon, SectionHeading } from "../../components/primitives";
import { ImageGenerator } from "./ImageGenerator";
import { CreativeBriefPanel } from "./CreativeBriefPanel";
import { AssetsPlanPanel } from "./AssetsPlanPanel";
import { EngineUnrealPanel } from "./EngineUnrealPanel";

const STUDIO_TABS: WorkbenchScreen[] = ["creative", "image", "vision", "engine", "assets"];

interface StudioScreenProps {
  screen: WorkbenchScreen;
}

export function StudioScreen({ screen }: StudioScreenProps) {
  const data = getWorkbenchData();
  const navigate = useWorkbenchStore((s) => s.navigate);
  const previewCommand = useWorkbenchStore((s) => s.previewCommand);
  const openPalette = useWorkbenchStore((s) => s.openPalette);
  const content = data.studio[screen];
  if (!content) return null;

  const [exampleTitle, exampleIcon, exampleDescription, exampleCommand, exampleAction] = content.example;

  return (
    <div className="screen studio-screen">
      <div className="studio-tabs" role="tablist" aria-label="Creative workflows">
        {STUDIO_TABS.map((tab) => {
          const nav = data.navigation.find((item) => item.id === tab);
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={screen === tab}
              className={screen === tab ? "is-active" : ""}
              onClick={() => navigate(tab)}
            >
              <Icon name={nav?.icon ?? "box"} />
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          );
        })}
      </div>
      <SectionHeading eyebrow={content.eyebrow} title={content.title} description={content.description} />
      {screen === "image" ? (
        <ImageGenerator />
      ) : screen === "creative" ? (
        <CreativeBriefPanel />
      ) : screen === "assets" ? (
        <AssetsPlanPanel />
      ) : screen === "engine" ? (
        <EngineUnrealPanel />
      ) : (
      <>
      <div className={`workflow-notice workflow-notice--${content.accent}`}>
        <Icon name="shield-check" />
        <span>Planning only. RealForge will not change files or run tools from this page.</span>
      </div>
      <section className={`studio-launch studio-launch--${content.accent}`}>
        <span className="studio-launch__icon">
          <Icon name={exampleIcon} />
        </span>
        <div>
          <p className="eyebrow">START WITH AN EXAMPLE</p>
          <h2>{exampleTitle}</h2>
          <p>{exampleDescription}</p>
          <code>{exampleCommand}</code>
        </div>
        <Button
          label={exampleAction}
          iconName="arrow-right"
          variant="primary"
          onClick={() => previewCommand(exampleCommand)}
        />
      </section>
      <div className="workflow-section-heading">
        <div>
          <p className="eyebrow">WORKFLOWS</p>
          <h2>Start from a structured plan</h2>
        </div>
        <span>Review every output before use</span>
      </div>
      <div className="workflow-grid">
        {content.items.map(([title, iconName, description, command, status]) => (
          <article key={title} className="workflow-card">
            <header>
              <span>
                <Icon name={iconName} />
              </span>
              <Badge
                label={status}
                tone={status === "UNTRUSTED" ? "amber" : status === "APPROVAL" ? "violet" : status === "READ ONLY" ? "cyan" : "blue"}
              />
            </header>
            <h2>{title}</h2>
            <p>{description}</p>
            <footer>
              <code>{command}</code>
              <button className="icon-button" type="button" onClick={() => previewCommand(command)} aria-label={`Preview ${title}`}>
                <Icon name="arrow-right" />
              </button>
            </footer>
          </article>
        ))}
      </div>
      <section className="studio-empty">
        <div>
          <Icon name="circle-dot" />
          <span>
            <b>No planning artifacts yet</b>
            <small>Future validated CLI reports will appear here. This prototype stores nothing.</small>
          </span>
        </div>
        <Button label="Browse all commands" iconName="command" variant="ghost" onClick={() => openPalette()} />
      </section>
      </>
      )}
    </div>
  );
}
