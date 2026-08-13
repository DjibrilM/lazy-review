
import {
  AlertCircle,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  GitFork,
  Loader2,
  MessageSquareMore,
  Send,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/util/shared';
import type { ChatMessage } from '../hooks/useChat';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';

interface AIChatSidebarProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: (value: string) => void;
  isChatLoading: boolean;
  handleSend: () => void;
  reviewStatus: 'idle' | 'running' | 'success' | 'error';
  reviewMessage: string;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  changedFiles?: string[];
  onFileClick?: (fileName: string) => void;
}

type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'think'; content: string; complete: boolean };

/**
 * Parses both the normal <think>...</think> format and the alternate thought
 * channel markers used by some models. An unfinished thinking block is marked
 * complete=false so the UI knows it is still actively streaming.
 */
function parseMessageContent(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const thinkStart = content.indexOf('<think>', cursor);
    const channelStart = content.indexOf('<|channel>thought', cursor);

    const candidates = [
      thinkStart >= 0 ? { index: thinkStart, start: '<think>', end: '</think>' } : null,
      channelStart >= 0
        ? { index: channelStart, start: '<|channel>thought', end: '<channel|>' }
        : null,
    ].filter(Boolean) as { index: number; start: string; end: string }[];

    if (candidates.length === 0) {
      const text = content.slice(cursor);
      if (text) parts.push({ type: 'text', content: text });
      break;
    }

    const marker = candidates.sort((a, b) => a.index - b.index)[0];

    if (marker.index > cursor) {
      parts.push({
        type: 'text',
        content: content.slice(cursor, marker.index),
      });
    }

    const thoughtStart = marker.index + marker.start.length;
    const thoughtEnd = content.indexOf(marker.end, thoughtStart);

    if (thoughtEnd === -1) {
      parts.push({
        type: 'think',
        content: content.slice(thoughtStart),
        complete: false,
      });
      break;
    }

    parts.push({
      type: 'think',
      content: content.slice(thoughtStart, thoughtEnd),
      complete: true,
    });

    cursor = thoughtEnd + marker.end.length;
  }

  return parts.filter((part) => part.content.length > 0);
}

function ThinkingPlaceholder() {
  return (
    <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>Thinking…</span>
    </div>
  );
}

