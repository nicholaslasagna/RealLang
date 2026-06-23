import { type FormEvent, useState } from "react";
import type { ComposedAction, CommandActionId } from "../../composer/action-model";
import { commandActionDefinitions } from "../../composer/action-model";
import { isDesktopRuntime } from "../../bridge";
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

type ComposerMode = "preview" | "ask-local";

interface ComposerDockProps {
  action: ComposedAction;
  /** Send one bounded request to the existing private chat sandbox (desktop only). */
  onAskLocalModel?: (prompt: string) => void;
  chatRunning?: boolean;
}

export function ComposerDock({ action, onAskLocalModel, chatRunning = false }: ComposerDockProps) {
  const openPalette = useWorkbenchStore((state) => state.openPalette);
  const composeActionPreview = useWorkbenchStore((state) => state.composeActionPreview);
  const stageTask = useWorkbenchStore((state) => state.stageTask);
  const showToast = useWorkbenchStore((state) => state.showToast);

  const desktop = isDesktopRuntime();
  const [mode, setMode] = useState<ComposerMode>("preview");
  const [approved, setApproved] = useState(false);
  const askMode = mode === "ask-local";

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = (form.elements.namedItem("task-context") as HTMLTextAreaElement | null)?.value.trim() ?? "";
    if (!input) {
      showToast(askMode ? "Enter text for the local model sandbox" : "Add reviewed context for the composed action", "warn");
      return;
    }
    if (askMode) {
      // No hidden auto-send: a desktop runtime, an explicit approval, and a
      // deliberate submit are all required before any request leaves the UI.
      if (!desktop) {
        showToast("The local model sandbox runs in the desktop app only", "warn");
        return;
      }
      if (!approved) {
        showToast("Approve the local model request before sending", "warn");
        return;
      }
      if (chatRunning) return;
      onAskLocalModel?.(input);
      setApproved(false);
      form.reset();
      return;
    }
    stageTask(input);
  };

  const switchMode = (next: ComposerMode) => {
    if (next === "ask-local" && !desktop) return;
    setMode(next);
    setApproved(false);
  };

  const sendDisabled = askMode && (!desktop || !approved || chatRunning);

  return (
    <form className="composer composer--safe" data-testid="safe-command-composer" onSubmit={onSubmit}>
      <div className="composer-mode" role="group" aria-label="Composer mode">
        <button
          type="button"
          data-testid="mode-safe-preview"
          className={!askMode ? "is-active" : ""}
          aria-pressed={!askMode}
          onClick={() => switchMode("preview")}
        >
          <Icon name="eye" /> Safe preview
        </button>
        <button
          type="button"
          data-testid="mode-ask-local"
          className={`composer-mode__ask ${askMode ? "is-active" : ""}`.trim()}
          aria-pressed={askMode}
          disabled={!desktop}
          title={desktop ? undefined : "Available in the desktop app only"}
          onClick={() => switchMode("ask-local")}
        >
          <Icon name="cpu" /> Ask local model
          {desktop ? <span className="composer-mode__tag composer-mode__tag--quiet">local untrusted</span> : (
            <span className="composer-mode__tag">desktop only</span>
          )}
        </button>
      </div>

      {!desktop ? (
        <p className="composer-mode__webnote" data-testid="composer-web-note">
          <Icon name="lock-keyhole" /> Local model chat runs in the desktop app only. Web preview never contacts a
          provider — use Safe preview to compose actions.
        </p>
      ) : null}

      {askMode ? (
        <label className="composer-approval" data-testid="composer-ask-approval">
          <input
            type="checkbox"
            checked={approved}
            disabled={!desktop || chatRunning}
            onChange={(event) => setApproved(event.currentTarget.checked)}
          />
          <span>
            <b>Approve one local model request</b>
            <small>
              Your text is sent only to the user-configured local model sandbox. No files, workspace
              context, tools, memory, or history are included. Output is LOCAL UNTRUSTED and is not persisted.
            </small>
          </span>
        </label>
      ) : (
        <details className="composer-intents-wrap" data-testid="composer-intents-wrap">
          <summary className="composer-intents-summary">
            <Icon name="sparkles" />
            Quick intents
          </summary>
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
        </details>
      )}

      <div className="composer-box composer-box--prominent">
        <Button label="Commands" iconName="slash" variant="slash" onClick={() => openPalette()} />
        <label className="sr-only" htmlFor="task-context">
          {askMode ? "Local model request" : "Reviewed context for this action"}
        </label>
        <textarea
          id="task-context"
          name="task-context"
          rows={3}
          maxLength={2000}
          disabled={askMode && chatRunning}
          placeholder={askMode ? "Ask the local model one bounded question…" : "Describe what you want to build or fix…"}
        />
        <button
          className="send-button"
          type="submit"
          aria-label={askMode ? "Ask local model" : "Stage action context"}
          disabled={sendDisabled}
        >
          <Icon name="arrow-up" />
        </button>
      </div>

      <p className="composer-hint">
        {askMode
          ? "One bounded request to your local model · LOCAL UNTRUSTED · no files, tools, or memory · nothing persisted."
          : "Plain language only — no shell input. Nothing runs or is written without your explicit approval."}
      </p>
    </form>
  );
}
