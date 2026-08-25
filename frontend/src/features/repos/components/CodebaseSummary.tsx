import {
    AlertCircle,
    CheckCircle2,
    CircleSlash2,
    FileText,
    Loader2,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useParams } from 'react-router-dom';

import { useSocketEffect } from '@/lib/hooks/useSocketEffect';
import type { CodebaseFacts } from '../types/codebase-facts';
import { buildMarkdown } from '../utils/markdown-builder';
import Visible from "@/components/common/Visible";

type IndexingStatus =
    | 'idle'
    | 'running'
    | 'success'
    | 'error'
    | 'cancelled';

interface IndexingProgressEvent {
    projectId?: string | number;
    status:
    | 'running'
    | 'success'
    | 'error'
    | 'cancelled';
    message?: string;
    facts?: CodebaseFacts;
}

interface CodebaseSummaryProps {
    initialFacts?: CodebaseFacts | null;
}

export function CodebaseSummary({
    initialFacts,
}: CodebaseSummaryProps) {
    const { id: repoId } =
        useParams<{ id: string }>();

    const [statusMessage, setStatusMessage] =
        useState('');

    const [
        indexingStatus,
        setIndexingStatus,
    ] = useState<IndexingStatus>('idle');

    const [facts, setFacts] =
        useState<CodebaseFacts | null>(
            initialFacts ?? null,
        );

    /**
     * Keep the local view synchronized when:
     * - project data finishes loading asynchronously
     * - the user navigates to another repository
     */
    useEffect(() => {
        setFacts(initialFacts ?? null);
        setIndexingStatus('idle');
        setStatusMessage('');
    }, [repoId, initialFacts]);

    useSocketEffect({
        onIndexingProgress: (
            data: IndexingProgressEvent,
        ) => {
            if (
                data.projectId !== undefined &&
                repoId &&
                String(data.projectId) !==
                String(repoId)
            ) {
                return;
            }

            switch (data.status) {
                case 'running':
                    setIndexingStatus('running');
                    setStatusMessage(
                        data.message ||
                        'Scanning repository…',
                    );
                    break;

                case 'success':
                    setIndexingStatus('success');
                    setStatusMessage(
                        data.message ||
                        'Indexing complete',
                    );

                    if (data.facts) {
                        setFacts(data.facts);
                    }

                    break;

                case 'error':
                    setIndexingStatus('error');
                    setStatusMessage(
                        data.message ||
                        'An unknown error occurred during indexing.',
                    );
                    break;

                case 'cancelled':
                    setIndexingStatus('cancelled');
                    setStatusMessage(
                        data.message ||
                        'Indexing was cancelled.',
                    );
                    break;
            }
        },
    });

    const markdownContent = useMemo(
        () =>
            facts
                ? buildMarkdown(facts)
                : '',
        [facts],
    );

    const StatusIndicator = () => {
        switch (indexingStatus) {
            case 'running':
                return (
                    <div className="flex max-w-[320px] items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />

                        <span className="truncate">
                            {statusMessage}
                        </span>
                    </div>
                );

            case 'success':
                return (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />

                        <span>
                            {statusMessage}
                        </span>
                    </div>
                );

            case 'error':
                return (
                    <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Indexing failed</span>
                    </div>
                );

            case 'cancelled':
                return (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <CircleSlash2 className="h-3.5 w-3.5" />
                        <span>Indexing cancelled</span>
                    </div>
                );

            default:
                return null;
        }
    };

    if (!facts) {
        return (
            <div className="space-y-4">
                <div className="rounded-md border border-border bg-card">
                    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />

                                <h2 className="text-sm font-semibold text-foreground">
                                    Codebase facts
                                </h2>
                            </div>

                            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                                No indexed architectural
                                knowledge is available for
                                this repository yet.
                            </p>
                        </div>

                        <StatusIndicator />
                    </div>
                </div>

                <Visible visible={indexingStatus ===
                    'error'}>
<SummaryIndexingError
                        title="Indexing failed"
                        message={statusMessage}
                    />
</Visible>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />

                        <h2 className="text-sm font-semibold text-foreground">
                            Codebase facts
                        </h2>
                    </div>

                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                        Indexed architectural knowledge
                        about this repository&apos;s
                        structure, behavior, dependencies,
                        and constraints.
                    </p>
                </div>

                <StatusIndicator />
            </div>

            <Visible visible={indexingStatus === 'error'}>
<SummaryIndexingError
                    title="Re-indexing failed"
                    message={statusMessage}
                />
</Visible>

            <section className="overflow-hidden rounded-md border border-border bg-card">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                        <span className="truncate font-mono text-[11px] font-medium text-foreground">
                            CODEBASE_FACTS.md
                        </span>
                    </div>

                    <span className="hidden text-[10px] text-muted-foreground sm:block">
                        Generated from indexed repository
                        context
                    </span>
                </div>

                <div className="overflow-x-auto bg-background px-4 py-4">
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
              [&_h1]:!mb-4
              [&_h1]:!border-b
              [&_h1]:!border-border
              [&_h1]:!pb-2
              [&_h1]:!text-lg
              [&_h1]:!font-semibold

              [&_h2]:!mb-2
              [&_h2]:!mt-6
              [&_h2]:!border-b
              [&_h2]:!border-border/70
              [&_h2]:!pb-1.5
              [&_h2]:!text-sm
              [&_h2]:!font-semibold

              [&_h3]:!mb-1.5
              [&_h3]:!mt-4
              [&_h3]:!text-[13px]
              [&_h3]:!font-semibold

              [&_p]:!my-2
              [&_p]:!text-[13px]
              [&_p]:!leading-6

              [&_ul]:!my-2
              [&_ol]:!my-2

              [&_li]:!my-1
              [&_li]:!text-[13px]
              [&_li]:!leading-5

              [&_code]:!rounded
              [&_code]:!border
              [&_code]:!border-border
              [&_code]:!bg-muted/40
              [&_code]:!px-1
              [&_code]:!py-0.5
              [&_code]:!font-mono
              [&_code]:!text-[11px]

              [&_strong]:!font-semibold
              [&_strong]:!text-foreground

              [&_hr]:!my-5
              [&_hr]:!border-border

              [&_a]:!text-blue-600
              dark:[&_a]:!text-blue-400
            "
                    />
                </div>
            </section>
        </div>
    );
}

function SummaryIndexingError({
    title,
    message,
}: {
    title: string;
    message: string;
}) {
    return (
        <div className="rounded-md border border-destructive/25 bg-destructive/[0.04]">
            <div className="flex items-start gap-3 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />

                <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                        {title}
                    </p>

                    <p className="mt-1 break-words font-mono text-[10px] leading-4 text-muted-foreground">
                        {message}
                    </p>
                </div>
            </div>
        </div>
    );
}
