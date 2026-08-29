import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FileText,
  GitPullRequest,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';


import { projectService } from '@/services/project.service';
import { useRepository } from '../hooks/useRepository';

import { PRList } from '../components/PRList';
import { CodebaseSummary } from '../components/CodebaseSummary';
import { AIReviewSessionDialog } from '../components/AIReviewSessionDialog';
import { RepositoryHeader } from '../components/RepositoryHeader';
import { IndexingProgress, IndexingError, RepositoryRefetchError } from '../components/IndexingStatus';
import { RepositoryLoadError } from '../components/RepositoryLoadError';
import { getErrorStatus, MAX_REPOSITORY_FETCH_RETRIES, hasCompletedIndex } from '../utils/repo-utils';
import Visible from "@/components/common/Visible";

interface PullRequestLike {
  number: number;
  hasExistingReview?: boolean;
  [key: string]: unknown;
}



export function RepositoryDetails() {
  const { id } = useParams<{
    id: string;
  }>();

  const navigate = useNavigate();


  const [prToOpen, setPrToOpen] =
    useState<PullRequestLike | null>(
      null,
    );

  const {
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
    setIndexingError
  } = useRepository(id);

  // ─────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────

  const handleOpenPRDialog = async (
    pr: PullRequestLike,
  ) => {
    if (!repo) return;

    // Check if a review already exists for this PR
    try {
      const reviewState = await projectService.getReview(
        repo.id,
        pr.number,
      );
      pr.hasExistingReview =
        reviewState?.status === 'success' ||
        reviewState?.status === 'running';
    } catch {
      pr.hasExistingReview = false;
    }

    setPrToOpen(pr);
  };

  const handleSelectPR = async (
    pr: PullRequestLike,
    startFresh?: boolean,
  ) => {
    if (!repo) {
      return;
    }

    // Dynamic guard: reviews are only accessible after at least one completed
    // index. This mirrors the backend gate so navigation is blocked up front.
    if (!hasCompletedIndex(repo)) {
      toast.error(
        repo?.current_task === 'indexing'
          ? 'Indexing is still in progress. Please wait for it to finish before starting a review.'
          : 'This repository must be indexed at least once before it can be reviewed.',
      );
      return;
    }

    // If starting fresh, delete the old review first
    if (startFresh && pr.hasExistingReview) {
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

    setPrToOpen(null);
    navigate(
      `/repo/${repo.id}/review/${pr.number}`,
    );
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
            <Visible visible={failureCount > 0} fallback={'Loading repository…'}>
              `Retrying repository… (${Math.min(
                failureCount,
                MAX_REPOSITORY_FETCH_RETRIES,
              )}/${MAX_REPOSITORY_FETCH_RETRIES})`
            </Visible>
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
          <RepositoryHeader
            repo={repo}
            owner={owner}
            isFetching={isFetching}
            isLoading={isLoading}
            isCurrentlyIndexing={isCurrentlyIndexing}
            isDeleting={isDeleting}
            onReindex={handleReindex}
            onDelete={handleDeleteProject}
          />

          {/* Background repository refresh failure */}
          <RepositoryRefetchError
            isRefetchError={isRefetchError}
            repositoryError={repositoryError}
            isFetching={isFetching}
            onRetry={() => {
              void refetch();
            }}
          />

          {/* Indexing progress */}
          <IndexingProgress
            isCurrentlyIndexing={isCurrentlyIndexing}
            indexingDuration={indexingDuration}
            indexingLog={indexingLog}
            indexingThinking={indexingThinking}
            onCancel={handleCancelIndexing}
          />

          {/* Indexing failure */}
          <IndexingError
            error={indexingError}
            onDismiss={() => setIndexingError(null)}
          />

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
                    handleOpenPRDialog
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
        isCurrentlyIndexing={isCurrentlyIndexing}
        isIndexed={hasCompletedIndex(repo)}
        indexingThinking={indexingThinking}
        indexingDuration={indexingDuration}
        indexingError={indexingError}
        onStartIndexing={handleReindex}
      />
    </div>
  );
}
