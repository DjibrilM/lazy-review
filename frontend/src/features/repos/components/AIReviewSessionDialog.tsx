import { Bot, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function AIReviewSessionDialog({
  prToOpen,
  onClose,
  onSelectPR,
}: {
  prToOpen: any;
  onClose: () => void;
  onSelectPR: (pr: any, startFresh: boolean) => void;
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
        
        {prToOpen && (
          <div className="flex flex-col gap-5 pt-2">
            <div className="mb-2">
              <div className="text-sm text-muted-foreground mb-1">Target Pull Request</div>
              <div className="text-foreground font-medium">{prToOpen.title} <span className="text-muted-foreground">#{prToOpen.number}</span></div>
            </div>
            
            <p className="text-sm text-muted-foreground">
              {prToOpen.hasExistingReview 
                ? "An active AI review session exists for this pull request. Would you like to continue from where you left off or start fresh?"
                : "No active review session found. The AI will fetch the latest diff and initialize the context envelope against the local codebase."}
            </p>

            <div className="flex flex-col space-y-3 pt-2">
              {prToOpen.hasExistingReview ? (
                <>
                  <Button 
                    onClick={() => onSelectPR(prToOpen, false)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Continue Existing Review
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => onSelectPR(prToOpen, true)}
                    className="w-full"
                  >
                    <Bot className="w-4 h-4 mr-2" />
                    Start Fresh Review
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={() => onSelectPR(prToOpen, true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Initialize AI Review
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
