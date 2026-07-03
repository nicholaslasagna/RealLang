import { useEffect, useRef } from "react";
import type { ProviderChatSandboxResult } from "../../bridge";
import { Button, Icon } from "../../components/primitives";
import { WorkbenchChatTurn } from "./WorkbenchChatTurn";

/** One visible exchange. Session-only React state — never persisted or sent back to the provider. */
export interface ChatTurn {
  id: number;
  prompt: string;
  result: ProviderChatSandboxResult | null;
  running: boolean;
  /** True when recent visible turns were composed into this request's prompt. */
  contextIncluded?: boolean;
  /** Live response tokens accumulated while the request streams (desktop). */
  streamingText?: string;
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
  const endRef = useRef<HTMLDivElement | null>(null);
  const last = turns[turns.length - 1];

  // Keep the newest turn (and its incoming response) in view after send/response.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [turns.length, last?.running, last?.result, last?.streamingText]);

  return (
    <section className="chat-thread" data-testid="workbench-chat-thread" aria-label="Local model conversation">
      {turns.length === 0 ? (
        <p className="chat-thread__empty" data-testid="chat-thread-empty">
          <Icon name="cpu" /> Ask a bounded question to start a local-model conversation. Session view only —
          each call is independent and nothing is saved.
        </p>
      ) : (
        <>
          <div className="chat-thread__bar">
            <span className="chat-thread__note" data-testid="chat-thread-note">
              <Icon name="shield-check" /> Session view only · each call is bounded · prior turns aren&rsquo;t sent · nothing saved
            </span>
            <Button
              label="Clear chat"
              iconName="x"
              variant="ghost"
              data-testid="chat-thread-clear"
              onClick={onClear}
            />
          </div>
          <div className="chat-thread__turns">
            {turns.map((turn) => (
              <WorkbenchChatTurn
                key={turn.id}
                prompt={turn.prompt}
                result={turn.result}
                running={turn.running}
                streamingText={turn.streamingText}
                contextIncluded={turn.contextIncluded}
                onConfigureProvider={onConfigureProvider}
              />
            ))}
            <div ref={endRef} data-testid="chat-thread-end" aria-hidden="true" />
          </div>
        </>
      )}
    </section>
  );
}
