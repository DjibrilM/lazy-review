import { BookOpen, Loader2, RefreshCw, Trash2 } from 'lucide-react';
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
import Visible from "@/components/common/Visible";

interface RepositoryHeaderProps {
    repo: {
        repository_url?: string;
        name: string;
    };
    owner: string;
    isFetching: boolean;
    isLoading: boolean;
    isCurrentlyIndexing: boolean;
    isDeleting: boolean;
    onReindex: () => void;
    onDelete: () => void;
}

export function RepositoryHeader({
    repo,
    owner,
    isFetching,
    isLoading,
    isCurrentlyIndexing,
    isDeleting,
    onReindex,
    onDelete,
}: RepositoryHeaderProps) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                    <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />

                    <a
                        href={repo.repository_url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-[15px] font-normal text-blue-600 hover:underline dark:text-blue-400"
                    >
                        {owner}
                    </a>

                    <span className="text-[15px] text-muted-foreground">/</span>

                    <a
                        href={repo.repository_url}
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
                    Local repository context, pull requests, and indexed architecture.
                </p>
            </div>

            {/* Repository actions */}
            <div className="flex shrink-0 items-center gap-2">
                <Visible visible={isFetching && !isLoading}>
<div className="mr-1 hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Refreshing</span>
                    </div>
</Visible>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={onReindex}
                    disabled={isCurrentlyIndexing}
                    className="h-8 gap-1.5 px-3 text-xs"
                >
                    <Visible visible={isCurrentlyIndexing} fallback={(
                        <RefreshCw className="h-3.5 w-3.5" />
                    )}>
                        (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
</Visible>
                    <Visible visible={isCurrentlyIndexing} fallback={'Re-index'}>
                        'Indexing…'
                    </Visible>
                </Button>

                <Dialog>
                    <DialogTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isDeleting}
                            className="h-8 gap-1.5 border-destructive/30 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                            <Visible visible={isDeleting} fallback={(
                                <Trash2 className="h-3.5 w-3.5" />
                            )}>
                                (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
</Visible>
                            Delete
                        </Button>
                    </DialogTrigger>

                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-sm">Delete repository</DialogTitle>
                            <DialogDescription className="text-xs leading-5">
                                This removes the local project record, indexed facts, AI analysis, and saved review
                                state. This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>

                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline" size="sm">
                                    Cancel
                                </Button>
                            </DialogClose>

                            <Button variant="destructive" size="sm" onClick={onDelete} disabled={isDeleting}>
                                <Visible visible={isDeleting}>
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                </Visible>
                                Delete repository
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
