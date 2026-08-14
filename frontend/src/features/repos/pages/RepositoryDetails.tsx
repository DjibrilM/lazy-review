import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  FileText,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

import { Button } from '@/components/ui/button';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { projectService } from '@/services/project.service';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';

import { PRList } from '../components/PRList';
import { CodebaseSummary } from '../components/CodebaseSummary';
import { AIReviewSessionDialog } from '../components/AIReviewSessionDialog';

const MAX_REPOSITORY_FETCH_RETRIES = 3;

type IndexingStatus =
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled';

interface IndexingProgressEvent {
  projectId?: string | number;
  status: IndexingStatus;
  message?: string;
  isStreamChunk?: boolean;
  facts?: unknown;
}

interface PullRequestLike {
  number: number;
  [key: string]: unknown;
}

/**
 * Extracts an HTTP status from Axios-style errors and other
 * common API error shapes.
 */
function getErrorStatus(
  error: unknown,
): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const value = error as {
    status?: number;
    response?: {
      status?: number;
    };
  };

  return (
    value.response?.status ??
    value.status
  );
}

/**
 * Converts unknown API errors into a useful user-facing message.
 */
function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const value = error as {
    message?: string;

    response?: {
      data?: {
        message?: string | string[];
      };
    };
  };

  const responseMessage =
    value.response?.data?.message;

  if (Array.isArray(responseMessage)) {
    return responseMessage.join(', ');
  }

  if (
    typeof responseMessage === 'string' &&
    responseMessage.trim()
  ) {
    return responseMessage;
  }

  if (
    typeof value.message === 'string' &&
    value.message.trim()
  ) {
    return value.message;
  }

  return fallback;
}

/**
 * Retry network failures and server-side/transient failures.
 *
 * Avoid retrying most 4xx responses because they usually require
 * user intervention and won't resolve by sending the same request.
 */
function shouldRetryRepositoryFetch(
  failureCount: number,
  error: unknown,
) {
  if (
    failureCount >=
    MAX_REPOSITORY_FETCH_RETRIES
  ) {
    return false;
  }

  const status = getErrorStatus(error);

  // Network errors generally don't include an HTTP status.
  if (!status) {
    return true;
  }

  if (status === 408 || status === 429) {
    return true;
  }

  return status >= 500;
}

function formatDuration(
  seconds: number,
) {
  const minutes = Math.floor(
    seconds / 60,
  );

  const remainingSeconds =
    seconds % 60;

  return `${minutes
    .toString()
    .padStart(2, '0')}:${remainingSeconds
    .toString()
    .padStart(2, '0')}`;
}

