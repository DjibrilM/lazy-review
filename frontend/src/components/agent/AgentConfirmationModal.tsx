import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '../ui/button';
import {
  agentConfirmationListeners,
  agentFeedbackListeners,
  agentCredentialsListeners,
  type AgentConfirmationRequest,
  type AgentFeedbackRequest,
  type AgentCredentialsRequest,
} from '../providers/SocketProvider';
import { useSocketCommunication } from '@/lib/hooks/useSocketCommunication';
import { Check, X, ShieldQuestion, MessageSquareShare, KeyRound, Eye, EyeOff } from 'lucide-react';

interface ModalRequest {
  id: string;
  type: 'confirmation' | 'feedback' | 'credentials';
  message: string;
  keys?: string[];
}

export const AgentConfirmationModal = () => {
  const {
    sendAgentConfirmationResponse,
    sendAgentFeedbackResponse,
    sendAgentCredentialsResponse,
  } = useSocketCommunication();

  const [currentRequest, setCurrentRequest] = useState<ModalRequest | null>(null);
  const [requestQueue, setRequestQueue] = useState<ModalRequest[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [credentialInputs, setCredentialInputs] = useState<Record<string, string>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const listenerId = Math.random().toString(36).substring(2);

    // Subscribe to confirmation requests
    agentConfirmationListeners.set(listenerId, (req: AgentConfirmationRequest) => {
      const modalReq: ModalRequest = {
        id: req.id,
        type: 'confirmation',
        message: req.question,
      };
      setRequestQueue((prev) => {
        const next = [...prev, modalReq];
        setCurrentRequest((curr) => curr || modalReq);
        return next;
      });
    });

    // Subscribe to feedback requests
    agentFeedbackListeners.set(listenerId, (req: AgentFeedbackRequest) => {
      const modalReq: ModalRequest = {
        id: req.id,
        type: 'feedback',
        message: req.prompt,
      };
      setRequestQueue((prev) => {
        const next = [...prev, modalReq];
        setCurrentRequest((curr) => curr || modalReq);
        return next;
      });
    });

    // Subscribe to credentials requests
    agentCredentialsListeners.set(listenerId, (req: AgentCredentialsRequest) => {
      const modalReq: ModalRequest = {
        id: req.id,
        type: 'credentials',
        message: req.description,
        keys: req.keys,
      };
      setRequestQueue((prev) => {
        const next = [...prev, modalReq];
        setCurrentRequest((curr) => {
          if (!curr) {
            const initialVals: Record<string, string> = {};
            req.keys.forEach((k) => {
              initialVals[k] = '';
            });
            setCredentialInputs(initialVals);
            return modalReq;
          }
          return curr;
        });
        return next;
      });
    });

    return () => {
      agentConfirmationListeners.delete(listenerId);
      agentFeedbackListeners.delete(listenerId);
      agentCredentialsListeners.delete(listenerId);
    };
  }, []);

  const handleResponse = (approved: boolean) => {
    if (!currentRequest) return;

    if (currentRequest.type === 'confirmation') {
      sendAgentConfirmationResponse(currentRequest.id, approved);
    } else if (currentRequest.type === 'feedback') {
      sendAgentFeedbackResponse(currentRequest.id, approved, approved ? feedbackText : undefined);
    } else if (currentRequest.type === 'credentials') {
      sendAgentCredentialsResponse(
        currentRequest.id,
        approved,
        approved ? credentialInputs : undefined,
      );
    }

    // Reset fields
    setFeedbackText('');
    setCredentialInputs({});
    setVisibleSecrets({});

    // Process next item in the queue
    setRequestQueue((prev) => {
      const nextQueue = prev.filter((r) => r.id !== currentRequest.id);
      if (nextQueue.length > 0) {
        const nextReq = nextQueue[0];
        if (nextReq.type === 'credentials' && nextReq.keys) {
          const initialVals: Record<string, string> = {};
          nextReq.keys.forEach((k) => {
            initialVals[k] = '';
          });
          setCredentialInputs(initialVals);
        }
        setCurrentRequest(nextReq);
      } else {
        setCurrentRequest(null);
      }
      return nextQueue;
    });
  };

  // Keyboard shortcut listener
  useEffect(() => {
    if (!currentRequest) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC always denies
      if (e.key === 'Escape') {
        handleResponse(false);
        return;
      }

      // Enter hotkey
      if (e.key === 'Enter') {
        if (currentRequest.type === 'confirmation') {
          handleResponse(true);
        } else {
          // For feedback or credentials type, submit on Cmd+Enter or Ctrl+Enter
          if (e.metaKey || e.ctrlKey) {
            handleResponse(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentRequest, feedbackText, credentialInputs]);

  if (!currentRequest) return null;

  const isFeedback = currentRequest.type === 'feedback';
  const isCredentials = currentRequest.type === 'credentials';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md transition-opacity duration-300 animate-in fade-in">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200">
        {/* Neon accent gradient background */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-white/5 via-transparent to-white/5 opacity-75" />

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20">
            {isCredentials ? (
              <KeyRound className="h-5 w-5 animate-pulse" />
            ) : isFeedback ? (
              <MessageSquareShare className="h-5 w-5 animate-pulse" />
            ) : (
              <ShieldQuestion className="h-5 w-5 animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-sm font-semibold tracking-wide text-zinc-100 uppercase">
                {isCredentials
                  ? 'Request for Credentials'
                  : isFeedback
                    ? 'Request for Feedback'
                    : 'Agent Action Authorization'}
              </h3>
              {requestQueue.length > 1 && (
                <span className="text-[10px] bg-white/10 border border-white/20 text-white/90 rounded-full px-1.5 py-0.5 font-mono animate-pulse">
                  +{requestQueue.length - 1} queue
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              {isCredentials
                ? 'Enter the requested credentials or environment variables securely.'
                : isFeedback
                  ? 'Review the proposed plan and provide feedback or click to confirm.'
                  : 'The AI Agent is requesting permission to execute an action.'}
            </p>
          </div>
        </div>

        {/* Markdown Content Area */}
        <div className="my-5 max-h-[35vh] overflow-y-auto rounded-lg border border-white/5 bg-zinc-900/40 p-4 font-sans text-sm text-zinc-300 shadow-inner">
          <div className="prose prose-invert max-w-none text-xs leading-relaxed break-words font-mono">
            <ReactMarkdown>{currentRequest.message}</ReactMarkdown>
          </div>
        </div>

        {/* Credentials Form (only for credentials request type) */}
        {isCredentials && currentRequest.keys && (
          <div className="my-5 space-y-4 max-h-[30vh] overflow-y-auto px-1">
            <label className="block font-mono text-[10px] text-zinc-400 tracking-wider uppercase">
              Required Environment Variables / Secrets:
            </label>
            {currentRequest.keys.map((key) => {
              const isVisible = visibleSecrets[key] || false;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-zinc-300 font-semibold">{key}</span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={credentialInputs[key] || ''}
                      onChange={(e) =>
                          setCredentialInputs((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                      }
                      placeholder={`Enter value for ${key}`}
                      className="w-full bg-zinc-900/60 border border-white/10 rounded-lg py-2 pl-3 pr-10 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/35 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                          setVisibleSecrets((prev) => ({
                            ...prev,
                            [key]: !isVisible,
                          }))
                      }
                      className="absolute right-3 text-zinc-500 hover:text-zinc-300 focus:outline-none cursor-pointer"
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Feedback Textarea (only for feedback request type) */}
        {isFeedback && (
          <div className="my-5 space-y-2">
            <label className="block font-mono text-[10px] text-zinc-400 tracking-wider uppercase">
              Your Comments / Guidance (Optional):
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g. Please change the import path to... or click confirm directly"
              className="w-full min-h-[90px] bg-zinc-900/60 border border-white/10 rounded-lg p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/35 transition-all font-mono resize-y"
            />
            <p className="text-[10px] font-mono text-zinc-500 text-right select-none">
              Tip: Press <kbd className="bg-white/5 px-1 rounded">⌘</kbd> +{' '}
              <kbd className="bg-white/5 px-1 rounded">Enter</kbd> to submit
            </p>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-white/5 pt-4">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleResponse(false)}
            className="flex items-center gap-1.5 font-mono px-4 h-9 bg-red-950/20 text-red-400 border border-red-500/20 hover:bg-red-950/40 transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
            Deny <span className="text-[10px] opacity-50 ml-1">(Esc)</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => handleResponse(true)}
            className="flex items-center gap-1.5 font-mono px-4 h-9 bg-white text-black hover:bg-white/90 transition-all cursor-pointer"
          >
            <Check className="h-4 w-4" />
            {isCredentials
              ? 'Submit Secrets'
              : isFeedback && feedbackText.trim() !== ''
                ? 'Submit Feedback'
                : 'Confirm Procedure'}
            <span className="text-[10px] opacity-70 ml-1">
              {isCredentials || isFeedback ? '(⌘+Enter)' : '(Enter)'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AgentConfirmationModal;
