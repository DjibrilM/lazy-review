import { useState } from 'react';
import { Bot, CheckCircle2, Loader2, Play, RefreshCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Visible from '@/components/common/Visible';
import { formatDuration } from '../utils/repo-utils';

export function AIReviewSessionDialog({
    prToOpen,
    onClose,
    onSelectPR,
    isCurrentlyIndexing,
    isIndexed,
    indexingThinking = '',
    indexingDuration = 0,
    indexingError = null,
    onStartIndexing,
}: {
    prToOpen: any;
    onClose: () => void;
    onSelectPR: (pr: any, startFresh: boolean) => void;
    isCurrentlyIndexing: boolean;
    isIndexed: boolean;
    indexingThinking?: string;
    indexingDuration?: number;
    indexingError?: string | null;
    onStartIndexing?: () => void;
}) {
    const [requestedIndexing, setRequestedIndexing] = useState(false);
    const [lastPrToOpen, setLastPrToOpen] = useState(prToOpen);

    // Reset the "waiting for a requested index" state every time the dialog opens.
    // Derive during render (React-sanctioned pattern for resetting state on prop
    // change) instead of calling setState inside an effect.
    if (prToOpen && prToOpen !== lastPrToOpen) {
        setLastPrToOpen(prToOpen);
        setRequestedIndexing(false);
    } else if (!prToOpen && lastPrToOpen) {
        setLastPrToOpen(null);
    }

    const isWaitingForIndex = isCurrentlyIndexing || requestedIndexing;

    const handleRequestIndexing = () => {
        if (!onStartIndexing) return;
        onStartIndexing();
        setRequestedIndexing(true);
    };
    return (
        <Dialog open={!!prToOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Review Session
                    </DialogTitle>
                </DialogHeader>

                <Visible visible={prToOpen}>
                    <div className="flex flex-col gap-5 pt-2">
                        <div className="mb-2">
                            <div className="text-sm text-muted-foreground mb-1">Target Pull Request</div>
                            <div className="text-foreground font-medium">{prToOpen?.title} <span className="text-muted-foreground">#{prToOpen?.number}</span></div>
                        </div>

                        {/* Index gate status */}
                        <div className="rounded-md border border-border bg-muted/15 px-3 py-2.5">
                            <Visible visible={isIndexed} fallback={(
                                <Visible visible={isWaitingForIndex} fallback={
                                    <div className="flex flex-col gap-2">
                                        <p className="text-sm">
                                            {indexingError
                                                ? 'Indexing failed. AI reviews need at least one completed index before they can be started.'
                                                : 'This repository is not indexed yet. Start the first indexing pass to unlock AI reviews.'}
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleRequestIndexing}
                                            className="self-start"
                                        >
                                            <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                                            {indexingError ? 'Try indexing again' : 'Index repository now'}
                                        </Button>
                                        <p className="text-xs text-muted-foreground">
                                            AI reviews unlock automatically as soon as the index is ready — this dialog updates live.
                                        </p>
                                    </div>
                                }>
                                    <div className="flex flex-col gap-1.5">
                                        <p className="text-sm flex items-center">
                                            <Loader2 className="h-3.5 w-3.5 mr-1.5 shrink-0 animate-spin" />
                                            {isCurrentlyIndexing
                                                ? `Indexing in progress — AI reviews unlock when it finishes (${formatDuration(indexingDuration)} elapsed).`
                                                : 'Indexing request was sent. It should start automatically and unlock this dialog when done.'}
                                        </p>
                                        {indexingThinking && !indexingError ? (
                                            <p className="text-xs italic text-muted-foreground truncate">
                                                {indexingThinking.slice(-320)}
                                            </p>
                                        ) : indexingError ? (
                                            <p className="text-xs text-destructive">
                                                {indexingError}
                                            </p>
                                        ) : null}
                                    </div>
                                </Visible>
                            )}>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                    <p className="text-sm text-muted-foreground">
                                        Index ready — AI reviews are unlocked for this repository.
                                    </p>
                                </div>
                            </Visible>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            <Visible
                                visible={isIndexed}
                                fallback={<span>AI reviews are locked until this repository has been indexed at least once.</span>}
                            >
                                <Visible visible={prToOpen?.hasExistingReview} fallback={"No existing review found for this pull request. Start a new AI review session to analyze the changes."}>
                                    "An active AI review session exists for this pull request. You can continue from where you left off or start a fresh review."
                                </Visible>
                            </Visible>
                        </p>

                        <div className="flex flex-col space-y-3 pt-2">
                            <Visible visible={isWaitingForIndex} fallback={(
                                <Visible visible={prToOpen?.hasExistingReview} fallback={(
                                    <Button
                                        onClick={() => onSelectPR(prToOpen, true)}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        Start Review
                                    </Button>
                                )}>
                                    <>
                                        <Button
                                            onClick={() => onSelectPR(prToOpen, false)}
                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                                        >
                                            <Play className="w-4 h-4 mr-2" />
                                            Continue Review
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => onSelectPR(prToOpen, true)}
                                            className="w-full"
                                        >
                                            <Bot className="w-4 h-4 mr-2" />
                                            Start New Review
                                        </Button>
                                    </>
                                </Visible>
                            )}>
                                <Button disabled className="w-full">
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Waiting for indexing…
                                </Button>
                            </Visible>
                        </div>
                    </div>
                </Visible>
            </DialogContent>
        </Dialog>
    );
}
