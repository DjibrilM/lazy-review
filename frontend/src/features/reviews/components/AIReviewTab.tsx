import {
    AlertCircle,
    AlertTriangle,
    Bot,
    Check,
    CheckCircle2,
    ChevronRight,
    FileCode2,
    Lightbulb,
    Loader2,
    RefreshCw,
    Sparkles,
} from 'lucide-react';

import { cn } from '@/lib/util/shared';
import Visible from "@/components/common/Visible";

interface ReviewIssue {
    severity: 'critical' | 'warning' | 'suggestion';
    title: string;
    description: string;
    file?: string;
    line?: number;
    convention?: string;
}

interface AIReviewTabProps {
    setActiveTab: (tab: any) => void;
    setSelectedFileForDiff?: (file: string | null) => void;
    issues: ReviewIssue[];
    reviewStatus: 'idle' | 'running' | 'success' | 'error';
    reviewMessage?: string;
    onInitializeReview: () => void;
}

const severityOrder: Record<ReviewIssue['severity'], number> = {
    critical: 0,
    warning: 1,
    suggestion: 2,
};

const severityConfig: Record<
    ReviewIssue['severity'],
    {
        label: string;
        icon: typeof AlertCircle;
        labelClass: string;
        iconClass: string;
        borderClass: string;
    }
> = {
    critical: {
        label: 'Critical',
        icon: AlertCircle,
        labelClass:
            'border-destructive/30 bg-destructive/10 text-destructive',
        iconClass: 'text-destructive',
        borderClass: 'border-l-destructive/70',
    },
    warning: {
        label: 'Warning',
        icon: AlertTriangle,
        labelClass:
            'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        iconClass: 'text-amber-600 dark:text-amber-400',
        borderClass: 'border-l-amber-500/70',
    },
    suggestion: {
        label: 'Suggestion',
        icon: Lightbulb,
        labelClass:
            'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
        iconClass: 'text-blue-600 dark:text-blue-400',
        borderClass: 'border-l-blue-500/70',
    },
};

