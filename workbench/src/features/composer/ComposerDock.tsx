import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ComposedAction, CommandActionId } from "../../composer/action-model";
import { commandActionDefinitions } from "../../composer/action-model";
import { isDesktopRuntime } from "../../bridge";
import { Button, Icon } from "../../components/primitives";
import { useWorkbenchStore } from "../../state/workbench-store";
import { MAX_CONTEXT_TURNS } from "../workbench/chat-context";

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

export type ComposerMode = "preview" | "ask-local";

interface ComposerDockProps {
  action: ComposedAction;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  /** Send one bounded request to the existing private chat sandbox (desktop only). */
  onAskLocalModel?: (prompt: string, includeContext: boolean) => void;
  chatRunning?: boolean;
  /** Count of visible turns eligible to be included as bounded context. */
  availableContextTurns?: number;
}

export function ComposerDock({
  action,
  mode,
  onModeChange,
  onAskLocalModel,
  chatRunning = false,
  availableContextTurns = 0
}: ComposerDockProps) {
  const openPalette = useWorkbenchStore((state) => state.openPalette);
  const composeActionPreview = useWorkbenchStore((state) => state.composeActionPreview);
  const stageTask = useWorkbenchStore((state) => state.stageTask);
  const showToast = useWorkbenchStore((state) => state.showToast);

  const desktop = isDesktopRuntime();
  const [approved, setApproved] = useState(false);
  const [includeContext, setIncludeContext] = useState(false);
  const intentsRef = useRef<HTMLDetailsElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const askMode = mode === "ask-local";

  // A pending approval never carries across a mode switch.
  useEffect(() => setApproved(false), [mode]);

  const sendDisabled = askMode && (!desktop || !approved || chatRunning);

  const sendAskLocal = () => {
    const input = (textareaRef.current?.value ?? "").trim();
    if (!input) {
      showToast("Enter text for the local model sandbox", "warn");
      return;
    }
    // No hidden auto-send: a desktop runtime, an explicit approval, and a
    // deliberate send (button or Enter) are all required before a request leaves the UI.
    if (!desktop) {
      showToast("The local model sandbox runs in the desktop app only", "warn");
      return;
    }
    if (!approved) {
      showToast("Approve the local model request before sending", "warn");
      return;
    }
    if (chatRunning) return;
    onAskLocalModel?.(input, includeContext);
    setApproved(false);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      // Keep the composer ready for the next message (button-send moved focus away).
      textareaRef.current.focus();
    }
  };

  const stagePreview = () => {
    const input = (textareaRef.current?.value ?? "").trim();
    if (!input) {
      showToast("Add reviewed context for the composed action", "warn");
      return;
    }
    stageTask(input);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (askMode) sendAskLocal();
    else stagePreview();
  };

  // Standard chat keyboard behavior, in Ask-local mode only. Safe preview keeps
  // the default textarea behavior (Enter inserts a newline; never sends/executes).
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!askMode) return;
    if (event.key !== "Enter") return;
    if (event.shiftKey) return; // Shift+Enter → newline
    // Enter, Cmd+Enter, or Ctrl+Enter → send (gates re-checked in sendAskLocal).
    event.preventDefault();
    sendAskLocal();
  };

  const switchMode = (next: ComposerMode) => {
    if (next === "ask-local" && !desktop) return;
    onModeChange(next);
  };

  const closeSuggestions = () => {
    if (intentsRef.current) intentsRef.current.open = false;
  };

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
          {desktop ? (
            <span className="composer-mode__tag composer-mode__tag--quiet">local untrusted</span>
          ) : (
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
        <>
          <div className="composer-profile" data-testid="composer-profile">
            <label htmlFor="local-model-profile">Local model profile</label>
            <select id="local-model-profile" value="default" disabled aria-describedby="local-model-profile-note">
              <option value="default">Configured local provider</option>
            </select>
            <small id="local-model-profile-note">
              Uses your configured default local provider. Profile selection isn&rsquo;t available yet — no model
              name, endpoint, or key is shown.
            </small>
          </div>

          <label className="composer-context-toggle" data-testid="composer-context-toggle">
            <input
              type="checkbox"
              checked={includeContext}
              disabled={chatRunning}
              onChange={(event) => setIncludeContext(event.currentTarget.checked)}
            />
            <span>
              <b>Include recent visible chat</b>
              <small>Sends the last few visible turns with this prompt. No files, tools, or memory.</small>
            </span>
          </label>

          {includeContext ? (
            <p className="composer-context-disclosure" data-testid="composer-context-disclosure">
              <Icon name="shield-check" />
              {availableContextTurns > 0
                ? `Including up to ${Math.min(availableContextTurns, MAX_CONTEXT_TURNS)} visible turn${
                    Math.min(availableContextTurns, MAX_CONTEXT_TURNS) === 1 ? "" : "s"
                  } · capped · visible chat only`
                : "No prior visible turns to include yet — only this prompt is sent."}
            </p>
          ) : null}

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
        </>
      ) : (
        <details ref={intentsRef} className="composer-intents-wrap" data-testid="composer-intents-wrap">
          <summary className="composer-intents-summary">
            <Icon name="sparkles" />
            Suggestions
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
                  onClick={() => {
                    composeActionPreview(actionId);
                    closeSuggestions();
                  }}
                >
                  {definition.title}
                </button>
              );
            })}
            <button type="button" onClick={() => {
              closeSuggestions();
              openPalette();
            }}>
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
          ref={textareaRef}
          rows={4}
          maxLength={2000}
          placeholder={askMode ? "Ask one bounded local-model question…" : "What do you want to work on?"}
          onKeyDown={onKeyDown}
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
          ? "Enter sends · Shift+Enter for a newline · LOCAL UNTRUSTED · nothing saved."
          : "Approval-first · no writes by default · local output is untrusted."}
      </p>
    </form>
  );
}
