import type { ProviderChatSandboxResult } from "../../bridge";
import { Button, Icon } from "../../components/primitives";
import { WorkbenchChatTurn } from "./WorkbenchChatTurn";

/** One visible exchange. Session-only React state — never persisted or sent back to the provider. */
export interface ChatTurn {
  id: number;
  prompt: string;
  result: ProviderChatSandboxResult | null;
  running: boolean;
}

interface WorkbenchChatThreadProps {
  turns: readonly ChatTurn[];
  onClear: () => void;
  onConfigureProvider?: () => void;
}

/**
 * Session-only visible local-model conversation. The UI shows the back-and-forth,
 * but each call to the provider remains a single bounded request — prior turns are
 * NOT sent. Nothing is written to disk, the approval audit, or hidden memory.
 */
export function WorkbenchChatThread({ turns, onClear, onConfigureProvider }: WorkbenchChatThreadProps) {
  return (
    <section className="chat-thread" data-testid="workbench-chat-thread" aria-label="Local model conversation">
      {turns.length === 0 ? (
        <p className="chat-thread__empty" data-testid="chat-thread-empty">
          <Icon name="cpu" /> Ask a bounded question to start a local-model conversation. Session view only —
          each call is independent and nothing is saved.
        </p>
      ) : (
        <>
          <div className="chat-thread__turns">
            {turns.map((turn) => (
              <WorkbenchChatTurn
                key={turn.id}
                prompt={turn.prompt}
                result={turn.result}
                running={turn.running}
                onConfigureProvider={onConfigureProvider}
              />
            ))}
          </div>
          <div className="chat-thread__footer">
            <span className="chat-thread__note" data-testid="chat-thread-note">
              <Icon name="shield-check" /> Session view only · each local call is bounded · prior turns are not
              sent · nothing is persisted
            </span>
            <Button
              label="Clear chat"
              iconName="x"
              variant="ghost"
              data-testid="chat-thread-clear"
              onClick={onClear}
            />
          </div>
        </>
      )}
    </section>
  );
}
