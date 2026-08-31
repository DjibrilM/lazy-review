import { io, type Socket } from 'socket.io-client';
import React, { useEffect, useRef } from 'react';
import type {
  ProjectCreationLog,
  ProjectCreationSuccess,
} from '../../lib/interfaces/project-creation-log.interface';

export interface AgentConfirmationRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  action: {
    type: string;
    title: string;
    description?: string;
  };
  tool: {
    name: string;
    arguments: Record<string, unknown>;
  };
  target?: {
    provider: 'github';
    owner: string;
    repo: string;
    pullNumber?: number;
  };
  request?: {
    method: string;
    endpoint?: string;
    payload: unknown;
  };
  conversation?: {
    messages: Array<{ role: string; content: string }>;
  };
}

export interface AgentFeedbackRequest {
  id: string;
  prompt: string;
}

export interface AgentCredentialsRequest {
  id: string;
  description: string;
  keys: string[];
}

const SERVER_URL = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:16500` : 'http://localhost:16500');

export const projectsCreationLogsListeners = new Map<string, (data: ProjectCreationLog) => void>();
export const projectCreationSuccessListeners = new Map<
  string,
  (data: ProjectCreationSuccess) => void
>();
export const socketConnectListeners = new Map<string, () => void>();
export const socketDisconnectListeners = new Map<string, () => void>();
export const agentConfirmationListeners = new Map<string, (data: AgentConfirmationRequest) => void>();
export const agentFeedbackListeners = new Map<string, (data: AgentFeedbackRequest) => void>();
export const agentCredentialsListeners = new Map<string, (data: AgentCredentialsRequest) => void>();
export const modelProgressListeners = new Map<string, (data: any) => void>();
export const indexingProgressListeners = new Map<string, (data: any) => void>();
export const reviewProgressListeners = new Map<string, (data: any) => void>();

export let activeSocket: Socket | null = null;

const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const socketConnection = useRef<Socket | null>(null);

  useEffect(() => {
    socketConnection.current = io(SERVER_URL);
    activeSocket = socketConnection.current;

    socketConnection.current.on('connect', () => {
      console.log('Connected to socket server');
      socketConnectListeners.forEach((listener) => listener());
    });

    socketConnection.current.on('disconnect', () => {
      console.log('Disconnected from socket server');
      socketDisconnectListeners.forEach((listener) => listener());
    });

    socketConnection.current.on('project_creation_log', (data: ProjectCreationLog) => {
      projectsCreationLogsListeners.forEach((listener) => {
        listener(data);
      });
    });

    socketConnection.current.on('project_creation_success', (data: ProjectCreationSuccess) => {
      projectCreationSuccessListeners.forEach((listener) => {
        listener(data);
      });
    });

    socketConnection.current.on('agent-confirmation-request', (data: AgentConfirmationRequest) => {
      agentConfirmationListeners.forEach((listener) => listener(data));
    });

    socketConnection.current.on('agent_feedback', (data: AgentFeedbackRequest) => {
      agentFeedbackListeners.forEach((listener) => listener(data));
    });

    socketConnection.current.on('agent_credentials', (data: AgentCredentialsRequest) => {
      agentCredentialsListeners.forEach((listener) => listener(data));
    });

    socketConnection.current.on('model_progress', (data: any) => {
      modelProgressListeners.forEach((listener) => listener(data));
    });

    socketConnection.current.on('indexing_progress', (data: any) => {
      indexingProgressListeners.forEach((listener) => listener(data));
    });

    socketConnection.current.on('review_progress', (data: any) => {
      reviewProgressListeners.forEach((listener) => listener(data));
    });

    return () => {
      if (socketConnection.current) {
        socketConnection.current.disconnect();
      }
      activeSocket = null;
    };
  }, []);

  return <>{children}</>;
};

export default SocketProvider;
