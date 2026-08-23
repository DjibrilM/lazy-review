import { Bot, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Visible from "@/components/common/Visible";

export function AIReviewSessionDialog({
    prToOpen,
    onClose,
    onSelectPR,
    isCurrentlyIndexing,
    isIndexed,
}: {
    prToOpen: any;
    onClose: () => void;
    onSelectPR: (pr: any, startFresh: boolean) => void;
    isCurrentlyIndexing: boolean;
    isIndexed: boolean;
}) {
    return (
        <Dialog open={!!prToOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-purple-400" />
                        AI Review Session
                    </DialogTitle>
                </DialogHeader>

                <Visible visible={prToOpen}>
                    <div className="flex flex-col gap-5 pt-2">
                        <div className="mb-2">
                            <div className="text-sm text-muted-foreground mb-1">Target Pull Request</div>
                            <div className="text-foreground font-medium">{prToOpen?.title} <span className="text-muted-foreground">#{prToOpen?.number}</span></div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            <Visible visible={isCurrentlyIndexing}>
                                "Indexing is currently in progress. Please wait for it to finish before starting a review."
                            </Visible>
                            <Visible visible={!isCurrentlyIndexing && !isIndexed}>
                                "Repository must be indexed before starting a review. Please index the repository first."
                            </Visible>
                            <Visible visible={!isCurrentlyIndexing && isIndexed}>
                                <Visible visible={prToOpen?.hasExistingReview} fallback={"No existing review found for this pull request. Start a new AI review session to analyze the changes."}>
                                    "An active AI review session exists for this pull request. You can continue from where you left off or start a fresh review."
                                </Visible>
                            </Visible>
                        </p>

                        <div className="flex flex-col space-y-3 pt-2">
                            <Visible visible={isCurrentlyIndexing || !isIndexed} fallback={(
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
                                    <Bot className="w-4 h-4 mr-2" />
                                    {isCurrentlyIndexing ? 'Wait for indexing...' : 'Index first'}
                                </Button>
                            </Visible>
                        </div>
                    </div>
                </Visible>
            </DialogContent>
        </Dialog>
    );
}
