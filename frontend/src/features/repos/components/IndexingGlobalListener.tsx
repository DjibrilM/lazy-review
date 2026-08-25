import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';
import { globalIndexingAtom, defaultIndexingState, type IndexingProgressEvent } from '../store/indexingStore';

export function IndexingGlobalListener() {
  const [, setGlobalState] = useAtom(globalIndexingAtom);
  const queryClient = useQueryClient();

  useSocketEffect({
    onIndexingProgress: (data: IndexingProgressEvent) => {
      const id = data.projectId?.toString();
      if (!id) return;

      setGlobalState((prev) => {
        const prevState = prev[id] || { ...defaultIndexingState };
        
        switch (data.status) {
          case 'running':
            return {
              ...prev,
              [id]: {
                ...prevState,
                isReindexing: true,
                indexingError: null,
                indexingThinking: data.isStreamChunk && data.message ? prevState.indexingThinking + data.message : (data.isStreamChunk ? prevState.indexingThinking : ''),
                indexingLog: !data.isStreamChunk && data.message ? [...prevState.indexingLog, data.message] : prevState.indexingLog,
              },
            };
          case 'success':
          case 'error':
          case 'cancelled':
            void queryClient.invalidateQueries({ queryKey: ['local-project', id] });
            return {
              ...prev,
              [id]: {
                ...prevState,
                isReindexing: false,
                indexingError: data.status === 'error' ? (data.message || 'An unknown error occurred during indexing.') : null,
                indexingLog: [],
                indexingThinking: '',
              },
            };
          default:
            return prev;
        }
      });
    },
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setGlobalState((prev) => {
        let hasChanges = false;
        const nextState = { ...prev };
        for (const [id, state] of Object.entries(prev)) {
          if (state.isReindexing) {
            hasChanges = true;
            nextState[id] = { ...state, indexingDuration: state.indexingDuration + 1 };
          }
        }
        return hasChanges ? nextState : prev;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [setGlobalState]);

  return null;
}
