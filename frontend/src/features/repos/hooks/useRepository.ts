import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAtom } from 'jotai';

import { projectService } from '@/services/project.service';
import { getErrorMessage, shouldRetryRepositoryFetch } from '../utils/repo-utils';
import { globalIndexingAtom, defaultIndexingState } from '../store/indexingStore';

export function useRepository(id: string | undefined) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isDeleting, setIsDeleting] = useState(false);
  const [globalState, setGlobalState] = useAtom(globalIndexingAtom);

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

  const currentState = id && globalState[id] ? globalState[id] : defaultIndexingState;

  const { isReindexing, indexingError, indexingLog, indexingThinking, indexingDuration } =
    currentState;

  const isCurrentlyIndexing = isReindexing || repo?.current_task === 'indexing';

  const setIndexingError = (error: string | null) => {
    if (!id) return;
    setGlobalState((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || defaultIndexingState),
        indexingError: error,
      },
    }));
  };

  const handleReindex = async () => {
    if (!repo) return;
    try {
      setGlobalState((prev) => ({
        ...prev,
        [repo.id]: {
          ...defaultIndexingState,
          isReindexing: true,
        },
      }));

      await projectService.reindexProject(repo.id);
      toast.success('Repository indexing started');
    } catch (error) {
      setGlobalState((prev) => ({
        ...prev,
        [repo.id]: {
          ...(prev[repo.id] || defaultIndexingState),
          isReindexing: false,
        },
      }));
      toast.error(getErrorMessage(error, 'Failed to start indexing'));
    }
  };

  const handleCancelIndexing = async () => {
    if (!repo) return;
    try {
      await projectService.cancelIndexing(repo.id);
      setGlobalState((prev) => ({
        ...prev,
        [repo.id]: {
          ...(prev[repo.id] || defaultIndexingState),
          isReindexing: false,
        },
      }));
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
