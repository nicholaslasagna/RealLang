import { type FormEvent } from "react";
import type { ComposedAction, CommandActionId } from "../../composer/action-model";
import { commandActionDefinitions } from "../../composer/action-model";
import { Button, Icon } from "../../components/primitives";
import { useWorkbenchStore } from "../../state/workbench-store";

const quickActionIds: readonly CommandActionId[] = [
  "check-reallang-file",
  "check-reallang-workspace-file",
  "load-capabilities",
  "load-slash-registry",
  "settings-doctor",
  "repair-diagnostic-dry-run",
  "creative-brief",
  "skill-benchmark"
];

interface ComposerDockProps {
  action: ComposedAction;
}

export function ComposerDock({ action }: ComposerDockProps) {
  const openPalette = useWorkbenchStore((state) => state.openPalette);
  const composeActionPreview = useWorkbenchStore((state) => state.composeActionPreview);
  const stageTask = useWorkbenchStore((state) => state.stageTask);
  const showToast = useWorkbenchStore((state) => state.showToast);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = (event.currentTarget.elements.namedItem("task-context") as HTMLTextAreaElement | null)?.value.trim() ?? "";
    if (!input) {
      showToast("Add reviewed context for the composed action", "warn");
      return;
    }
    stageTask(input);
  };

  return (
    <form className="composer composer--safe" data-testid="safe-command-composer" onSubmit={onSubmit}>
      <div className="composer-intents" aria-label="Quick action intents">
        {quickActionIds.map((actionId) => {
          const definition = commandActionDefinitions.find((candidate) => candidate.id === actionId);
          if (!definition) return null;
          return (
            <button
              key={actionId}
              type="button"
              className={definition.id === action.id ? "is-active" : ""}
              onClick={() => composeActionPreview(actionId)}
            >
              {definition.title}
            </button>
          );
        })}
        <button type="button" onClick={() => openPalette()}>
          All intents <Icon name="command" />
        </button>
      </div>
      <div className="composer-box">
        <Button label="Commands" iconName="slash" variant="slash" onClick={() => openPalette()} />
        <label className="sr-only" htmlFor="task-context">Reviewed context for this action</label>
        <textarea
          id="task-context"
          name="task-context"
          rows={2}
          placeholder="Describe what you want to build or fix…"
        />
        <button className="send-button" type="submit" aria-label="Stage action context">
          <Icon name="arrow-up" />
        </button>
      </div>
      <p className="composer-hint">
        Plain language only — no shell input. Nothing runs or is written without your explicit approval.
      </p>
    </form>
  );
}
