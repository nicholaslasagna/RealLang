import { type ChangeEvent, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ComposedAction, CommandActionId } from "../../composer/action-model";
import { commandActionDefinitions, getActionForSlashCommand } from "../../composer/action-model";
import { isDesktopRuntime } from "../../bridge";
import {
  getModelProviderProfile,
  MODEL_PROVIDER_PROFILES
} from "../../providers";
import { Button, Icon } from "../../components/primitives";
import { commandTone, filterCommands, useWorkbenchStore } from "../../state/workbench-store";
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

function slashPaletteQuery(raw: string): string | null {
  const firstLine = raw.trimStart().split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine.startsWith("/")) return null;
  if (firstLine === "/" || /^\/commands?$/.test(firstLine)) return "";
  return firstLine;
}

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
  const selectedModelProfileId = useWorkbenchStore((state) => state.selectedModelProfileId);
  const selectModelProfile = useWorkbenchStore((state) => state.selectModelProfile);

  const desktop = isDesktopRuntime();
  const [approved, setApproved] = useState(false);
  const [includeContext, setIncludeContext] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const intentsRef = useRef<HTMLDetailsElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const askMode = mode === "ask-local";
  const selectedModelProfile =
    getModelProviderProfile(selectedModelProfileId) ??
    MODEL_PROVIDER_PROFILES[0];
  const chatProfileReady = selectedModelProfile.id === "private-local";
  const slashMatches = slashQuery === null ? [] : filterCommands(slashQuery).slice(0, 8);

  // A pending approval never carries across a mode switch.
  useEffect(() => setApproved(false), [mode]);

  const sendDisabled = askMode && (!desktop || !approved || chatRunning || !chatProfileReady);

  const sendAskLocal = () => {
    const input = (textareaRef.current?.value ?? "").trim();
    const query = slashPaletteQuery(input);
    if (query !== null) {
      setSlashQuery(query);
      if (askMode) onModeChange("preview");
      return;
    }
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
    if (!chatProfileReady) {
      showToast("Select Private Local Model before sending chat", "warn");
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
    const query = slashPaletteQuery(input);
    if (query !== null) {
      setSlashQuery(query);
      if (askMode) onModeChange("preview");
      return;
    }
    if (!input) {
      showToast(askMode ? "Describe what you want to preview safely" : "Add reviewed context for the composed action", "warn");
      return;
    }
    stageTask(input);
    if (askMode) onModeChange("preview");
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (askMode) sendAskLocal();
    else stagePreview();
  };

  // Standard chat keyboard behavior, in Ask-local mode only. Safe preview keeps
  // the default textarea behavior (Enter inserts a newline; never sends/executes).
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const query = slashPaletteQuery(event.currentTarget.value);
    if (query !== null && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const firstMatch = filterCommands(query)[0];
      if (firstMatch) selectSlashCommand(firstMatch.command);
      else setSlashQuery(query);
      return;
    }
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

  const openSlashPalette = (query: string) => {
    if (askMode) onModeChange("preview");
    setSlashQuery(query);
  };

  const onTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const query = slashPaletteQuery(event.currentTarget.value);
    if (query !== null) {
      openSlashPalette(query);
      return;
    }
    if (slashQuery !== null) setSlashQuery(null);
  };

  const selectSlashCommand = (command: string) => {
    const actionDefinition = getActionForSlashCommand(command);
    setSlashQuery(null);
    if (textareaRef.current) textareaRef.current.value = "";
    if (actionDefinition) {
      composeActionPreview(actionDefinition.id);
      onModeChange("preview");
      return;
    }
    openPalette(command);
  };

  return (
    <form
      className={`composer composer--safe ${askMode ? "composer--chat" : ""}`.trim()}
      data-testid="safe-command-composer"
      onSubmit={onSubmit}
    >
      <div className="composer-mode composer-mode--single" role="group" aria-label="Composer action">
        {askMode ? (
          <span className="composer-mode__state" data-testid="mode-ask-local">
            <Icon name="cpu" /> Chat
            <span className="composer-mode__tag composer-mode__tag--quiet">local untrusted</span>
          </span>
        ) : null}
        <button
          type="button"
          data-testid="mode-safe-preview"
          className={!askMode ? "is-active" : ""}
          aria-pressed={!askMode}
          onClick={() => (askMode ? stagePreview() : switchMode("preview"))}
        >
          <Icon name="eye" /> {askMode ? "Preview action" : "Safe preview"}
        </button>
        {!askMode && desktop ? (
          <button
            type="button"
            data-testid="mode-ask-local-button"
            className="composer-mode__ask"
            aria-pressed={false}
            onClick={() => switchMode("ask-local")}
          >
            <Icon name="cpu" /> Back to chat
          </button>
        ) : null}
      </div>

      {!desktop ? (
        <p className="composer-mode__webnote" data-testid="composer-web-note">
          <Icon name="lock-keyhole" /> Local model chat runs in the desktop app only. Web preview never contacts a
          provider — use Preview action to compose safely.
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
          placeholder={askMode ? "Ask your local model, or preview an action…" : "Describe an action to preview safely…"}
          onChange={onTextChange}
          onKeyDown={onKeyDown}
        />
        {askMode ? (
          <div className="composer-send-stack">
            <label className="composer-inline-approval" data-testid="composer-ask-approval">
              <input
                type="checkbox"
                checked={approved}
                disabled={!desktop || chatRunning}
                onChange={(event) => setApproved(event.currentTarget.checked)}
              />
              <span>
                <b>Approve one local model request</b>
                <small>no files/tools/memory</small>
              </span>
            </label>
            <button
              className="send-button"
              type="submit"
              aria-label="Ask local model"
              disabled={sendDisabled}
            >
              <Icon name="arrow-up" />
            </button>
          </div>
        ) : (
          <button
            className="send-button"
            type="submit"
            aria-label="Stage action context"
          >
            <Icon name="arrow-up" />
          </button>
        )}
      </div>

      <p className="composer-hint">
        {askMode
          ? `${selectedModelProfile.displayName} · session-only · no files, tools, memory, or workspace context`
          : "Stages a dry-run preview only · no model chat · no writes"}
      </p>

      {slashQuery !== null ? (
        <div className="composer-slash-menu" data-testid="composer-slash-menu" role="listbox" aria-label="Slash command suggestions">
          <header>
            <span>COMMANDS</span>
            <button type="button" onClick={() => {
              openPalette(slashQuery);
              setSlashQuery(null);
            }}>
              All commands <Icon name="command" />
            </button>
          </header>
          {slashMatches.length ? (
            <div className="composer-slash-menu__list">
              {slashMatches.map((command) => (
                <button
                  key={command.command}
                  type="button"
                  role="option"
                  onClick={() => selectSlashCommand(command.command)}
                >
                  <code>{command.command}</code>
                  <span>{command.description}</span>
                  <small>{command.domain}</small>
                  <em className={`slash-safety slash-safety--${commandTone(command)}`}>{command.safety}</em>
                </button>
              ))}
            </div>
          ) : (
            <p>No matching slash command. Open all commands to browse the registry.</p>
          )}
        </div>
      ) : null}

      {askMode ? (
        <details className="composer-chat-options" data-testid="composer-chat-options">
          <summary className="composer-chat-options__summary">
            <Icon name="sliders-horizontal" />
            <span>Chat options</span>
            <small>
              {approved ? "approved" : "approval required"} · {includeContext ? "context on" : "context off"}
            </small>
          </summary>
          <div className="composer-chat-options__content">
            <div className="composer-profile" data-testid="composer-profile">
              <label htmlFor="local-model-profile">Local model profile</label>
              <select
                id="local-model-profile"
                value={selectedModelProfile.id}
                disabled={chatRunning}
                aria-describedby="local-model-profile-note"
                onChange={(event) => selectModelProfile(event.currentTarget.value)}
              >
                <option value="private-local">Configured local provider</option>
                <option value="mock">Deterministic Mock</option>
                <option value="private-local-image" disabled>Private Local Image Model</option>
              </select>
              <small id="local-model-profile-note">
                Uses your configured default local provider when Private Local Model is selected. No model name,
                endpoint, or key is shown.
              </small>
              {!chatProfileReady ? (
                <small className="composer-profile__warning">
                  Select Private Local Model to send chat; this profile is preview-only here.
                </small>
              ) : null}
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
          </div>
        </details>
      ) : null}
    </form>
  );
}
