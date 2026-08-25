import { GitFork, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ChatMessage } from '../hooks/useChat';
import Visible from "@/components/common/Visible";

export function AgentConfirmationRequest({
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
                    message.id === msg.id ? { ...message, requiresConfirmation: undefined } : message,
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
                <div className="whitespace-pre-wrap text-[11px] leading-4 text-foreground/80">
                    {msg.agentConfirmationData.action.title}
                    <Visible visible={msg.agentConfirmationData.action.description} fallback={''}>
                        `\n\n${msg.agentConfirmationData.action.description}`
                    </Visible>
                </div>
            </div>

            <div className="flex gap-2 border-t border-border/60 bg-muted/15 px-3 py-2">
                <Button
                    type="button"
                    size="sm"
                    onClick={() => respond(true)}
                    disabled={decision !== null}
                    className="h-7 flex-1 text-[11px]"
                >
                    <Visible visible={decision === 'approve'}>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    </Visible>
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
                    <Visible visible={decision === 'reject'}>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    </Visible>
                    Cancel
                </Button>
            </div>
        </div>
    );
}
