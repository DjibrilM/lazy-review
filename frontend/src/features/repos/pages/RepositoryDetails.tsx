import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, GitPullRequest, FileText, Loader2, RefreshCw, AlertTriangle, X, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PRList } from '../components/PRList';
import { CodebaseSummary } from '../components/CodebaseSummary';
import { AIReviewSessionDialog } from '../components/AIReviewSessionDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { projectService } from '@/services/project.service';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';

export function RepositoryDetails() {

  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [prToOpen, setPrToOpen] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [indexingError, setIndexingError] = useState<string | null>(null);
  const [indexingLog, setIndexingLog] = useState<string[]>([]);
  const [indexingThinking, setIndexingThinking] = useState<string>('');
  const [indexingDuration, setIndexingDuration] = useState(0);

  const { data: repo, isLoading } = useQuery({
    queryKey: ['local-project', id],
    queryFn: () => projectService.getProject(id as string),
    enabled: !!id,
  });

  useSocketEffect({
    onIndexingProgress: (data: any) => {
      if (data.projectId && id && data.projectId !== id) return;

      if (data.status === 'running') {
        setIsReindexing(true);
        setIndexingError(null);
        if (data.message) {
          if (data.isStreamChunk) {
            setIndexingThinking(prev => prev + data.message);
          } else {
            setIndexingLog(prev => [...prev, data.message]);
            setIndexingThinking('');
          }
        }
      } else if (data.status === 'success') {
        setIsReindexing(false);
        setIndexingError(null);
        setIndexingLog([]);
        setIndexingThinking('');
        queryClient.invalidateQueries({ queryKey: ['local-project', id] });
      } else if (data.status === 'error') {
        setIsReindexing(false);
        setIndexingError(data.message || 'An unknown error occurred during indexing.');
        setIndexingLog([]);
        setIndexingThinking('');
        queryClient.invalidateQueries({ queryKey: ['local-project', id] });
      }
    }
  });

  const isCurrentlyIndexing = isReindexing || repo?.current_task === 'indexing';

  useEffect(() => {
    let interval: any;
    if (isCurrentlyIndexing) {
      interval = setInterval(() => {
        setIndexingDuration(prev => prev + 1);
      }, 1000);
    } else {
      setIndexingDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCurrentlyIndexing]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) return <div className="p-8 text-muted-foreground flex items-center justify-center"><Loader2 className="animate-spin mr-2" /> Loading repository...</div>;
  if (!repo) return <div className="p-8 text-muted-foreground">Repository not found</div>;

  const handleSelectPR = async (pr: any, startFresh?: boolean) => {
    if (startFresh && repo) {
      try {
        await projectService.deleteReview(repo.id, pr.number);
        navigate(`/repo/${repo.id}/review/${pr.number}`);
      } catch (error: any) {
        toast.error('Failed to reset review state');
        return;
      }
    }

  };

  const handleReindex = async () => {
    if (!repo) return;
    try {
      setIsReindexing(true);
      setIndexingError(null);
      setIndexingLog([]);
      await projectService.reindexProject(repo.id);
      toast.success('Re-indexing started successfully');
    } catch (error: any) {
      setIsReindexing(false);
      toast.error(error.message || 'Failed to start re-indexing');
    }
  };

  const handleCancelIndexing = async () => {
    if (!repo) return;
    try {
      await projectService.cancelIndexing(repo.id);
      setIsReindexing(false);
      toast.success('Indexing cancellation request sent');
      queryClient.invalidateQueries({ queryKey: ['local-project', id] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel indexing');
    }
  };
  const handleDeleteProject = async () => {
    if (!repo) return;
    try {
      setIsDeleting(true);
      await projectService.deleteProject(repo.id);
      toast.success('Project deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['local-projects'] });
      navigate('/');
    } catch (error: any) {
      setIsDeleting(false);
      toast.error(error.message || 'Failed to delete project');
    }
  };
  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      {/* Repo Header */}
      <div className="bg-background pt-6 px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center space-x-2 mb-6">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <span className="text-xl text-blue-400 hover:underline cursor-pointer">
              {repo.repository_url.split('/')[3] || 'unknown'}
            </span>
            <span className="text-xl text-muted-foreground">/</span>
            <span className="text-xl font-semibold text-blue-400 hover:underline cursor-pointer">
              {repo.name}
            </span>
            <span className="ml-2 text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
              Local Clone
            </span>
            <div className="flex-1" />
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2 text-xs mr-2" disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {isDeleting ? 'Deleting...' : 'Delete Project'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Project</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this project? This action cannot be undone. All AI analysis, vector data, and PR reviews will be permanently removed.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogTrigger asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogTrigger>
                  <Button variant="destructive" onClick={handleDeleteProject} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReindex}
              disabled={isCurrentlyIndexing}
              className="gap-2 text-xs"
            >
              {isCurrentlyIndexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {isCurrentlyIndexing ? 'Indexing...' : 'Re-index Project'}
            </Button>
          </div>

          {/* Live indexing log — shown while indexing is running */}
          {isCurrentlyIndexing && (
            <div className="mb-4 rounded-lg border border-border bg-muted/20 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground font-semibold tracking-wide uppercase">Indexing in progress</span>
                  <span className="text-[10px] font-mono text-blue-500 font-semibold bg-blue-500/10 px-1.5 py-0.5 rounded ml-1">
                    {formatDuration(indexingDuration)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleCancelIndexing}
                  className="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 text-[10px] uppercase font-mono tracking-wider font-semibold"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </Button>
              </div>
              <div className="p-3 max-h-40 overflow-y-auto flex flex-col gap-1 scroll-smooth">
                {indexingLog.length > 0 ? (
                  indexingLog.map((msg, i) => (
                    <p key={i} className={`text-xs font-mono ${i === indexingLog.length - 1 ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                      {msg}
                    </p>
                  ))
                ) : (
                  <p className="text-xs font-mono text-muted-foreground italic">
                    Awaiting progress updates...
                  </p>
                )}
                {indexingThinking && (
                  <div className="mt-2 text-xs font-mono text-blue-400 whitespace-pre-wrap opacity-80">
                    {indexingThinking}
                  </div>
                )}
              </div>
            </div>
          )}
          {indexingError && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-destructive">Indexing failed</p>
                <p className="text-muted-foreground mt-0.5 break-all font-mono text-xs">{indexingError}</p>
              </div>
              <button
                onClick={() => setIndexingError(null)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <Tabs defaultValue="prs" className="w-full">
            <TabsList variant="line" className="justify-start mb-0 pb-0">
              <TabsTrigger value="prs" className="flex items-center gap-2">
                <GitPullRequest className="w-4 h-4" />
                Pull Requests
                <span className="bg-muted text-muted-foreground text-xs rounded-full px-2 py-0.5 ml-1">
                  2
                </span>
              </TabsTrigger>
              <TabsTrigger value="summary" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                AI Codebase Fact Base
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-auto p-6 lg:p-8 -mx-6 lg:-mx-8">
              <TabsContent value="prs">
                <PRList
                  onSelectPR={setPrToOpen}
                  owner={repo.repository_url.split('/')[3] || 'unknown'}
                  repoName={repo.name}
                />
              </TabsContent>
              <TabsContent value="summary">
                <CodebaseSummary initialFacts={repo.analysis} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      <AIReviewSessionDialog
        prToOpen={prToOpen}
        onClose={() => setPrToOpen(null)}
        onSelectPR={handleSelectPR}
      />
    </div>
  );
}
