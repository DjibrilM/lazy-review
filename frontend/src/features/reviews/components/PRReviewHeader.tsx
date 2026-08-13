import {
  Bot,
  GitCommitHorizontal,
  GitPullRequest,
} from 'lucide-react';

import { cn } from '@/lib/util/shared';

type TabType = 'pr_summary' | 'ai_review' | 'files';
type ReviewStatus = 'idle' | 'running' | 'success' | 'error';

interface PRReviewHeaderProps {
  repo: any;
  pr: any;
  commitsLength: number;
  reviewStatus: ReviewStatus;
  issueCount: number;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

const tabs: Array<{ id: TabType; label: string }> = [
  { id: 'pr_summary', label: 'Summary' },
  { id: 'ai_review', label: 'AI review' },
  { id: 'files', label: 'Files changed' },
];

function getPullRequestState(pr: any) {
  if (pr?.merged || pr?.merged_at) {
    return {
      label: 'Merged',
      className:
        'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400',
    };
  }

  if (pr?.state === 'closed') {
    return {
      label: 'Closed',
      className:
        'border-destructive/30 bg-destructive/10 text-destructive',
    };
  }

  return {
    label: 'Open',
    className:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  };
}

export function PRReviewHeader({
  repo,
  pr,
  commitsLength,
  reviewStatus,
  issueCount,
  activeTab,
  setActiveTab,
}: PRReviewHeaderProps) {
  const state = getPullRequestState(pr);
  const changedFiles = pr?.changed_files ?? 0;

  return (
    <header className="shrink-0 border-b border-border bg-background">
      <div className="px-5 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <GitPullRequest className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="min-w-0 truncate text-[15px] font-semibold text-foreground">
                {pr?.title || 'Pull request'}
              </h1>

              <span className="text-[13px] font-normal text-muted-foreground">
                #{pr?.number}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  state.className,
                )}
              >
                {state.label}
              </span>

              <span>
                <strong className="font-medium text-foreground">
                  {pr?.user?.login || 'unknown'}
                </strong>{' '}
                wants to merge
              </span>

              <code className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {pr?.head?.ref || 'head'}
              </code>

              <span>into</span>

              <code className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {pr?.base?.ref || 'main'}
              </code>

              <span className="text-muted-foreground/40">·</span>

              <span className="inline-flex items-center gap-1">
                <GitCommitHorizontal className="h-3 w-3" />
                {commitsLength} commit{commitsLength === 1 ? '' : 's'}
              </span>

              {repo?.name && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{repo.name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className="mt-4 flex items-center gap-5" aria-label="Pull request">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            let count: number | undefined;

            if (tab.id === 'ai_review' && reviewStatus === 'success') {
              count = issueCount;
            }

            if (tab.id === 'files' && changedFiles > 0) {
              count = changedFiles;
            }

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex h-9 items-center gap-1.5 border-b-2 px-0.5 text-xs transition-colors',
                  isActive
                    ? 'border-orange-500 font-semibold text-foreground'
                    : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.id === 'ai_review' && (
                  <Bot className="h-3.5 w-3.5" />
                )}

                <span>{tab.label}</span>

                {count !== undefined && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {count}
                  </span>
                )}

                {tab.id === 'ai_review' && reviewStatus === 'running' && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                    aria-label="AI review running"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}