import { activeSocket } from '@/components/providers/SocketProvider';

export function sendAgentConfirmationResponse(id: string, answer: boolean) {
  if (activeSocket) {
    activeSocket.emit('agent-confirmation-response', { id, answer });
  }
}

export function sendAgentFeedbackResponse(id: string, approved: boolean, feedback?: string) {
  if (activeSocket) {
    activeSocket.emit('agent-feedback-response', { id, approved, feedback });
  }
}

export function sendAgentCredentialsResponse(
  id: string,
  approved: boolean,
  credentials?: Record<string, string>,
) {
  if (activeSocket) {
    activeSocket.emit('agent-credentials-response', { id, approved, credentials });
  }
}

export const useSocketCommunication = () => {
  return {
    sendAgentConfirmationResponse,
    sendAgentFeedbackResponse,
    sendAgentCredentialsResponse,
  };
};
