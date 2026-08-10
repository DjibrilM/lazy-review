import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { PRSummaryTab } from '../components/PRSummaryTab';
import { AIReviewTab } from '../components/AIReviewTab';
import { FilesChangedTab } from '../components/FilesChangedTab';
import { PRReviewHeader } from '../components/PRReviewHeader';
import { AIChatSidebar } from '../components/AIChatSidebar';
import Visibility from '@/components/common/Visible';
import { useQuery } from '@tanstack/react-query';
import { projectService } from '@/services/project.service';
import { githubService } from '@/services/github.service';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';
import { useChat } from '../hooks/useChat';


type TabType = 'pr_summary' | 'ai_review' | 'files';


export function PRReview() {
  const { id, prId } = useParams();
  const [activeTab, setActiveTab] = useState<TabType>('pr_summary');
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);

  // Eager load models on mount, unload on unmount
  useEffect(() => {
    if (!id || reviewStatus === 'running') return;
    let mounted = true;
    setIsModelLoading(true);

    projectService.loadModels(id)
      .then(() => {
        if (mounted) setIsModelLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setIsModelLoading(false);
      });

    return () => {
      mounted = false;
      projectService.unloadModels(id).catch(err => console.error(err));
    };
  }, [id]);

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

  const pr = prs.find((p: { number: number;[key: string]: unknown }) => p.number === pullNumber);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [review, setReview] = useState<any>(null);
  const [reviewStatus, setReviewStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [reviewMessage, setReviewMessage] = useState('');
  const [selectedFileForDiff, setSelectedFileForDiff] = useState<string | null>(null);

  const {
    messages,
    setMessages,
    input,
    setInput,
    isChatLoading,
    handleSend,
    addSystemMessage,
  } = useChat(
    id,
    prDiff || null,
    owner,
    repoName,
    pullNumber,
    pr?.user?.login,
    pr?.additions,
    pr?.deletions,
    pr?.changed_files
  );

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Listen for socket events
  useSocketEffect({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onReviewProgress: useCallback((data: any) => {
      if (data.projectId && id && data.projectId !== id) return;
      if (data.status === 'running') {
        setReviewStatus('running');
        setReviewMessage(data.message || 'Generating review...');
      } else if (data.status === 'success') {
        setReviewStatus('success');
        setReview(data.review);
        setReviewMessage('');
        setActiveTab('ai_review');
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
    }, [id, setMessages]),
  });

  // Fetch existing review on mount
  const { data: initialReviewState } = useQuery({
    queryKey: ['review-state', id, pullNumber],
    queryFn: () => projectService.getReview(id as string, pullNumber),
    enabled: !!id && !!pullNumber,
  });

  useEffect(() => {
    if (initialReviewState) {
      setReviewStatus(initialReviewState.status);
      if (initialReviewState.review) setReview(initialReviewState.review);
      if (initialReviewState.message) setReviewMessage(initialReviewState.message);
    }
  }, [initialReviewState]);

  const changedFiles = useMemo(() => {
    if (!prDiff) return [];
    return prDiff
      .split('\n')
      .filter((line: string) => line.startsWith('+++ b/'))
      .map((line: string) => line.replace('+++ b/', '').trim());
  }, [prDiff]);

  const handleFileClick = useCallback((fileName: string) => {
    setSelectedFileForDiff(fileName);
    setActiveTab('files');
  }, []);

  const handleInitializeReview = async (reviewBody: string, event: string) => {
    if (!prDiff || !pr || !id) return console.log("Could not find the pull request");
    setReviewStatus('running');
    setReviewMessage('🔍 Starting review...');
    projectService
      .generateReview(id, {
        prDiff,
        prTitle: pr.title || '',
        prBody: pr.body || '',
        prNumber: pr.number,
      })
      .catch((err: unknown) => {
        setReviewStatus('error');
        setReviewMessage((err as Error).message || 'Review failed to start');
      });
  };


  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add initial system context message when PR data is ready
  useEffect(() => {
    if (pr && repo && messages.length === 0) {
      addSystemMessage(`Context loaded: PR #${pr.number} "${pr.title}" — ${commits.length} commit(s). AI review is generating...`);
    }
  }, [pr, repo, messages.length, addSystemMessage, commits.length]);

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
      await githubService.submitPRReview(owner, repoName, pr.number, reviewBody, event as 'REQUEST_CHANGES' | 'APPROVE');
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `✅ Successfully submitted "${event.replace('_', ' ')}" review to GitHub.`,
        },
      ]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'system',
          content: `⚠️ GitHub API error: ${(err as Error).message}`,
        },
      ]);
    }
  };

  const issueCount = review?.issues?.length ?? 0;

  return (
    <div className="flex-1 flex flex-col bg-background h-[calc(100vh-64px)] overflow-hidden relative">
      <PRReviewHeader
        repo={repo}
        pr={pr}
        commitsLength={commits.length}
        reviewStatus={reviewStatus}
        issueCount={issueCount}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        handleConfirmAction={handleConfirmAction}
      />

      {isModelLoading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-lg font-medium text-foreground">Loading AI Models...</p>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Models run locally for privacy and security. This may take a moment depending on your hardware.
          </p>
        </div>
      )}

      {/* Split Screen */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 w-full overflow-hidden">
        {/* Left: Chat */}
        <ResizablePanel defaultSize={30}>
          <AIChatSidebar
            messages={messages}
            setMessages={setMessages}
            input={input}
            setInput={setInput}
            isChatLoading={isChatLoading}
            handleSend={handleSend}
            reviewStatus={reviewStatus}
            reviewMessage={reviewMessage}
            chatEndRef={chatEndRef}
            handleConfirmAction={handleConfirmAction}
            changedFiles={changedFiles}
            onFileClick={handleFileClick}
          />
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
              setSelectedFileForDiff={setSelectedFileForDiff}
              issues={review?.issues || []}
              reviewStatus={reviewStatus}
              reviewMessage={reviewMessage}
              onInitializeReview={handleInitializeReview}
            />
          </Visibility>
          <Visibility visible={activeTab === 'files'}>
            <FilesChangedTab diff={prDiff} isLoading={isLoadingDiff} selectedFileForDiff={selectedFileForDiff} />
          </Visibility>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
