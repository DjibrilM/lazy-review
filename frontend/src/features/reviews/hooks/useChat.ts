import { useState, useRef } from 'react';
import { projectService } from '@/services/project.service';

import { useSocketEffect } from '@/lib/hooks/useSocketEffect';
import { stripThinkingMarkers, stripToolCallMarkers } from '@/lib/util/chat-markers';
import type { AgentConfirmationRequest } from '@/components/providers/SocketProvider';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  requiresConfirmation?: 'request_changes' | 'approve' | 'agent_confirmation';
  agentConfirmationData?: AgentConfirmationRequest;
}

export function useChat(
  projectId: string | undefined,
  prDiff: string | null,
  owner?: string,
  repo?: string,
  prNumber?: number,
  prCreator?: string,
  additions?: number,
  deletions?: number,
  changedFiles?: number,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatHistoryRef = useRef<{ role: string; content: string }[]>([]);

  useSocketEffect({
    onAgentConfirmation: (data: AgentConfirmationRequest) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'system',
          content: '',
          requiresConfirmation: 'agent_confirmation',
          agentConfirmationData: data,
        },
      ]);
    },
  });

  const handleSend = async () => {
    if (!input.trim() || isChatLoading || !projectId) return;
    const userText = input.trim();
    setInput('');

    const userMsg: ChatMessage = { id: Date.now(), role: 'user', content: userText };
    setMessages((prev) => [...prev, userMsg]);

    // Save history before sending
    const historyToSend = [...chatHistoryRef.current];
    chatHistoryRef.current.push({ role: 'user', content: userText });

    const assistantId = Date.now() + 1;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
    };
    setMessages((prev) => [...prev, assistantMsg]);

    setIsChatLoading(true);

    try {
      // Get the active socket ID so confirmations can be bound to this client.
      const { activeSocket } = await import('@/components/providers/SocketProvider');

      let fullReply = '';
      await projectService.chatStream(
        projectId,
        {
          history: historyToSend,
          message: userText,
          prDiff: prDiff || undefined,
          owner,
          repo,
          pull_number: prNumber,
          creator: prCreator,
          additions,
          deletions,
          changed_files: changedFiles,
          socketId: activeSocket?.id,
        },
        (chunk) => {
          fullReply += chunk;
          // Strip tool call markers and raw JSON tool calls from the display.
          // Local models sometimes emit tool calls as JSON text in content deltas
          // (e.g. <|tool_call|>call:get_directory_tree{} or {"name":"...","arguments":{...}}).
          // stripToolCallMarkers is brace-aware so comment bodies containing code
          // snippets (nested braces) are removed completely rather than truncated.
          const displayContent = stripToolCallMarkers(fullReply);
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: displayContent } : msg)),
          );
        },
      );

      const cleanReply = stripToolCallMarkers(fullReply);

      // Strip thinking markers from history so raw reasoning isn't fed back
      // into the LLM on subsequent turns.
      chatHistoryRef.current.push({ role: 'assistant', content: stripThinkingMarkers(cleanReply) });
    } catch (err: unknown) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `⚠️ Error: ${(err as Error).message || 'Chat request failed'}` }
            : msg,
        ),
      );
    } finally {
      setIsChatLoading(false);
    }
  };

  const addSystemMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: 'system',
        content,
      },
    ]);
  };

  return {
    messages,
    setMessages,
    input,
    setInput,
    isChatLoading,
    handleSend,
    addSystemMessage,
  };
}
