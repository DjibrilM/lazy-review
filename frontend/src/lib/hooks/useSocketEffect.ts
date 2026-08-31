import { useEffect, useRef } from 'react';
import {
  socketConnectListeners,
  socketDisconnectListeners,
  activeSocket,
  projectCreationSuccessListeners,
  projectsCreationLogsListeners,
  modelProgressListeners,
  indexingProgressListeners,
  reviewProgressListeners,
} from '@/components/providers/SocketProvider';
import type {
  ProjectCreationLog,
  ProjectCreationSuccess,
} from '../interfaces/project-creation-log.interface';

export const useSocketEffect = ({
  onProjectCreationLog,
  onProjectCreationSuccess,
  onModelProgress,
  onIndexingProgress,
  onReviewProgress,
  onAgentConfirmation,
  onConnect,
  onDisconnect,
}: {
  onProjectCreationLog?: (data: ProjectCreationLog) => void;
  onProjectCreationSuccess?: (data: ProjectCreationSuccess) => void;
  onModelProgress?: (data: any) => void;
  onIndexingProgress?: (data: any) => void;
  onReviewProgress?: (data: any) => void;
  onAgentConfirmation?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) => {
  const listenerId = useRef<string>(
    crypto?.randomUUID?.() || Math.random().toString(36).substring(2, 9),
  );

  useEffect(() => {
    if (onProjectCreationLog) {
      projectsCreationLogsListeners.set(listenerId.current, onProjectCreationLog);
    }

    if (onProjectCreationSuccess) {
      projectCreationSuccessListeners.set(listenerId.current, onProjectCreationSuccess);
    }

    if (onModelProgress) {
      modelProgressListeners.set(listenerId.current, onModelProgress);
    }

    if (onIndexingProgress) {
      indexingProgressListeners.set(listenerId.current, onIndexingProgress);
    }

    if (onReviewProgress) {
      reviewProgressListeners.set(listenerId.current, onReviewProgress);
    }

    if (onAgentConfirmation) {
      import('@/components/providers/SocketProvider').then((mod) => {
        mod.agentConfirmationListeners.set(listenerId.current, onAgentConfirmation);
      });
    }

    if (onConnect) {
      socketConnectListeners.set(listenerId.current, onConnect);
      if (activeSocket?.connected) {
        onConnect();
      }
    }

    if (onDisconnect) {
      socketDisconnectListeners.set(listenerId.current, onDisconnect);
    }

    return () => {
      projectsCreationLogsListeners.delete(listenerId.current);
      projectCreationSuccessListeners.delete(listenerId.current);
      modelProgressListeners.delete(listenerId.current);
      indexingProgressListeners.delete(listenerId.current);
      reviewProgressListeners.delete(listenerId.current);
      socketConnectListeners.delete(listenerId.current);
      socketDisconnectListeners.delete(listenerId.current);
    };
  }, [
    onProjectCreationLog,
    onProjectCreationSuccess,
    onModelProgress,
    onIndexingProgress,
    onReviewProgress,
    onConnect,
    onDisconnect,
  ]);
};
