import { useState, useRef } from 'react';
import { projectService } from '@/services/project.service';

import { useSocketEffect } from '@/lib/hooks/useSocketEffect';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  requiresConfirmation?: 'request_changes' | 'approve' | 'agent_confirmation';
  agentConfirmationData?: { id: string; question: string };
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
    onAgentConfirmation: (data: { id: string; question: string }) => {
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
        },
        (chunk) => {
          fullReply += chunk;
          const displayContent = fullReply.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '');
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: displayContent } : msg)),
          );
        },
      );

      const cleanReply = fullReply.replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/g, '');
      chatHistoryRef.current.push({ role: 'assistant', content: cleanReply });

      // Detect if the AI is ready to submit a review
      const lowerReply = cleanReply.toLowerCase();
      const wantsRequestChanges =
        lowerReply.includes('request changes') ||
        lowerReply.includes('request_changes') ||
        lowerReply.includes('shall i submit') ||
        lowerReply.includes('should i submit');

      if (wantsRequestChanges) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, requiresConfirmation: 'request_changes' } : msg,
          ),
        );
      }
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
