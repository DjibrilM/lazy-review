import {
    ChevronDown,
    ChevronRight,
    FileText,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/util/shared';
import { useEffect, useMemo, useState } from 'react';
import Visible from "@/components/common/Visible";

interface DiffLine {
    type: 'header' | 'file' | 'added' | 'removed' | 'unchanged' | 'hunk';
    content: string;
    oldLine: number | null;
    newLine: number | null;
}

interface FilePatch {
    fileName: string;
    additions: number;
    deletions: number;
    lines: DiffLine[];
}

/** Parse a unified diff string into file patches */
function parseDiff(diff: string): FilePatch[] {
    const files: FilePatch[] = [];
    let current: FilePatch | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const raw of diff.split('\n')) {
        if (raw.startsWith('diff --git')) {
            if (current) files.push(current);
            current = { fileName: '', additions: 0, deletions: 0, lines: [] };
            continue;
        }

        if (raw.startsWith('--- ') || raw.startsWith('+++ ')) {
            if (current && raw.startsWith('+++ ')) {
                current.fileName = raw.replace('+++ b/', '').replace('+++ ', '').trim();
            }
            continue;
        }

        if (raw.startsWith('@@')) {
            const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);

            if (match) {
                oldLineNum = parseInt(match[1], 10);
                newLineNum = parseInt(match[2], 10);
            }

            current?.lines.push({
                type: 'hunk',
                content: raw,
                oldLine: null,
                newLine: null,
            });

            continue;
        }

        if (!current) continue;

        if (raw.startsWith('+')) {
            current.lines.push({
                type: 'added',
                content: raw,
                oldLine: null,
                newLine: newLineNum++,
            });
            current.additions++;
        } else if (raw.startsWith('-')) {
            current.lines.push({
                type: 'removed',
                content: raw,
                oldLine: oldLineNum++,
                newLine: null,
            });
            current.deletions++;
        } else if (raw.startsWith('\\')) {
            // "No newline at end of file" marker — skip
        } else {
            current.lines.push({
                type: 'unchanged',
                content: raw,
                oldLine: oldLineNum++,
                newLine: newLineNum++,
            });
        }
    }

    if (current) files.push(current);

    return files.filter((file) => file.fileName);
}

interface FilesChangedTabProps {
    diff: string;
    isLoading?: boolean;
    selectedFileForDiff?: string | null;
    onDiffScrolled?: () => void;
}

export function FilesChangedTab({
    diff,
    isLoading,
    selectedFileForDiff,
    onDiffScrolled,
}: FilesChangedTabProps) {
    const patches = useMemo(() => parseDiff(diff || ''), [diff]);

    const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

    const totalAdditions = useMemo(
        () => patches.reduce((total, file) => total + file.additions, 0),
        [patches],
    );

    const totalDeletions = useMemo(
        () => patches.reduce((total, file) => total + file.deletions, 0),
        [patches],
    );

    useEffect(() => {
        if (!selectedFileForDiff) return;

        setExpandedFiles((prev) => ({
            ...prev,
            [selectedFileForDiff]: true,
        }));

        const timeout = window.setTimeout(() => {
            const el = document.getElementById(
                `diff-file-${selectedFileForDiff}`,
            );

            if (el) {
                el.scrollIntoView({
                    behavior: 'auto',
                    block: 'start',
                });
            }

            onDiffScrolled?.();
        }, 100);

        return () => window.clearTimeout(timeout);
    }, [selectedFileForDiff, onDiffScrolled]);

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center gap-2 bg-background text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading diff…</span>
            </div>
        );
    }

    if (!diff || patches.length === 0) {
        return (
            <div className="flex h-full items-center justify-center bg-background text-xs text-muted-foreground">
                No changes to display.
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background">
            {/* Summary bar */}
            <div className="flex h-8 shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    <span>
                        {patches.length} file<Visible visible={patches.length !== 1} fallback={''}>
                            's'
                        </Visible> changed
                    </span>
                </div>

                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    +{totalAdditions}
                </span>

                <span className="font-mono text-red-600 dark:text-red-400">
                    -{totalDeletions}
                </span>
            </div>

            <div className="flex-1 space-y-3 overflow-auto p-4">
                {patches.map((patch) => {
                    const isExpanded = expandedFiles[patch.fileName] !== false;

                    return (
                        <section
                            key={patch.fileName}
                            id={`diff-file-${patch.fileName}`}
                            className="overflow-hidden rounded-md border border-border bg-card"
                        >
                            {/* File header */}
                            <button
                                type="button"
                                onClick={() =>
                                    setExpandedFiles((prev) => ({
                                        ...prev,
                                        [patch.fileName]: !isExpanded,
                                    }))
                                }
                                className="flex w-full items-center justify-between gap-3 border-b border-border bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/35"
                            >
                                <div className="flex min-w-0 items-center gap-2">
                                    <Visible visible={isExpanded} fallback={(
                                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    )}>
                                        (
                                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
</Visible>

                                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                                    <span
                                        className="truncate font-mono text-[11px] font-medium text-foreground"
                                        title={patch.fileName}
                                    >
                                        {patch.fileName}
                                    </span>
                                </div>

                                <div className="flex shrink-0 items-center gap-2 font-mono text-[10px]">
                                    <span className="text-emerald-600 dark:text-emerald-400">
                                        +{patch.additions}
                                    </span>
                                    <span className="text-red-600 dark:text-red-400">
                                        -{patch.deletions}
                                    </span>
                                </div>
                            </button>

                            <Visible visible={isExpanded}>
<div className="overflow-x-auto bg-background font-mono text-[11px] leading-5">
                                    {patch.lines.map((line, lineIndex) => {
                                        if (line.type === 'hunk') {
                                            return (
                                                <div
                                                    key={lineIndex}
                                                    className="border-y border-blue-500/10 bg-blue-500/[0.055] px-3 py-1 text-[10px] text-blue-700 dark:text-blue-300"
                                                >
                                                    {line.content}
                                                </div>
                                            );
                                        }

                                        const isAdded = line.type === 'added';
                                        const isRemoved = line.type === 'removed';

                                        const rowClass = isAdded
                                            ? 'bg-emerald-500/[0.075]'
                                            : isRemoved
                                                ? 'bg-red-500/[0.075]'
                                                : 'bg-background';

                                        const gutterClass = isAdded
                                            ? 'bg-emerald-500/[0.09]'
                                            : isRemoved
                                                ? 'bg-red-500/[0.09]'
                                                : 'bg-muted/[0.12]';

                                        const textClass = isAdded
                                            ? 'text-emerald-950 dark:text-emerald-100'
                                            : isRemoved
                                                ? 'text-red-950 dark:text-red-100'
                                                : 'text-foreground/90';

                                        return (
                                            <div
                                                key={lineIndex}
                                                className={cn(
                                                    'group flex min-w-max hover:bg-muted/20',
                                                    rowClass,
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        'w-11 shrink-0 select-none border-r border-border/60 px-2 py-0.5 text-right text-[10px] text-muted-foreground',
                                                        gutterClass,
                                                    )}
                                                >
                                                    {line.oldLine ?? ''}
                                                </div>

                                                <div
                                                    className={cn(
                                                        'w-11 shrink-0 select-none border-r border-border/60 px-2 py-0.5 text-right text-[10px] text-muted-foreground',
                                                        gutterClass,
                                                    )}
                                                >
                                                    {line.newLine ?? ''}
                                                </div>

                                                <div
                                                    className={cn(
                                                        'min-w-0 flex-1 whitespace-pre px-3 py-0.5',
                                                        textClass,
                                                    )}
                                                >
                                                    {line.content}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
</Visible>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