export function AIReviewTab({
    setActiveTab,
    setSelectedFileForDiff,
    issues,
    reviewStatus,
    reviewMessage,
    onInitializeReview,
}: AIReviewTabProps) {
    const sortedIssues = [...issues].sort(
        (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
    );

    const counts = issues.reduce(
        (acc, issue) => {
            acc[issue.severity] += 1;
            return acc;
        },
        {
            critical: 0,
            warning: 0,
            suggestion: 0,
        },
    );

    const openInDiff = (issue: ReviewIssue) => {
        if (issue.file && setSelectedFileForDiff) {
            setSelectedFileForDiff(issue.file);
        }

        setActiveTab('files');
    };

    return (
        <div className="h-full w-full overflow-y-auto bg-background">
            <div className="mx-auto w-full max-w-[980px] px-5 py-5">
                {/* Header */}
                <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-muted-foreground" />
                            <h2 className="text-sm font-semibold text-foreground">
                                AI architectural review
                            </h2>
                        </div>

                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Checks this pull request against the project architecture and conventions.
                        </p>
                    </div>

                    <Visible visible={reviewStatus === 'success'}>
<button
                            type="button"
                            onClick={onInitializeReview}
                            className="inline-flex h-8 items-center gap-1.5 self-start rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60 sm:self-auto"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Re-run review
                        </button>
</Visible>
                </div>

                {/* Summary bar */}
                <Visible visible={reviewStatus === 'success' && issues.length > 0}>
                    (
                    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-muted/20 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                            <span>{counts.critical}</span>
                            <span className="text-muted-foreground">
                                critical
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            <span>{counts.warning}</span>
                            <span className="text-muted-foreground">
                                warning<Visible visible={counts.warning === 1} fallback={'s'}>
                                    ''
                                </Visible>
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <Lightbulb className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            <span>{counts.suggestion}</span>
                            <span className="text-muted-foreground">
                                suggestion<Visible visible={counts.suggestion === 1} fallback={'s'}>
                                    ''
                                </Visible>
                            </span>
                        </div>
                    </div>
</Visible>

                {/* Idle */}
                <Visible visible={reviewStatus === 'idle'}>
<div className="rounded-md border border-border bg-card">
                        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/40">
                                <Sparkles className="h-4 w-4 text-muted-foreground" />
                            </div>

                            <h3 className="text-sm font-semibold text-foreground">
                                No AI review yet
                            </h3>

                            <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                                Run a review to check this pull request against the project&apos;s
                                architectural manifest and conventions.
                            </p>

                            <button
                                type="button"
                                onClick={onInitializeReview}
                                className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-foreground px-3 text-xs font-medium text-background shadow-sm transition-opacity hover:opacity-90"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Start AI review
                            </button>
                        </div>
                    </div>
</Visible>

                {/* Running */}
                <Visible visible={reviewStatus === 'running'}>
<div className="rounded-md border border-border bg-card">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />

                            <div>
                                <p className="text-xs font-medium text-foreground">
                                    Reviewing pull request…
                                </p>
                                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                    Checking changed files against architecture and project conventions.
                                </p>
                            </div>
                        </div>
                    </div>
</Visible>

                {/* Error */}
                <Visible visible={reviewStatus === 'error'}>
<div className="rounded-md border border-destructive/30 bg-destructive/[0.04]">
                        <div className="flex items-start gap-3 px-4 py-3">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />

                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-foreground">
                                    AI review failed
                                </p>

                                <p className="mt-1 break-words text-[11px] leading-5 text-muted-foreground">
                                    {reviewMessage || 'Something went wrong while generating the review.'}
                                </p>

                                <button
                                    type="button"
                                    onClick={onInitializeReview}
                                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                                >
                                    <RefreshCw className="h-3 w-3" />
                                    Try again
                                </button>
                            </div>
                        </div>
                    </div>
</Visible>

                {/* Success / no issues */}
                <Visible visible={reviewStatus === 'success' && issues.length === 0}>
<div className="rounded-md border border-border bg-card">
                        <div className="flex items-start gap-3 px-4 py-3.5">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </div>

                            <div>
                                <p className="text-xs font-semibold text-foreground">
                                    No architectural issues found
                                </p>

                                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                                    This pull request is consistent with the project conventions available to the reviewer.
                                </p>
                            </div>
                        </div>
                    </div>
</Visible>

                {/* Issues */}
                <Visible visible={reviewStatus === 'success' && sortedIssues.length > 0}>
                    (
                    <div className="overflow-hidden rounded-md border border-border bg-card">
                        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                    Review findings
                                </span>

                                <span className="inline-flex min-w-5 items-center justify-center rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {issues.length}
                                </span>
                            </div>
                        </div>

                        <div className="divide-y divide-border">
                            {sortedIssues.map((issue, index) => {
                                const config = severityConfig[issue.severity];
                                const Icon = config.icon;

                                return (
                                    <article
                                        key={`${issue.file ?? 'issue'}-${issue.line ?? index}-${index}`}
                                        className={cn(
                                            'border-l-2 bg-background px-4 py-3.5 transition-colors hover:bg-muted/[0.18]',
                                            config.borderClass,
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <Icon
                                                className={cn(
                                                    'mt-0.5 h-4 w-4 shrink-0',
                                                    config.iconClass,
                                                )}
                                            />

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                                                            config.labelClass,
                                                        )}
                                                    >
                                                        {config.label}
                                                    </span>

                                                    <Visible visible={issue.file}>
<button
                                                            type="button"
                                                            onClick={() => openInDiff(issue)}
                                                            className="inline-flex min-w-0 items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                            title={`${issue.file}${issue.line ? `:${issue.line}` : ''}`}
                                                        >
                                                            <FileCode2 className="h-3 w-3 shrink-0" />
                                                            <span className="max-w-[420px] truncate">
                                                                {issue.file}
                                                                <Visible visible={issue.line} fallback={''}>
                                                                    `:${issue.line}`
                                                                </Visible>
                                                            </span>
                                                        </button>
</Visible>
                                                </div>

                                                <h3 className="mt-2 text-[13px] font-semibold leading-5 text-foreground">
                                                    {issue.title}
                                                </h3>

                                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                    {issue.description}
                                                </p>

                                                <Visible visible={issue.convention}>
<div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                                                        <div className="mb-1 flex items-center gap-1.5">
                                                            <Check className="h-3 w-3 text-muted-foreground" />
                                                            <span className="text-[10px] font-medium text-muted-foreground">
                                                                Convention
                                                            </span>
                                                        </div>

                                                        <code className="block break-words font-mono text-[10px] leading-4 text-foreground/80">
                                                            {issue.convention}
                                                        </code>
                                                    </div>
</Visible>

                                                <Visible visible={issue.file}>
<button
                                                        type="button"
                                                        onClick={() => openInDiff(issue)}
                                                        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                                                    >
                                                        View in diff
                                                        <ChevronRight className="h-3 w-3" />
                                                    </button>
</Visible>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
</Visible>
            </div>
        </div>
    );
}
