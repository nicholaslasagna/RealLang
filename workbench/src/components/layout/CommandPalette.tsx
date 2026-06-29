import { useEffect, useRef, useState } from "react";
import { composeActionPlan, getActionForSlashCommand } from "../../composer/action-model";
import { useComposerRuntime } from "../../composer/use-composer-runtime";
import { CommandActionDetail } from "../../features/composer/CommandActionDetail";
import { commandTone, filterCommands, useWorkbenchStore } from "../../state/workbench-store";
import { getWorkbenchData } from "../../data/workbench-data";
import { Badge, Button, Icon } from "../primitives";

export function CommandPalette() {
  const paletteOpen = useWorkbenchStore((s) => s.paletteOpen);
  const commandQuery = useWorkbenchStore((s) => s.commandQuery);
  const setCommandQuery = useWorkbenchStore((s) => s.setCommandQuery);
  const closePalette = useWorkbenchStore((s) => s.closePalette);
  const composeActionPreview = useWorkbenchStore((s) => s.composeActionPreview);
  const staffPreview = useWorkbenchStore((s) => s.staffPreview);
  const openPalette = useWorkbenchStore((s) => s.openPalette);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const data = getWorkbenchData();
  const commands = filterCommands(commandQuery);
  const query = commandQuery.trim();
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
  const runtime = useComposerRuntime(staffPreview);
  const activeCommand = commands.find((command) => command.command === selectedCommand) ?? commands[0] ?? null;
  const actionDefinition = activeCommand ? getActionForSlashCommand(activeCommand.command) : null;
  const composedAction = actionDefinition ? composeActionPlan(actionDefinition.id, runtime) : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (paletteOpen && !dialog.open) dialog.showModal();
    if (!paletteOpen && dialog.open) dialog.close();
  }, [paletteOpen]);

  useEffect(() => {
    if (paletteOpen && inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [paletteOpen, commandQuery]);

  useEffect(() => {
    if (!paletteOpen) setSelectedCommand(null);
  }, [paletteOpen]);

  return (
    <dialog
      ref={dialogRef}
      className="command-dialog"
      aria-labelledby="command-title"
      onClose={closePalette}
      onClick={(event) => {
        if (event.target === dialogRef.current) closePalette();
      }}
    >
      <form className="command-palette-form" method="dialog" onSubmit={(e) => e.preventDefault()}>
        <header>
          <span className="palette-icon">
            <Icon name="command" />
          </span>
          <div className="palette-search">
            <span>REALFORGE COMMAND CENTER</span>
            <label className="sr-only" htmlFor="command-search">
              Search commands
            </label>
            <input
              ref={inputRef}
              id="command-search"
              type="search"
              autoComplete="off"
              placeholder="Search commands, domains, or safety levels"
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
              onKeyDown={(e) => {
                if (!commands.length) return;
                const i = Math.max(0, commands.findIndex((c) => c.command === activeCommand?.command));
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedCommand(commands[(i + 1) % commands.length].command);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedCommand(commands[(i - 1 + commands.length) % commands.length].command);
                } else if (e.key === "Enter" && actionDefinition) {
                  e.preventDefault();
                  composeActionPreview(actionDefinition.id);
                }
              }}
            />
          </div>
          <button className="icon-button" type="button" onClick={closePalette} aria-label="Close command palette">
            <Icon name="x" />
          </button>
        </header>
        <div className="palette-meta">
          <span>{query ? `RESULTS FOR “${commandQuery}”` : "ALL CAPABILITY DOMAINS"}</span>
          <span>
            {commands.length} OF {data.commands.length} COMMANDS
          </span>
        </div>
        <div className="command-palette-body">
          <div className="command-results" role="listbox" aria-label="Structured command intents">
            {commands.length ? (
              commands.map((command) => (
                <button
                  key={command.command}
                  type="button"
                  role="option"
                  className={command.command === activeCommand?.command ? "is-selected" : ""}
                  aria-selected={command.command === activeCommand?.command}
                  onClick={() => setSelectedCommand(command.command)}
                >
                  <span className="command-name">
                    <code>{command.command}</code>
                    <small>{command.domain}</small>
                  </span>
                  <span className="command-description">{command.description}</span>
                  <span className="command-badges">
                    <Badge label={command.safety} tone={commandTone(command)} />
                    <Badge
                      label={command.writes === "no" ? "NO WRITES" : `WRITES ${command.writes.toUpperCase()}`}
                      tone={command.writes === "no" ? "green" : "neutral"}
                    />
                    {command.staff ? <Badge label="STAFF ONLY" tone="violet" /> : null}
                    {command.network ? <Badge label="NETWORK" tone="amber" /> : null}
                  </span>
                  <Icon name="chevron-right" />
                </button>
              ))
            ) : (
              <div className="palette-empty">
                <Icon name="search" />
                <h2>No command found</h2>
                <p>Try a domain such as code, image, engine, eval, or staff.</p>
                <Button label="Clear search" iconName="x" variant="ghost" onClick={() => openPalette("")} />
              </div>
            )}
          </div>
          {commands.length ? (
            <CommandActionDetail action={composedAction} onCompose={composeActionPreview} />
          ) : null}
        </div>
        <footer>
          <span>
            <Icon name="shield-check" /> Preview only
          </span>
          <span>
            <Icon name="file-x" /> No writes
          </span>
          <b>Provider output remains untrusted until validated</b>
        </footer>
      </form>
    </dialog>
  );
}
