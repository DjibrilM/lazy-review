import { MessageSquareMore, Bot, Code, GitPullRequest, Loader2, AlertCircle, Send, BrainCircuit, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
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
  handleConfirmAction: (actionType: 'request_changes' | 'approve') => void;
  changedFiles?: string[];
  onFileClick?: (fileName: string) => void;
}

function parseMessageContent(content: string) {
  const parts = [];
  const regex = /(?:<think>|<\|channel>thought)([\s\S]*?)(?:<\/think>|<channel\|>|$)/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.substring(lastIndex, match.index) });
    }
    // Only push if there's actual thought content
    if (match[1].trim()) {
      parts.push({ type: 'think', content: match[1].trim() });
    }
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.substring(lastIndex) });
  }
  
  return parts;
}

function AnimatedThought({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="my-2 rounded-md border border-indigo-500/20 bg-indigo-500/5 overflow-hidden transition-all duration-300">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center w-full px-3 py-2 text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
      >
        <BrainCircuit className="w-3.5 h-3.5 mr-2 animate-pulse" />
        <span>View AI Reasoning</span>
        {isOpen ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>
      
      <div 
        className={cn(
          "transition-all duration-500 ease-in-out",
          isOpen ? "max-h-[500px] opacity-100 overflow-y-auto" : "max-h-0 opacity-0 overflow-hidden"
        )}
      >
        <div className="p-3 pt-1 text-xs text-muted-foreground/80 italic whitespace-pre-wrap font-mono leading-relaxed border-t border-indigo-500/10">
          {content}
        </div>
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
  handleConfirmAction,
  changedFiles,
  onFileClick,
}: AIChatSidebarProps) {
  return (
    <div className="bg-background flex flex-col z-10 shadow-lg relative h-full w-full min-w-[300px]">
      <div className="px-4 py-2 border-b border-border bg-card shrink-0 flex items-center space-x-2">
        <MessageSquareMore className="w-4 h-4 text-white/90" />
        <span className="font-semibold text-[13px] text-foreground">Interactive Review Architect</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[90%] text-sm rounded-lg p-3',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : msg.role === 'system'
                    ? 'bg-muted border border-border text-muted-foreground font-mono text-xs'
                    : 'bg-card border border-border text-card-foreground'
              )}
            >
              {msg.role === 'assistant' && (
                <div className="flex items-center space-x-1.5 mb-2 pb-2 border-b border-border text-muted-foreground">
                  <Bot className="w-3.5 h-3.5" />
                  <span className="font-semibold text-xs">Local AI (QVAC)</span>
                </div>
              )}
              <div className="flex flex-col space-y-2">
                {parseMessageContent(msg.content).map((p, i) =>
                  p.type === 'think' ? (
                    <AnimatedThought key={i} content={p.content} />
                  ) : (
                    <div key={i} className="text-sm">
                      {msg.role === 'user' || msg.role === 'system' ? (
                        <div className="whitespace-pre-wrap leading-relaxed">{p.content}</div>
                      ) : (
                        <MarkdownRenderer 
                          content={p.content} 
                          changedFiles={changedFiles} 
                          onFileClick={onFileClick} 
                        />
                      )}
                    </div>
                  )
                )}
              </div>

              {msg.requiresConfirmation && msg.requiresConfirmation !== 'agent_confirmation' && (
                <div className="mt-3 p-3 bg-background border border-border rounded-md shadow-inner">
                  <div className="text-xs text-muted-foreground font-mono mb-2 flex items-center">
                    <Code className="w-3.5 h-3.5 mr-1" />
                    GitHub API: {msg.requiresConfirmation === 'request_changes' ? 'REQUEST_CHANGES' : 'APPROVE'}
                  </div>
                  <Button
                    onClick={() => handleConfirmAction(msg.requiresConfirmation as 'request_changes' | 'approve')}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <GitPullRequest className="w-4 h-4 mr-2" />
                    Confirm & Call GitHub API
                  </Button>
                </div>
              )}

              {msg.requiresConfirmation === 'agent_confirmation' && msg.agentConfirmationData && (
                <div className="mt-3 p-3 bg-background border border-border rounded-md shadow-inner">
                  <div className="text-xs text-muted-foreground font-mono mb-2 flex items-center">
                    <Code className="w-3.5 h-3.5 mr-1" />
                    Agent Confirmation Required
                  </div>
                  <div className="text-sm mb-3">
                    <MarkdownRenderer content={msg.agentConfirmationData.question} />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        const { activeSocket } = await import('@/components/providers/SocketProvider');
                        activeSocket?.emit('agent-confirmation-response', { id: msg.agentConfirmationData!.id, approved: true });
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, requiresConfirmation: undefined } : m));
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        const { activeSocket } = await import('@/components/providers/SocketProvider');
                        activeSocket?.emit('agent-confirmation-response', { id: msg.agentConfirmationData!.id, approved: false });
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, requiresConfirmation: undefined } : m));
                      }}
                      className="flex-1"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isChatLoading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Thinking...</span>
            </div>
          </div>
        )}

        {reviewStatus === 'running' && messages.length <= 1 && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-2 text-muted-foreground text-xs font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating AI review...
            </div>
          </div>
        )}

        {reviewStatus === 'error' && (
          <div className="flex justify-start">
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2 text-destructive text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{reviewMessage}</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="p-3 border-t border-border bg-card shrink-0">
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight + 2, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !isChatLoading) handleSend();
                e.currentTarget.style.height = 'auto';
              }
            }}
            placeholder="Ask about the architecture, request a fix..."
            className="w-full bg-background border border-border rounded-md py-3 pl-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none max-h-40 overflow-y-auto disabled:opacity-50"
            rows={1}
            disabled={isChatLoading}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSend}
            disabled={isChatLoading || !input.trim()}
            className="absolute right-1 text-muted-foreground hover:text-blue-400 h-8 w-8"
          >
            {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground mt-2 text-center">
          Context Envelope active · Answers grounded in indexed project facts
        </div>
      </div>
    </div>
  );
}
