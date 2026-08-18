import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { projectService } from '@/services/project.service';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';
import { getErrorMessage, shouldRetryRepositoryFetch } from '../utils/repo-utils';

type IndexingStatus = 'running' | 'success' | 'error' | 'cancelled';

interface IndexingProgressEvent {
  projectId?: string | number;
  status: IndexingStatus;
  message?: string;
  isStreamChunk?: boolean;
  facts?: unknown;
}

export function useRepository(id: string | undefined) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [indexingError, setIndexingError] = useState<string | null>(null);
  const [indexingLog, setIndexingLog] = useState<string[]>([]);
  const [indexingThinking, setIndexingThinking] = useState('');
  const [indexingDuration, setIndexingDuration] = useState(0);

  const {
    data: repo,
    error: repositoryError,
    isLoading,
    isFetching,
    isError,
    isRefetchError,
    failureCount,
    refetch,
  } = useQuery({
    queryKey: ['local-project', id],
    queryFn: () => projectService.getProject(id as string),
    enabled: Boolean(id),
    retry: shouldRetryRepositoryFetch,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
  });

  useSocketEffect({
    onIndexingProgress: (data: IndexingProgressEvent) => {
      if (data.projectId !== undefined && id && String(data.projectId) !== String(id)) {
        return;
      }

      switch (data.status) {
        case 'running': {
          setIsReindexing(true);
          setIndexingError(null);

          if (data.message) {
            if (data.isStreamChunk) {
              setIndexingThinking((previous) => previous + data.message);
            } else {
              setIndexingLog((previous) => [...previous, data.message!]);
              setIndexingThinking('');
            }
          }
          break;
        }

        case 'success': {
          setIsReindexing(false);
          setIndexingError(null);
          setIndexingLog([]);
          setIndexingThinking('');
          void queryClient.invalidateQueries({ queryKey: ['local-project', id] });
          break;
        }

        case 'error': {
          setIsReindexing(false);
          setIndexingError(data.message || 'An unknown error occurred during indexing.');
          setIndexingLog([]);
          setIndexingThinking('');
          void queryClient.invalidateQueries({ queryKey: ['local-project', id] });
          break;
        }

        case 'cancelled': {
          setIsReindexing(false);
          setIndexingError(null);
          setIndexingLog([]);
          setIndexingThinking('');
          void queryClient.invalidateQueries({ queryKey: ['local-project', id] });
          break;
        }
      }
    },
  });

  const isCurrentlyIndexing = isReindexing || repo?.current_task === 'indexing';

  useEffect(() => {
    if (!isCurrentlyIndexing) {
      setIndexingDuration(0);
      return;
    }

    const interval = window.setInterval(() => {
      setIndexingDuration((previous) => previous + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isCurrentlyIndexing]);

  // Reset repository-specific transient state when navigating.
  useEffect(() => {
    setIndexingError(null);
    setIndexingLog([]);
    setIndexingThinking('');
    setIndexingDuration(0);
    setIsReindexing(false);
  }, [id]);

  const handleReindex = async () => {
    if (!repo) return;
    try {
      setIsReindexing(true);
      setIndexingError(null);
      setIndexingLog([]);
      setIndexingThinking('');
      setIndexingDuration(0);

      await projectService.reindexProject(repo.id);
      toast.success('Repository indexing started');
    } catch (error) {
      setIsReindexing(false);
      toast.error(getErrorMessage(error, 'Failed to start indexing'));
    }
  };

  const handleCancelIndexing = async () => {
    if (!repo) return;
    try {
      await projectService.cancelIndexing(repo.id);
      setIsReindexing(false);
      toast.success('Indexing cancellation requested');
      void queryClient.invalidateQueries({ queryKey: ['local-project', id] });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to cancel indexing'));
    }
  };

  const handleDeleteProject = async () => {
    if (!repo) return;
    try {
      setIsDeleting(true);
      await projectService.deleteProject(repo.id);
      toast.success('Project deleted');
      await queryClient.invalidateQueries({ queryKey: ['local-projects'] });
      navigate('/');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete project'));
      setIsDeleting(false);
    }
  };

  return {
    repo,
    repositoryError,
    isLoading,
    isFetching,
    isError,
    isRefetchError,
    failureCount,
    refetch,
    isDeleting,
    indexingError,
    indexingLog,
    indexingThinking,
    indexingDuration,
    isCurrentlyIndexing,
    handleReindex,
    handleCancelIndexing,
    handleDeleteProject,
    setIndexingError,
  };
}
