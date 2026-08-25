import {
    AlertCircle,
    CheckCircle2,
    GitCommitHorizontal,
    GitPullRequest,
    Loader2,
    UserRound,
} from 'lucide-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import Visible from "@/components/common/Visible";

interface PRSummaryTabProps {
    pr: any;
    review: any;
    reviewStatus: 'idle' | 'running' | 'success' | 'error';
    reviewMessage: string;
}

function formatVerdict(verdict?: string) {
    if (!verdict) return null;

    return verdict
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getVerdictClasses(verdict?: string) {
    const normalized = verdict?.toLowerCase();

    if (normalized?.includes('approve') || normalized?.includes('clean')) {
        return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
    }

    if (normalized?.includes('change') || normalized?.includes('critical')) {
        return 'border-destructive/25 bg-destructive/10 text-destructive';
    }

    return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400';
}

export function PRSummaryTab({
    pr,
    review,
    reviewStatus,
    reviewMessage,
}: PRSummaryTabProps) {
    const markdownContent =
        review?.summary ||
        pr?.body ||
        `No description provided.`;

    const verdict = formatVerdict(review?.overallVerdict);

    return (
        <div className="h-full w-full overflow-y-auto bg-background">
            <div className="mx-auto w-full max-w-[980px] px-5 py-5">
                {/* PR heading */}
                <div className="mb-4 border-b border-border pb-4">
                    <div className="flex items-start gap-2">
                        <GitPullRequest className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold leading-5 text-foreground">
                                {pr?.title || 'Pull Request'}
                            </h2>

                            <Visible visible={pr}>
<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                        <UserRound className="h-3 w-3" />
                                        <span className="font-medium text-foreground">
                                            {pr.user?.login || 'unknown'}
                                        </span>
                                    </span>

                                    <span className="text-muted-foreground/50">·</span>

                                    <span>
                                        wants to merge
                                    </span>

                                    <code className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                                        {pr.head?.ref || 'feature'}
                                    </code>

                                    <span>into</span>

                                    <code className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                                        {pr.base?.ref || 'main'}
                                    </code>

                                    <Visible visible={pr.state}>
<>
                                            <span className="text-muted-foreground/50">·</span>
                                            <span className="capitalize">{pr.state}</span>
                                        </>
</Visible>
                                </div>
</Visible>
                        </div>
                    </div>
                </div>

                {/* Review state */}
                <Visible visible={reviewStatus === 'running'}>
<div className="mb-4 rounded-md border border-border bg-card">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />

                            <div>
                                <p className="text-xs font-medium text-foreground">
                                    Generating AI review…
                                </p>
                                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                    Summarizing the pull request and evaluating it against project context.
                                </p>
                            </div>
                        </div>
                    </div>
</Visible>

                <Visible visible={reviewStatus === 'error'}>
<div className="mb-4 rounded-md border border-destructive/30 bg-destructive/[0.04]">
                        <div className="flex items-start gap-3 px-4 py-3">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />

                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground">
                                    Review generation failed
                                </p>
                                <p className="mt-1 break-words text-[11px] leading-5 text-muted-foreground">
                                    {reviewMessage || 'The AI review could not be generated.'}
                                </p>
                            </div>
                        </div>
                    </div>
</Visible>

                <Visible visible={reviewStatus === 'success' && review}>
<div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2.5">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>AI review generated</span>
                        </div>

                        <Visible visible={verdict}>
<span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getVerdictClasses(
                                    review?.overallVerdict,
                                )}`}
                            >
                                {verdict}
                            </span>
</Visible>
                    </div>
</Visible>

                {/* Description / summary */}
                <div className="overflow-hidden rounded-md border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
                        <div className="flex items-center gap-1.5">
                            <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold text-foreground">
                                <Visible visible={review?.summary} fallback={'Description'}>
                                    'AI summary'
                                </Visible>
                            </span>
                        </div>
                    </div>

                    <div className="px-4 py-4">
                        <MarkdownPreview
                            source={markdownContent}
                            style={{
                                backgroundColor: 'transparent',
                                color: 'inherit',
                                fontSize: 13,
                                lineHeight: 1.65,
                            }}
                            className="
                w-full
                !bg-transparent
                !text-[13px]
                [&_h1]:!mt-0
                [&_h1]:!mb-3
                [&_h1]:!text-lg
                [&_h1]:!font-semibold
                [&_h2]:!mt-5
                [&_h2]:!mb-2
                [&_h2]:!text-[15px]
                [&_h2]:!font-semibold
                [&_h3]:!mt-4
                [&_h3]:!mb-2
                [&_h3]:!text-sm
                [&_h3]:!font-semibold
                [&_p]:!my-2
                [&_p]:!text-[13px]
                [&_p]:!leading-6
                [&_ul]:!my-2
                [&_ol]:!my-2
                [&_li]:!my-1
                [&_code]:!rounded
                [&_code]:!border
                [&_code]:!border-border
                [&_code]:!bg-muted/50
                [&_code]:!px-1
                [&_code]:!py-0.5
                [&_code]:!text-[11px]
                [&_pre]:!rounded-md
                [&_pre]:!border
                [&_pre]:!border-border
                [&_pre]:!bg-muted/30
                [&_pre]:!text-xs
                [&_blockquote]:!border-l-2
                [&_blockquote]:!border-border
                [&_blockquote]:!pl-3
                [&_blockquote]:!text-muted-foreground
                [&_hr]:!my-4
                [&_hr]:!border-border
                [&_a]:!text-blue-600
                dark:[&_a]:!text-blue-400
              "
                        />
                    </div>
                </div>

                <Visible visible={reviewStatus === 'success' && review?.summary}>
<p className="mt-2 px-0.5 text-[10px] leading-4 text-muted-foreground">
                        AI-generated summary based on the pull request diff and available project context.
                    </p>
</Visible>
            </div>
        </div>
    );
}
