import { useEffect, useRef } from 'react';
import {
  socketConnectListeners,
  socketDisconnectListeners,
  activeSocket,
  projectCreationSuccessListeners,
  projectsCreationLogsListeners,
  modelProgressListeners,
} from '@/components/providers/SocketProvider';
import type {
  ProjectCreationLog,
  ProjectCreationSuccess,
} from '../interfaces/project-creation-log.interface';

export const useSocketEffect = ({
  onProjectCreationLog,
  onProjectCreationSuccess,
  onModelProgress,
  onConnect,
  onDisconnect,
}: {
  onProjectCreationLog?: (data: ProjectCreationLog) => void;
  onProjectCreationSuccess?: (data: ProjectCreationSuccess) => void;
  onModelProgress?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) => {
  const listenerId = useRef<string>(crypto.randomUUID());

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
      socketConnectListeners.delete(listenerId.current);
      socketDisconnectListeners.delete(listenerId.current);
    };
  }, [onProjectCreationLog, onProjectCreationSuccess, onModelProgress, onConnect, onDisconnect]);
};
