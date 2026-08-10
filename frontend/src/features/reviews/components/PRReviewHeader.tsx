import { useNavigate } from 'react-router-dom';
import { ChevronRight, X, Check, GitPullRequest, FileText, Bot, Code, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/util/shared';

interface PRReviewHeaderProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pr: any;
  commitsLength: number;
  reviewStatus: 'idle' | 'running' | 'success' | 'error';
  issueCount: number;
  activeTab: 'pr_summary' | 'ai_review' | 'files';
  setActiveTab: (tab: 'pr_summary' | 'ai_review' | 'files') => void;
  handleConfirmAction: (actionType: 'request_changes' | 'approve') => void;
}

export function PRReviewHeader({
  repo,
  pr,
  commitsLength,
  reviewStatus,
  issueCount,
  activeTab,
  setActiveTab,
  handleConfirmAction,
}: PRReviewHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-background pt-6 px-6 lg:px-8 shrink-0 flex flex-col w-full border-b border-border relative">
      <div className="flex items-start justify-between w-full mb-2">
        <div className="flex items-start space-x-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/repo/${repo.id}`)}
            className="mt-1 shrink-0"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center space-x-3 mb-3">
              <h1 className="text-foreground font-normal text-3xl tracking-tight">{pr.title}</h1>
              <span className="text-muted-foreground font-light text-3xl">#{pr.number}</span>
            </div>
            <div className="text-sm text-muted-foreground flex items-center flex-wrap gap-2">
              <span
                className={cn(
                  'inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium text-white',
                  pr.state === 'open' || pr.status === 'open' ? 'bg-[#238636]' : 'bg-[#8957e5]'
                )}
              >
                <GitPullRequest className="w-4 h-4 mr-1.5" />
                {(pr.state || pr.status || '').charAt(0).toUpperCase() + (pr.state || pr.status || '').slice(1)}
              </span>
              <span className="flex items-center text-sm ml-1">
                <span className="font-semibold text-foreground mr-1">{pr.user?.login || pr.author}</span>
                wants to merge {commitsLength || pr.commits || 0} commit(s) into
                <code className="bg-muted/50 px-1.5 py-0.5 rounded text-blue-400 font-mono text-[12px] mx-1.5">
                  {pr.base?.ref || pr.baseBranch || 'main'}
                </code>
                from
                <code className="bg-muted/50 px-1.5 py-0.5 rounded text-blue-400 font-mono text-[12px] mx-1.5">
                  {pr.head?.ref || pr.headBranch || 'feature'}
                </code>
              </span>
            </div>
          </div>
        </div>
        <div className="flex space-x-2 shrink-0 items-start">
          <Button
            variant="outline"
            className="border-border text-foreground hover:bg-muted"
            size="sm"
            onClick={() => handleConfirmAction('request_changes')}
            disabled={reviewStatus !== 'success'}
          >
            <X className="w-4 h-4 mr-2" />
            Request Changes
          </Button>
          <Button
            className="bg-[#238636] hover:bg-[#2ea043] text-white"
            size="sm"
            onClick={() => handleConfirmAction('approve')}
            disabled={reviewStatus !== 'success'}
          >
            <Check className="w-4 h-4 mr-2" />
            Approve
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-6 mt-4 w-full pl-13">
        <div
          onClick={() => setActiveTab('pr_summary')}
          className={cn(
            'pb-3 border-b-2 cursor-pointer flex items-center text-sm font-medium transition-colors',
            activeTab === 'pr_summary' ? 'border-[#f78166] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <FileText className="w-4 h-4 mr-2" /> PR Summary
        </div>
        <div
          onClick={() => setActiveTab('ai_review')}
          className={cn(
            'pb-3 border-b-2 cursor-pointer flex items-center text-sm font-medium transition-colors',
            activeTab === 'ai_review' ? 'border-[#f78166] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Bot className="w-4 h-4 mr-2" />
          AI Review & Suggestions
          {reviewStatus === 'running' && <Loader2 className="w-3.5 h-3.5 ml-2 animate-spin text-muted-foreground" />}
          {reviewStatus === 'success' && issueCount > 0 && (
            <span className="ml-2 bg-red-500/10 text-red-500 rounded-full px-2 py-0.5 text-xs font-semibold">
              {issueCount} Issue{issueCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div
          onClick={() => setActiveTab('files')}
          className={cn(
            'pb-3 border-b-2 cursor-pointer flex items-center text-sm transition-colors',
            activeTab === 'files' ? 'border-[#f78166] text-foreground font-semibold' : 'border-transparent text-muted-foreground font-medium hover:text-foreground'
          )}
        >
          <Code className="w-4 h-4 mr-2" /> Files changed
          {pr.changed_files != null && (
            <span className="ml-2 bg-muted rounded-full px-2 py-0.5 text-xs font-semibold">{pr.changed_files}</span>
          )}
        </div>
      </div>
    </div>
  );
}