function AnimatedThought({
  content,
  isActive,
}: {
  content: string;
  isActive: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isActive);
  const manuallyToggled = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isActive) {
      manuallyToggled.current = false;
      setIsOpen(true);
      return;
    }

    // As soon as thinking finishes, automatically collapse it. The user can
    // still reopen it afterward.
    if (!manuallyToggled.current) {
      setIsOpen(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive && isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isActive, isOpen]);

  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-border/60 bg-muted/20">
      <button
        type="button"
        onClick={() => {
          manuallyToggled.current = true;
          setIsOpen((value) => !value);
        }}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground"
      >
        {isActive ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <BrainCircuit className="h-3 w-3" />
        )}

        <span>{isActive ? 'Thinking' : 'Reasoning'}</span>

        {isActive && (
          <span className="ml-0.5 font-normal text-muted-foreground/60">live</span>
        )}

        {isOpen ? (
          <ChevronDown className="ml-auto h-3 w-3" />
        ) : (
          <ChevronRight className="ml-auto h-3 w-3" />
        )}
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            ref={scrollRef}
            className="max-h-72 overflow-y-auto border-t border-border/50 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground whitespace-pre-wrap"
          >
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentConfirmationRequest({
  msg,
  setMessages,
}: {
  msg: ChatMessage;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}) {
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);

  if (!msg.agentConfirmationData) return null;

  const respond = async (approved: boolean) => {
    if (decision) return;

    setDecision(approved ? 'approve' : 'reject');

    try {
      const { activeSocket } = await import('@/components/providers/SocketProvider');

      activeSocket?.emit('agent-confirmation-response', {
        id: msg.agentConfirmationData!.id,
        approved,
      });

      setMessages((previous) =>
        previous.map((message) =>
          message.id === msg.id
            ? { ...message, requiresConfirmation: undefined }
            : message,
        ),
      );
    } catch {
      setDecision(null);
    }
  };

  return (
    <div className="mt-2.5 overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
          <GitFork className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-foreground">
            GitHub action requires approval
          </div>
          <div className="text-[10px] text-muted-foreground">
            Nothing will be sent until you approve.
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5 text-xs leading-5 text-foreground/90 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_p]:my-1 [&_pre]:text-[11px]">
        <MarkdownRenderer content={msg.agentConfirmationData.question} />
      </div>

      <div className="flex gap-2 border-t border-border/60 bg-muted/15 px-3 py-2">
        <Button
          type="button"
          size="sm"
          onClick={() => respond(true)}
          disabled={decision !== null}
          className="h-7 flex-1 text-[11px]"
        >
          {decision === 'approve' && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          Approve & send
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => respond(false)}
          disabled={decision !== null}
          className="h-7 flex-1 text-[11px]"
        >
          {decision === 'reject' && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AIChatSidebar({
  messages,
  setMessages,
  input,
  setInput,
  isChatLoading,
  handleSend,
  reviewStatus,
  reviewMessage,
  chatEndRef,
  changedFiles,
  onFileClick,
}: AIChatSidebarProps) {
  const parsedMessages = useMemo(
    () =>
      messages.map((message) => ({
        message,
        parts: parseMessageContent(message.content ?? ''),
      })),
    [messages],
  );

  const lastMessage = messages[messages.length - 1];

  // This is the zero-token state: the user has sent a request but the model has
  // not emitted reasoning/content yet.
  const waitingForFirstToken =
    isChatLoading &&
    (!lastMessage ||
      lastMessage.role === 'user' ||
      (lastMessage.role === 'assistant' &&
        !lastMessage.content?.trim() &&
        lastMessage.requiresConfirmation !== 'agent_confirmation'));

  return (
    <div className="relative z-10 flex h-full w-full min-w-[300px] flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <MessageSquareMore className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-wide text-foreground/90">
          Interactive Review Architect
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {parsedMessages.map(({ message: msg, parts }) => {
          const isUser = msg.role === 'user';
          const isSystem = msg.role === 'system';

          return (
            <div
              key={msg.id}
              className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'min-w-0 max-w-[92%]',
                  isUser &&
                  'rounded-xl rounded-br-sm bg-foreground px-3 py-2 text-background',
                  isSystem &&
                  'rounded-md border border-border/60 bg-muted/25 px-2.5 py-2 text-muted-foreground',
                )}
              >
                <div className="space-y-1.5">
                  {parts.map((part, index) => {
                    if (part.type === 'think') {
                      return (
                        <AnimatedThought
                          key={`${msg.id}-think-${index}`}
                          content={part.content}
                          isActive={!part.complete}
                        />
                      );
                    }

                    if (!part.content.trim()) return null;

                    if (isUser || isSystem) {
                      return (
                        <div
                          key={`${msg.id}-text-${index}`}
                          className={cn(
                            'whitespace-pre-wrap text-xs leading-5',
                            isSystem && 'font-mono text-[10px] leading-4',
                          )}
                        >
                          {part.content}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${msg.id}-text-${index}`}
                        className="text-xs leading-5 text-foreground/90 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold [&_li]:my-0.5 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:text-[11px]"
                      >
                        <MarkdownRenderer
                          content={part.content}
                          changedFiles={changedFiles}
                          onFileClick={onFileClick}
                        />
                      </div>
                    );
                  })}
                </div>

                {msg.requiresConfirmation === 'agent_confirmation' && (
                  <AgentConfirmationRequest msg={msg} setMessages={setMessages} />
                )}
              </div>
            </div>
          );
        })}

        {waitingForFirstToken && <ThinkingPlaceholder />}

        {reviewStatus === 'running' && messages.length <= 1 && !waitingForFirstToken && (
          <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Generating review…</span>
          </div>
        )}

        {reviewStatus === 'error' && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{reviewMessage}</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="shrink-0 border-t border-border/70 bg-background p-2.5">
        <div className="relative flex items-end rounded-lg border border-border/80 bg-card transition-shadow focus-within:ring-1 focus-within:ring-ring">
          <textarea
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              event.target.style.height = 'auto';
              event.target.style.height = `${Math.min(event.target.scrollHeight + 2, 144)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();

                if (input.trim() && !isChatLoading) {
                  handleSend();
                }

                event.currentTarget.style.height = 'auto';
              }
            }}
            placeholder="Ask about the PR…"
            className="max-h-36 min-h-9 w-full resize-none overflow-y-auto bg-transparent py-2 pl-2.5 pr-9 text-xs leading-5 outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
            rows={1}
            disabled={isChatLoading}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleSend}
            disabled={isChatLoading || !input.trim()}
            className="absolute bottom-0.5 right-0.5 h-8 w-8 text-muted-foreground"
          >
            {isChatLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <div className="mt-1.5 text-center text-[9px] text-muted-foreground/60">
          Answers grounded in indexed project context
        </div>
      </div>
    </div>
  );
}