import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ComposedAction, CommandActionId } from "../../composer/action-model";
import { commandActionDefinitions } from "../../composer/action-model";
import { isDesktopRuntime } from "../../bridge";
import { Button, Icon } from "../../components/primitives";
import { useWorkbenchStore } from "../../state/workbench-store";
import type { ContextPreview } from "../workbench/chat-context";

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
  /** Transparency preview of the bounded visible-chat context that would be included. */
  contextPreview?: ContextPreview;
}

export function ComposerDock({
  action,
  mode,
  onModeChange,
  onAskLocalModel,
  chatRunning = false,
  contextPreview
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
    <form
      className={`composer composer--safe ${askMode ? "composer--chat" : ""}`.trim()}
      data-testid="safe-command-composer"
      onSubmit={onSubmit}
    >
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
          <Icon name="cpu" /> Chat
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

      {!askMode ? (
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
      ) : null}

      <div className="composer-box composer-box--prominent">
        {!askMode ? <Button label="Commands" iconName="slash" variant="slash" onClick={() => openPalette()} /> : null}
        <label className="sr-only" htmlFor="task-context">
          {askMode ? "Local model request" : "Reviewed context for this action"}
        </label>
        <textarea
          id="task-context"
          name="task-context"
          ref={textareaRef}
          rows={4}
          maxLength={2000}
          placeholder={askMode ? "Ask your local model…" : "Describe an action to preview safely…"}
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
          ? "LOCAL UNTRUSTED · session-only · no files, tools, memory, or workspace context"
          : "Stages a dry-run preview only · no model chat · no writes"}
      </p>

      {askMode ? (
        <details className="composer-chat-options" data-testid="composer-chat-options">
          <summary className="composer-chat-options__summary">
            <Icon name="sliders-horizontal" />
            <span>Chat options</span>
            <small>{approved ? "approved for next send" : "approval required"}</small>
          </summary>
          <div className="composer-chat-options__content">
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
              <div className="composer-context-preview" data-testid="composer-context-preview">
                <p className="composer-context-disclosure" data-testid="composer-context-disclosure">
                  <Icon name="shield-check" />
                  {contextPreview && contextPreview.includedTurns > 0
                    ? `Including up to ${contextPreview.includedTurns} visible turn${
                        contextPreview.includedTurns === 1 ? "" : "s"
                      } · ~${contextPreview.approxChars} chars${contextPreview.truncated ? " · capped" : ""} · visible chat only`
                    : "No prior visible turns to include yet — only this prompt is sent."}
                </p>
                {contextPreview && contextPreview.includedTurns > 0 ? (
                  <details className="composer-context-details" data-testid="composer-context-details">
                    <summary>Preview context</summary>
                    <p className="composer-context-note">
                      Only the visible chat text below is added. No files, tools, workspace, memory, or hidden context.
                    </p>
                    <div className="composer-context-entries" data-testid="composer-context-entries">
                      {contextPreview.entries.map((entry, index) => (
                        <div className="composer-context-entry" key={index}>
                          <p><b>You</b> {entry.prompt}</p>
                          <p><b>Local model</b> {entry.responseText}</p>
                        </div>
                      ))}
                    </div>
                    {contextPreview.truncated ? (
                      <p className="composer-context-note">Older turns and long text are trimmed to stay within the cap.</p>
                    ) : null}
                  </details>
                ) : null}
              </div>
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
          </div>
        </details>
      ) : null}
    </form>
  );
}
