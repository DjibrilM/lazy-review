import {
    AlertCircle,
    Loader2,
    MessageSquareMore,
    Send,
    Copy,
    Check,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/util/shared';
import { normalizeReasoningMarkers } from '@/lib/util/chat-markers';
import type { ChatMessage } from '../hooks/useChat';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { parseMessageContent } from '../utils/chat-parser';
import { AnimatedThought } from './AnimatedThought';
import { AgentConfirmationRequest } from './AgentConfirmationRequest';
import Visible from "@/components/common/Visible";

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



function CopyButton({ text, isUser }: { text: string; isUser?: boolean }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className={cn(
                "flex items-center gap-1.5 text-[10px] transition-colors",
                isUser ? "text-background/70 hover:text-background" : "text-muted-foreground hover:text-foreground"
            )}
            title="Copy message"
        >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

function ThinkingPlaceholder() {
    return (
        <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Thinking…</span>
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
                parts: parseMessageContent(normalizeReasoningMarkers(message.content ?? '')),
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



    const test =
        '<|channel>thought\n' +
        'The user is just saying "hey" again. Since there is no specific request, ' +
        'I should prompt them to give me a task.' +
        "<channel|>Hello! Let me know what you'd like me to look at.";

    console.log('PARSER TEST:', parseMessageContent(test));

    const marker = '<|channel>thought';

    console.log('TEST:', JSON.stringify(test));
    console.log('MARKER:', JSON.stringify(marker));

    console.log('includes:', test.includes(marker));
    console.log('indexOf:', test.indexOf(marker));

    console.log(
        'test chars:',
        [...test.slice(0, marker.length)].map((char) => ({
            char,
            code: char.charCodeAt(0),
        })),
    );

    console.log(
        'marker chars:',
        [...marker].map((char) => ({
            char,
            code: char.charCodeAt(0),
        })),
    );

    console.log('PARSER TEST:', parseMessageContent(test));

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
                    console.log(msg, 'message')
                    const isUser = msg.role === 'user';
                    const isSystem = msg.role === 'system';



                    return (
                        <div
                            key={msg.id}
                            className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
                        >
                            <div
                                className={cn(
                                    'min-w-0 max-w-[92%] relative gap-3',
                                    isUser &&
                                    'rounded-xl rounded-br-sm bg-foreground px-3 py-2 text-background',
                                    isSystem &&
                                    'rounded-md border border-border/60 bg-muted/25 px-2.5 py-2 text-muted-foreground',
                                    {
                                        "flex": isUser
                                    }
                                )}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="space-y-1.5">
                                        {parts.map((part, index) => {


                                            console.log('🔥 RENDER PART', {
                                                messageId: msg.id,
                                                index,
                                                type: part.type,
                                                content: part.content,
                                                ...(part.type === 'think'
                                                    ? { complete: part.complete }
                                                    : {}),
                                            });




                                            if (part.type === 'think') {


                                                console.log('🧠 RENDERING AnimatedThought');


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

                                    <Visible visible={msg.requiresConfirmation === 'agent_confirmation'}>
                                        <AgentConfirmationRequest msg={msg} setMessages={setMessages} />
                                    </Visible>
                                </div>

                                {msg.content && msg.content.trim() && !isSystem && (
                                    <div className="shrink-0 pt-0.5 flex items-start transition-opacity group-hover:opacity-100">
                                        <CopyButton text={msg.content} isUser={isUser} />
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                <Visible visible={waitingForFirstToken}>
                    <ThinkingPlaceholder />
                </Visible>

                <Visible visible={reviewStatus === 'idle' && messages.length <= 1}>
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground/60">
                        <MessageSquareMore className="h-8 w-8" />
                        <p className="text-xs text-center px-6 leading-relaxed">
                            Generate a review first to start interacting with the AI agent.
                        </p>
                    </div>
                </Visible>

                <Visible visible={reviewStatus === 'running' && messages.length <= 1 && !waitingForFirstToken}>
                    <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Generating review…</span>
                    </div>
                </Visible>

                <Visible visible={reviewStatus === 'error'}>
                    <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{reviewMessage}</span>
                    </div>
                </Visible>

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
                        placeholder={reviewStatus === 'success' ? "Ask about the PR…" : reviewStatus === 'idle' ? "Generate a review to chat…" : "Wait for review to finish…"}
                        className="max-h-36 min-h-9 w-full resize-none overflow-y-auto bg-transparent py-2 pl-2.5 pr-9 text-xs leading-5 outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                        rows={1}
                        disabled={isChatLoading || reviewStatus !== 'success'}
                    />

                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleSend}
                        disabled={isChatLoading || !input.trim() || reviewStatus !== 'success'}
                        className="absolute bottom-0.5 right-0.5 h-8 w-8 text-muted-foreground"
                    >
                        <Visible visible={isChatLoading} fallback={(
                            <Send className="h-3.5 w-3.5" />
                        )}>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        </Visible>
                    </Button>
                </div>

                <div className="mt-1.5 text-center text-[9px] text-muted-foreground/60">
                    AI can make mistakes. Please verify important information.
                </div>
            </div>
        </div>
    );
}
