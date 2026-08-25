import { useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDuration, getErrorMessage } from '../utils/repo-utils';
import Visible from "@/components/common/Visible";

export function RepositoryRefetchError({
    isRefetchError,
    repositoryError,
    isFetching,
    onRetry,
}: {
    isRefetchError: boolean;
    repositoryError: unknown;
    isFetching: boolean;
    onRetry: () => void;
}) {
    if (!isRefetchError) return null;

    return (
        <div className="mt-4 flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />

            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-foreground">
                    Could not refresh repository details
                </p>

                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {getErrorMessage(repositoryError, 'The existing repository data is still being shown.')}
                </p>
            </div>

            <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isFetching}
                onClick={onRetry}
                className="h-7 shrink-0 gap-1.5 px-2 text-[10px]"
            >
                <Visible visible={isFetching} fallback={(
                    <RefreshCw className="h-3 w-3" />
                )}>
                    <Loader2 className="h-3 w-3 animate-spin" />
                </Visible>
                Retry
            </Button>
        </div>
    );
}

interface IndexingProgressProps {
    isCurrentlyIndexing: boolean;
    indexingDuration: number;
    indexingLog: string[];
    indexingThinking: string;
    onCancel: () => void;
}

export function IndexingProgress({
    isCurrentlyIndexing,
    indexingDuration,
    indexingLog,
    indexingThinking,
    onCancel,
}: IndexingProgressProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [indexingLog, indexingThinking]);

    if (!isCurrentlyIndexing) return null;

    return (
        <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />

                    <span className="truncate text-xs font-medium text-foreground">
                        Indexing repository
                    </span>

                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {formatDuration(indexingDuration)}
                    </span>
                </div>

                <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="h-3 w-3" />
                    Cancel
                </button>
            </div>

            <div ref={containerRef} className="max-h-44 overflow-y-auto bg-background px-3 py-2.5 font-mono">
                <Visible visible={indexingLog.length > 0} fallback={(
                    <p className="text-[10px] leading-4 text-muted-foreground">Waiting for progress…</p>
                )}>

                    <div className="space-y-1">
                        {indexingLog.map((message, index) => (
                            <p
                                key={`${message}-${index}`}
                                className={
                                    index === indexingLog.length - 1
                                        ? 'text-[10px] leading-4 text-foreground'
                                        : 'text-[10px] leading-4 text-muted-foreground'
                                }
                            >
                                {message}
                            </p>
                        ))}
                    </div>
                </Visible>

                <Visible visible={indexingThinking}>
                    <div className="mt-2 border-l-2 border-border pl-2">
                        <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                            Analyzing
                        </p>

                        <div className="whitespace-pre-wrap text-[10px] leading-4 text-muted-foreground">
                            {indexingThinking}
                        </div>
                    </div>
                </Visible>
            </div>
        </div>
    );
}

interface IndexingErrorProps {
    error: string | null;
    onDismiss: () => void;
}

export function IndexingError({ error, onDismiss }: IndexingErrorProps) {
    if (!error) return null;

    return (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-destructive/25 bg-destructive/[0.04] px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />

            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">Indexing failed</p>

                <p className="mt-0.5 break-words font-mono text-[10px] leading-4 text-muted-foreground">
                    {error}
                </p>
            </div>

            <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss error"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
