import { useMemo, useState } from 'react';
import {
    AlertCircle,
    Check,
    GitMerge,
    GitPullRequest,
    Loader2,
    MessageSquare,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { githubService } from '@/services/github.service';
import { cn } from '@/lib/util/shared';
import Visible from "@/components/common/Visible";

type PRFilter = 'open' | 'closed';

interface PRListProps {
    onSelectPR: (pr: any) => void;
    owner: string;
    repoName: string;
}

function formatDate(date?: string) {
    if (!date) return '';

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(new Date(date));
}

function getPullRequestIcon(pr: any) {
    if (pr?.merged_at || pr?.merged) {
        return {
            icon: GitMerge,
            className: 'text-purple-600 dark:text-purple-400',
        };
    }

    if (pr?.state === 'closed') {
        return {
            icon: GitPullRequest,
            className: 'text-destructive',
        };
    }

    return {
        icon: GitPullRequest,
        className: 'text-emerald-600 dark:text-emerald-400',
    };
}

export function PRList({
    onSelectPR,
    owner,
    repoName,
}: PRListProps) {
    const [filter, setFilter] = useState<PRFilter>('open');

    const {
        data: prs = [],
        isLoading,
        isError,
    } = useQuery({
        queryKey: ['pull-requests', owner, repoName],
        queryFn: () => githubService.getPullRequests(owner, repoName),
        enabled: !!owner && !!repoName,
    });

    const openCount = useMemo(
        () => prs.filter((pr: any) => pr.state === 'open').length,
        [prs],
    );

    const closedCount = useMemo(
        () => prs.filter((pr: any) => pr.state === 'closed').length,
        [prs],
    );

    const visiblePullRequests = useMemo(
        () => prs.filter((pr: any) => pr.state === filter),
        [prs, filter],
    );

    if (isLoading) {
        return (
            <div className="flex min-h-[220px] items-center justify-center rounded-md border border-border bg-card">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Fetching pull requests…
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex min-h-[180px] items-center justify-center rounded-md border border-destructive/25 bg-destructive/[0.04] px-4">
                <div className="flex items-center gap-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Failed to fetch pull requests.
                </div>
            </div>
        );
    }

    return (
        <section className="overflow-hidden rounded-md border border-border bg-card">
            {/* GitHub-style state filter */}
            <div className="flex items-center gap-4 border-b border-border bg-muted/20 px-4 py-2.5">
                <button
                    type="button"
                    onClick={() => setFilter('open')}
                    className={cn(
                        'inline-flex items-center gap-1.5 text-xs transition-colors',
                        filter === 'open'
                            ? 'font-semibold text-foreground'
                            : 'font-medium text-muted-foreground hover:text-foreground',
                    )}
                >
                    <GitPullRequest className="h-3.5 w-3.5" />
                    {openCount} Open
                </button>

                <button
                    type="button"
                    onClick={() => setFilter('closed')}
                    className={cn(
                        'inline-flex items-center gap-1.5 text-xs transition-colors',
                        filter === 'closed'
                            ? 'font-semibold text-foreground'
                            : 'font-medium text-muted-foreground hover:text-foreground',
                    )}
                >
                    <Check className="h-3.5 w-3.5" />
                    {closedCount} Closed
                </button>
            </div>

            <Visible visible={visiblePullRequests.length > 0} fallback={(
                <div className="flex min-h-[180px] items-center justify-center px-6 py-10 text-center">
                    <div>
                        <GitPullRequest className="mx-auto h-5 w-5 text-muted-foreground" />

                        <p className="mt-2 text-xs font-medium text-foreground">
                            No {filter} pull requests
                        </p>

                        <p className="mt-1 text-[11px] text-muted-foreground">
                            This repository has no {filter} pull requests to display.
                        </p>
                    </div>
                </div>
            )}>

                <div className="divide-y divide-border">
                    {visiblePullRequests.map((pr: any) => {
                        const status = getPullRequestIcon(pr);
                        const StatusIcon = status.icon;

                        return (
                            <button
                                key={pr.id}
                                type="button"
                                onClick={() => onSelectPR(pr)}
                                className="group flex w-full items-start gap-3 bg-background px-4 py-3 text-left transition-colors hover:bg-muted/[0.22]"
                            >
                                <StatusIcon
                                    className={cn(
                                        'mt-0.5 h-4 w-4 shrink-0',
                                        status.className,
                                    )}
                                />

                                <div className="min-w-0 flex-1">
                                    <div className="text-[13px] font-semibold leading-5 text-foreground transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                        {pr.title}
                                    </div>

                                    <div className="mt-1 flex flex-wrap items-center gap-x-1 text-[11px] leading-4 text-muted-foreground">
                                        <span>#{pr.number}</span>

                                        <span>
                                            <Visible visible={pr.state === 'open'} fallback={pr?.merged_at || pr?.merged
                                                ? 'merged'
                                                : 'closed'}>
                                                'opened'
                                            </Visible>
                                        </span>

                                        <Visible visible={pr.created_at}>
                                            <span>{formatDate(pr.created_at)}</span>
                                        </Visible>

                                        <Visible visible={pr.user?.login}>
                                            <>
                                                <span>by</span>
                                                <span className="font-medium text-foreground/80">
                                                    {pr.user.login}
                                                </span>
                                            </>
                                        </Visible>
                                    </div>
                                </div>

                                <Visible visible={pr.comments > 0}>
                                    (
                                    <div className="flex shrink-0 items-center gap-1 pt-0.5 text-[11px] text-muted-foreground">
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        <span>{pr.comments}</span>
                                    </div>
                                </Visible>
                            </button>
                        );
                    })}
                </div>
            </Visible>
        </section>
    );
}
