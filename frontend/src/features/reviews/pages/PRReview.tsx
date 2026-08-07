import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  X,
  Check,
  Bot,
  Code,
  GitPullRequest,
  Send,
  FileText,
  MessageSquareMore,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { PRSummaryTab } from '../components/PRSummaryTab';
import { AIReviewTab } from '../components/AIReviewTab';
import { FilesChangedTab } from '../components/FilesChangedTab';
import Visibility from '@/components/common/Visible';
import { useQuery } from '@tanstack/react-query';
import { projectService } from '@/services/project.service';
import { githubService } from '@/services/github.service';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';
import { cn } from '@/lib/util/shared';

type TabType = 'pr_summary' | 'ai_review' | 'files';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  requiresConfirmation?: 'request_changes' | 'approve';
}

export function PRReview() {
  const { id, prId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('pr_summary');

  const { data: repo, isLoading: isLoadingRepo } = useQuery({
    queryKey: ['local-project', id],
    queryFn: () => projectService.getProject(id as string),
    enabled: !!id,
  });

  const owner = repo?.repository_url?.split('/')[3] || '';
  const repoName = repo?.name || '';
  const pullNumber = Number(prId);

  const { data: prs = [], isLoading: isLoadingPrs } = useQuery({
    queryKey: ['pull-requests', owner, repoName],
    queryFn: () => githubService.getPullRequests(owner, repoName),
    enabled: !!owner && !!repoName,
  });

  const pr = prs.find((p: any) => p.number === pullNumber);

  // Real commits from GitHub
  const { data: commits = [] } = useQuery({
    queryKey: ['pr-commits', owner, repoName, pullNumber],
    queryFn: () => githubService.getPRCommits(owner, repoName, pullNumber),
    enabled: !!owner && !!repoName && !!pullNumber,
  });

  // Real PR diff
  const { data: prDiff = '', isLoading: isLoadingDiff } = useQuery({
    queryKey: ['pr-diff', owner, repoName, pullNumber],
    queryFn: () => githubService.getPRDiff(owner, repoName, pullNumber),
    enabled: !!owner && !!repoName && !!pullNumber,
  });

  // AI review state
  const [review, setReview] = useState<any>(null);
  const [reviewStatus, setReviewStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [reviewMessage, setReviewMessage] = useState('');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Accumulate LLM conversation history (assistant role for API, stripped for display)
  const chatHistoryRef = useRef<{ role: string; content: string }[]>([]);

  // Listen for review_progress socket events
  useSocketEffect({
    onReviewProgress: useCallback((data: any) => {
      if (data.projectId && id && data.projectId !== id) return;
      if (data.status === 'running') {
        setReviewStatus('running');
        setReviewMessage(data.message || 'Generating review...');
      } else if (data.status === 'success') {
        setReviewStatus('success');
        setReview(data.review);
        setReviewMessage('');
        // Add system message to chat once review is ready
        setMessages((prev) => {
          if (prev.some((m) => m.role === 'system' && m.content.includes('Review complete'))) return prev;
          return [
            ...prev,
            {
              id: Date.now(),
              role: 'system',
              content: `✅ Review complete. Found ${data.review?.issues?.length ?? 0} issue(s). Ask me anything about this PR.`,
            },
          ];
        });
      } else if (data.status === 'error') {
        setReviewStatus('error');
        setReviewMessage(data.message || 'Review generation failed.');
      }
    }, [id]),
  });

  // Trigger AI review once diff is loaded
  useEffect(() => {
    if (!prDiff || !pr || !id || reviewStatus !== 'idle') return;
    setReviewStatus('running');
    setReviewMessage('🔍 Starting review...');
    projectService
      .generateReview(id, {
        prDiff,
        prTitle: pr.title || '',
        prBody: pr.body || '',
      })
      .then((result) => {
        if (result) {
          setReview(result);
          setReviewStatus('success');
        }
      })
      .catch((err: any) => {
        setReviewStatus('error');
        setReviewMessage(err.message || 'Review failed');
      });
  }, [prDiff, pr, id]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add initial system context message when PR data is ready
  useEffect(() => {
    if (pr && repo && messages.length === 0) {
      setMessages([
        {
          id: 1,
          role: 'system',
          content: `Context loaded: PR #${pr.number} "${pr.title}" — ${commits.length} commit(s). AI review is generating...`,
        },
      ]);
    }
  }, [pr, repo]);

  if (isLoadingRepo || isLoadingPrs) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading PR...
      </div>
    );
  }
  if (!repo || !pr) {
    return <div className="p-8 text-muted-foreground">Repository or PR not found.</div>;
  }

  const handleSend = async () => {
    if (!input.trim() || isChatLoading) return;
    const userText = input.trim();
    setInput('');

    const userMsg: ChatMessage = { id: Date.now(), role: 'user', content: userText };
    setMessages((prev) => [...prev, userMsg]);
    chatHistoryRef.current = [
      ...chatHistoryRef.current,
      { role: 'user', content: userText },
    ];

    setIsChatLoading(true);

    try {
      const reply = await projectService.chat(id as string, {
        history: chatHistoryRef.current.slice(0, -1), // history before this message
        message: userText,
        prDiff: prDiff || undefined,
      });

      chatHistoryRef.current = [...chatHistoryRef.current, { role: 'assistant', content: reply }];

      // Detect if the AI is ready to submit a review
      const lowerReply = reply.toLowerCase();
      const wantsRequestChanges =
        lowerReply.includes('request changes') ||
        lowerReply.includes('request_changes') ||
        lowerReply.includes('shall i submit') ||
        lowerReply.includes('should i submit');

      const assistantMsg: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: reply,
        requiresConfirmation: wantsRequestChanges ? 'request_changes' : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'system',
          content: `⚠️ Error: ${err.message || 'Chat request failed'}`,
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleConfirmAction = async (actionType: 'request_changes' | 'approve') => {
    const event = actionType === 'request_changes' ? 'REQUEST_CHANGES' : 'APPROVE';
    const reviewBody = review?.summary || 'Review submitted via Cactus Review.';

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: 'system',
        content: `Executing POST /repos/${owner}/${repoName}/pulls/${pr.number}/reviews (event: ${event})...`,
      },
    ]);

    try {
      await githubService.submitPRReview(owner, repoName, pr.number, reviewBody, event as any);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `✅ Successfully submitted "${event.replace('_', ' ')}" review to GitHub.`,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'system',
          content: `⚠️ GitHub API error: ${err.message}`,
        },
      ]);
    }
  };

  const issueCount = review?.issues?.length ?? 0;

  return (
    <div className="flex-1 flex flex-col bg-background h-[calc(100vh-64px)] overflow-hidden relative">
      {/* PR Header */}
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
                  wants to merge {commits.length || pr.commits || 0} commit(s) into
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

      {/* Split Screen */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 w-full overflow-hidden">
        {/* Left: Chat */}
        <ResizablePanel defaultSize={30}>
          <div className="bg-background flex flex-col z-10 shadow-lg relative h-full w-full min-w-[300px]">
            <div className="px-4 py-2 border-b border-border bg-card shrink-0 flex items-center space-x-2">
              <MessageSquareMore className="w-4 h-4 text-white/90" />
              <span className="font-semibold text-[13px] text-foreground">Interactive Review Architect</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[90%] text-sm rounded-lg p-3',
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : msg.role === 'system'
                          ? 'bg-muted border border-border text-muted-foreground font-mono text-xs'
                          : 'bg-card border border-border text-card-foreground'
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-center space-x-1.5 mb-2 pb-2 border-b border-border text-muted-foreground">
                        <Bot className="w-3.5 h-3.5" />
                        <span className="font-semibold text-xs">Local AI (QVAC)</span>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                    {msg.requiresConfirmation && (
                      <div className="mt-3 p-3 bg-background border border-border rounded-md shadow-inner">
                        <div className="text-xs text-muted-foreground font-mono mb-2 flex items-center">
                          <Code className="w-3.5 h-3.5 mr-1" />
                          GitHub API: {msg.requiresConfirmation === 'request_changes' ? 'REQUEST_CHANGES' : 'APPROVE'}
                        </div>
                        <Button
                          onClick={() => handleConfirmAction(msg.requiresConfirmation!)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <GitPullRequest className="w-4 h-4 mr-2" />
                          Confirm & Call GitHub API
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                </div>
              )}

              {reviewStatus === 'running' && messages.length <= 1 && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-2 text-muted-foreground text-xs font-mono">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {reviewMessage}
                  </div>
                </div>
              )}

              {reviewStatus === 'error' && (
                <div className="flex justify-start">
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2 text-destructive text-xs">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{reviewMessage}</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t border-border bg-card shrink-0">
              <div className="relative flex items-center">
                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight + 2, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim() && !isChatLoading) handleSend();
                      e.currentTarget.style.height = 'auto';
                    }
                  }}
                  placeholder="Ask about the architecture, request a fix..."
                  className="w-full bg-background border border-border rounded-md py-3 pl-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none max-h-40 overflow-y-auto disabled:opacity-50"
                  rows={1}
                  disabled={isChatLoading}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSend}
                  disabled={isChatLoading || !input.trim()}
                  className="absolute right-1 text-muted-foreground hover:text-blue-400 h-8 w-8"
                >
                  {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground mt-2 text-center">
                Context Envelope active · Answers grounded in indexed project facts
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border" />

        {/* Right: Tab Content */}
        <ResizablePanel defaultSize={65}>
          <Visibility visible={activeTab === 'pr_summary'}>
            <PRSummaryTab pr={pr} review={review} reviewStatus={reviewStatus} reviewMessage={reviewMessage} />
          </Visibility>
          <Visibility visible={activeTab === 'ai_review'}>
            <AIReviewTab
              setActiveTab={setActiveTab}
              issues={review?.issues || []}
              reviewStatus={reviewStatus}
              reviewMessage={reviewMessage}
            />
          </Visibility>
          <Visibility visible={activeTab === 'files'}>
            <FilesChangedTab diff={prDiff} isLoading={isLoadingDiff} />
          </Visibility>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