export function RepositoryDetails() {
  const { id } = useParams<{
    id: string;
  }>();

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [prToOpen, setPrToOpen] =
    useState<PullRequestLike | null>(
      null,
    );

  const [
    isDeleting,
    setIsDeleting,
  ] = useState(false);

  const [
    isReindexing,
    setIsReindexing,
  ] = useState(false);

  const [
    indexingError,
    setIndexingError,
  ] = useState<string | null>(
    null,
  );

  const [
    indexingLog,
    setIndexingLog,
  ] = useState<string[]>([]);

  const [
    indexingThinking,
    setIndexingThinking,
  ] = useState('');

  const [
    indexingDuration,
    setIndexingDuration,
  ] = useState(0);

  // ─────────────────────────────────────────────
  // REPOSITORY QUERY
  // ─────────────────────────────────────────────

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
    queryKey: [
      'local-project',
      id,
    ],

    queryFn: () =>
      projectService.getProject(
        id as string,
      ),

    enabled: Boolean(id),

    retry:
      shouldRetryRepositoryFetch,

    retryDelay: (
      attemptIndex,
    ) =>
      Math.min(
        1000 *
          2 ** attemptIndex,
        8000,
      ),
  });

  // ─────────────────────────────────────────────
  // INDEXING EVENTS
  // ─────────────────────────────────────────────

  useSocketEffect({
    onIndexingProgress: (
      data: IndexingProgressEvent,
    ) => {
      if (
        data.projectId !== undefined &&
        id &&
        String(data.projectId) !==
          String(id)
      ) {
        return;
      }

      switch (data.status) {
        case 'running': {
          setIsReindexing(true);
          setIndexingError(null);

          if (data.message) {
            if (
              data.isStreamChunk
            ) {
              setIndexingThinking(
                (previous) =>
                  previous +
                  data.message,
              );
            } else {
              setIndexingLog(
                (previous) => [
                  ...previous,
                  data.message!,
                ],
              );

              setIndexingThinking(
                '',
              );
            }
          }

          break;
        }

        case 'success': {
          setIsReindexing(false);
          setIndexingError(null);
          setIndexingLog([]);
          setIndexingThinking(
            '',
          );

          void queryClient.invalidateQueries(
            {
              queryKey: [
                'local-project',
                id,
              ],
            },
          );

          break;
        }

        case 'error': {
          setIsReindexing(false);

          setIndexingError(
            data.message ||
              'An unknown error occurred during indexing.',
          );

          setIndexingLog([]);
          setIndexingThinking(
            '',
          );

          void queryClient.invalidateQueries(
            {
              queryKey: [
                'local-project',
                id,
              ],
            },
          );

          break;
        }

        case 'cancelled': {
          setIsReindexing(false);
          setIndexingError(null);
          setIndexingLog([]);
          setIndexingThinking(
            '',
          );

          void queryClient.invalidateQueries(
            {
              queryKey: [
                'local-project',
                id,
              ],
            },
          );

          break;
        }
      }
    },
  });

  const isCurrentlyIndexing =
    isReindexing ||
    repo?.current_task ===
      'indexing';

  // ─────────────────────────────────────────────
  // INDEXING TIMER
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!isCurrentlyIndexing) {
      setIndexingDuration(0);
      return;
    }

    const interval =
      window.setInterval(() => {
        setIndexingDuration(
          (previous) =>
            previous + 1,
        );
      }, 1000);

    return () =>
      window.clearInterval(
        interval,
      );
  }, [isCurrentlyIndexing]);

  // Reset repository-specific transient state when navigating.
  useEffect(() => {
    setPrToOpen(null);
    setIndexingError(null);
    setIndexingLog([]);
    setIndexingThinking('');
    setIndexingDuration(0);
    setIsReindexing(false);
  }, [id]);

  // ─────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────

  const handleSelectPR = async (
    pr: PullRequestLike,
    startFresh?: boolean,
  ) => {
    if (!repo) {
      return;
    }

    if (startFresh) {
      try {
        await projectService.deleteReview(
          repo.id,
          pr.number,
        );
      } catch {
        toast.error(
          'Failed to reset review state',
        );

        return;
      }
    }

    navigate(
      `/repo/${repo.id}/review/${pr.number}`,
    );
  };

  const handleReindex =
    async () => {
      if (!repo) {
        return;
      }

      try {
        setIsReindexing(true);
        setIndexingError(null);
        setIndexingLog([]);
        setIndexingThinking(
          '',
        );
        setIndexingDuration(0);

        await projectService.reindexProject(
          repo.id,
        );

        toast.success(
          'Repository indexing started',
        );
      } catch (error) {
        setIsReindexing(false);

        toast.error(
          getErrorMessage(
            error,
            'Failed to start indexing',
          ),
        );
      }
    };

  const handleCancelIndexing =
    async () => {
      if (!repo) {
        return;
      }

      try {
        await projectService.cancelIndexing(
          repo.id,
        );

        setIsReindexing(false);

        toast.success(
          'Indexing cancellation requested',
        );

        void queryClient.invalidateQueries(
          {
            queryKey: [
              'local-project',
              id,
            ],
          },
        );
      } catch (error) {
        toast.error(
          getErrorMessage(
            error,
            'Failed to cancel indexing',
          ),
        );
      }
    };

  const handleDeleteProject =
    async () => {
      if (!repo) {
        return;
      }

      try {
        setIsDeleting(true);

        await projectService.deleteProject(
          repo.id,
        );

        toast.success(
          'Project deleted',
        );

        await queryClient.invalidateQueries(
          {
            queryKey: [
              'local-projects',
            ],
          },
        );

        navigate('/');
      } catch (error) {
        toast.error(
          getErrorMessage(
            error,
            'Failed to delete project',
          ),
        );

        setIsDeleting(false);
      }
    };

  // ─────────────────────────────────────────────
  // INITIAL LOADING
  // ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full  my-22 items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />

          <span>
            {failureCount > 0
              ? `Retrying repository… (${Math.min(
                  failureCount,
                  MAX_REPOSITORY_FETCH_RETRIES,
                )}/${MAX_REPOSITORY_FETCH_RETRIES})`
              : 'Loading repository…'}
          </span>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // NOT FOUND
  // ─────────────────────────────────────────────

  if (
    isError &&
    !repo &&
    getErrorStatus(
      repositoryError,
    ) === 404
  ) {
    return (
      <div className="flex h-full items-center justify-center bg-background my-22">
        <div className="rounded-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Repository not found.
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // FAILED INITIAL LOAD
  // ─────────────────────────────────────────────

  if (isError && !repo) {
    return (

      <div className="my-22">
      <RepositoryLoadError
        error={repositoryError}
        failureCount={
          failureCount
        }
        isRetrying={
          isFetching
        }
        onRetry={() => {
          void refetch();
        }}
      />
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="rounded-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Repository not found.
        </div>
      </div>
    );
  }

  const owner =
    repo.repository_url
      ?.split('/')[3] ||
    'unknown';

  // ─────────────────────────────────────────────
  // PAGE
  // ─────────────────────────────────────────────

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-y-auto bg-background">
      <div className="bg-background">
        <div className="mx-auto w-full max-w-6xl px-5 pt-4 lg:px-6">
          {/* Repository heading */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />

                <a
                  href={
                    repo.repository_url
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[15px] font-normal text-blue-600 hover:underline dark:text-blue-400"
                >
                  {owner}
                </a>

                <span className="text-[15px] text-muted-foreground">
                  /
                </span>

                <a
                  href={
                    repo.repository_url
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[15px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  {repo.name}
                </a>

                <span className="ml-1 inline-flex shrink-0 items-center rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Local
                </span>
              </div>

              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Local repository
                context, pull
                requests, and indexed
                architecture.
              </p>
            </div>

            {/* Repository actions */}
            <div className="flex shrink-0 items-center gap-2">
              {isFetching &&
                !isLoading && (
                  <div className="mr-1 hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
                    <Loader2 className="h-3 w-3 animate-spin" />

                    <span>
                      Refreshing
                    </span>
                  </div>
                )}

              <Button
                variant="outline"
                size="sm"
                onClick={
                  handleReindex
                }
                disabled={
                  isCurrentlyIndexing
                }
                className="h-8 gap-1.5 px-3 text-xs"
              >
                {isCurrentlyIndexing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}

                {isCurrentlyIndexing
                  ? 'Indexing…'
                  : 'Re-index'}
              </Button>

              <Dialog>
                <DialogTrigger
                  asChild
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      isDeleting
                    }
                    className="h-8 gap-1.5 border-destructive/30 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}

                    Delete
                  </Button>
                </DialogTrigger>

                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-sm">
                      Delete
                      repository
                    </DialogTitle>

                    <DialogDescription className="text-xs leading-5">
                      This removes the
                      local project
                      record, indexed
                      facts, AI
                      analysis, and
                      saved review
                      state. This action
                      cannot be undone.
                    </DialogDescription>
                  </DialogHeader>

                  <DialogFooter>
                    <DialogClose
                      asChild
                    >
                      <Button
                        variant="outline"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </DialogClose>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={
                        handleDeleteProject
                      }
                      disabled={
                        isDeleting
                      }
                    >
                      {isDeleting && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}

                      Delete repository
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Background repository refresh failure */}
          {isRefetchError && (
            <div className="mt-4 flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-foreground">
                  Could not refresh
                  repository details
                </p>

                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {getErrorMessage(
                    repositoryError,
                    'The existing repository data is still being shown.',
                  )}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  isFetching
                }
                onClick={() => {
                  void refetch();
                }}
                className="h-7 shrink-0 gap-1.5 px-2 text-[10px]"
              >
                {isFetching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}

                Retry
              </Button>
            </div>
          )}

          {/* Indexing progress */}
          {isCurrentlyIndexing && (
            <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />

                  <span className="truncate text-xs font-medium text-foreground">
                    Indexing
                    repository
                  </span>

                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatDuration(
                      indexingDuration,
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={
                    handleCancelIndexing
                  }
                  className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto bg-background px-3 py-2.5 font-mono">
                {indexingLog.length >
                0 ? (
                  <div className="space-y-1">
                    {indexingLog.map(
                      (
                        message,
                        index,
                      ) => (
                        <p
                          key={`${message}-${index}`}
                          className={
                            index ===
                            indexingLog.length -
                              1
                              ? 'text-[10px] leading-4 text-foreground'
                              : 'text-[10px] leading-4 text-muted-foreground'
                          }
                        >
                          {message}
                        </p>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Waiting for
                    progress…
                  </p>
                )}

                {indexingThinking && (
                  <div className="mt-2 border-l-2 border-border pl-2">
                    <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      Analyzing
                    </p>

                    <div className="whitespace-pre-wrap text-[10px] leading-4 text-muted-foreground">
                      {
                        indexingThinking
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Indexing failure */}
          {indexingError && (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-destructive/25 bg-destructive/[0.04] px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">
                  Indexing failed
                </p>

                <p className="mt-0.5 break-words font-mono text-[10px] leading-4 text-muted-foreground">
                  {
                    indexingError
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setIndexingError(
                    null,
                  )
                }
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <Tabs
            defaultValue="prs"
            className="mt-4 w-full"
          >
            <TabsList
              variant="line"
              className="h-9 justify-start gap-5 border-0 bg-transparent p-0"
            >
              <TabsTrigger
                value="prs"
                className="h-9 gap-1.5 rounded-none border-b-2 border-transparent px-0.5 text-xs font-medium text-muted-foreground data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <GitPullRequest className="h-3.5 w-3.5" />
                Pull requests
              </TabsTrigger>

              <TabsTrigger
                value="summary"
                className="h-9 gap-1.5 rounded-none border-b-2 border-transparent px-0.5 text-xs font-medium text-muted-foreground data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <FileText className="h-3.5 w-3.5" />
                Codebase facts
              </TabsTrigger>
            </TabsList>

            <div className="py-5">
              <TabsContent
                value="prs"
                className="mt-0"
              >
                <PRList
                  onSelectPR={
                    setPrToOpen
                  }
                  owner={owner}
                  repoName={
                    repo.name
                  }
                />
              </TabsContent>

              <TabsContent
                value="summary"
                className="mt-0"
              >
                <CodebaseSummary
                  initialFacts={
                    repo.analysis
                  }
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      <AIReviewSessionDialog
        prToOpen={prToOpen}
        onClose={() =>
          setPrToOpen(null)
        }
        onSelectPR={
          handleSelectPR
        }
      />
    </div>
  );
}

function RepositoryLoadError({
  error,
  failureCount,
  isRetrying,
  onRetry,
}: {
  error: unknown;
  failureCount: number;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const message =
    getErrorMessage(
      error,
      'Unable to load repository details.',
    );

  return (
    <div className="flex h-full items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm overflow-hidden rounded-md border border-border bg-card">
        <div className="flex items-start gap-3 px-4 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">
              Failed to load
              repository
            </p>

            <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">
              {message}
            </p>

            {failureCount >
              0 && (
              <p className="mt-1.5 text-[10px] text-muted-foreground/70">
                Retried{' '}
                {Math.min(
                  failureCount,
                  MAX_REPOSITORY_FETCH_RETRIES,
                )}{' '}
                {failureCount ===
                1
                  ? 'time'
                  : 'times'}
                .
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                isRetrying
              }
              onClick={
                onRetry
              }
              className="mt-3 h-7 gap-1.5 px-2.5 text-[11px]"
            >
              {isRetrying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}

              {isRetrying
                ? 'Retrying…'
                : 'Try again'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}