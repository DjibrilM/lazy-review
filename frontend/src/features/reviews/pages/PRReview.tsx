import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, Loader2 } from 'lucide-react';
import Visible from '@/components/common/Visible';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable';
import Visibility from '@/components/common/Visible';
import { projectService } from '@/services/project.service';
import { githubService } from '@/services/github.service';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';

import { PRSummaryTab } from '../components/PRSummaryTab';
import { AIReviewTab } from '../components/AIReviewTab';
import { FilesChangedTab } from '../components/FilesChangedTab';
import { PRReviewHeader } from '../components/PRReviewHeader';
import { AIChatSidebar } from '../components/AIChatSidebar';
import { useChat } from '../hooks/useChat';
import { hasCompletedIndex } from '../../repos/utils/repo-utils';

type TabType = 'pr_summary' | 'ai_review' | 'files';
type ReviewStatus = 'idle' | 'running' | 'success' | 'error';

export function PRReview() {
    const { id, prId } = useParams();

    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<TabType>('pr_summary');
    const [isModelLoading, setIsModelLoading] = useState(true);
    const [modelLoadingMessage, setModelLoadingMessage] = useState(
        'Loading the models used for review and chat.',
    );
    const [sessionInitError, setSessionInitError] = useState<string | null>(null);
    const [modelLoadingSeconds, setModelLoadingSeconds] = useState(0);
    const [review, setReview] = useState<any>(null);
    const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('idle');
    const [reviewMessage, setReviewMessage] = useState('');
    const [selectedFileForDiff, setSelectedFileForDiff] = useState<string | null>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);

    const { data: repo, isLoading: isLoadingRepo, refetch: refetchRepo } = useQuery({
        queryKey: ['local-project', id],
        queryFn: () => projectService.getProject(id as string),
        enabled: !!id,
    });

    const owner = repo?.repository_url?.split('/')[3] || '';
    const repoName = repo?.name || '';
    const pullNumber = Number(prId);

    // Dynamic review access gate: the review experience is only reachable after
    // the repository has completed at least one indexing pass. The repo query is
    // invalidated by IndexingGlobalListener when indexing finishes, so `isIndexed`
    // flips true and this page unlocks automatically (no reload needed).
    const isIndexed = hasCompletedIndex(repo);
    const isIndexing = repo?.current_task === 'indexing';

    const { data: prs = [], isLoading: isLoadingPrs } = useQuery({
        queryKey: ['pull-requests', owner, repoName],
        queryFn: () => githubService.getPullRequests(owner, repoName),
        enabled: !!owner && !!repoName,
    });

    const pr = prs.find(
        (pullRequest: { number: number;[key: string]: unknown }) =>
            pullRequest.number === pullNumber,
    );

    const { data: commits = [], isLoading: isLoadingCommits } = useQuery({
        queryKey: ['pr-commits', owner, repoName, pullNumber],
        queryFn: () => githubService.getPRCommits(owner, repoName, pullNumber),
        enabled: !!owner && !!repoName && !!pullNumber,
    });

    const { data: prDiff = '', isFetching: isFetchingDiff, isError: isDiffError, refetch: refetchDiff } = useQuery({
        queryKey: ['pr-diff', owner, repoName, pullNumber],
        queryFn: () => githubService.getPRDiff(owner, repoName, pullNumber),
        enabled: !!owner && !!repoName && !!pullNumber,
        retry: false,
    });

    const initSession = useCallback(async (currentPrDiff: string) => {
        let mounted = true;

        const SESSION_START_TIMEOUT_MS = 2 * 60 * 1000;
        setSessionInitError(null);
        setIsModelLoading(true);
        setModelLoadingMessage('Loading AI models…');

        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const beginTimer = () => {
            timeoutId = setTimeout(() => {
                if (!mounted) return;
                setIsModelLoading(false);
                setSessionInitError('Starting the AI session timed out. Please try again.');
            }, SESSION_START_TIMEOUT_MS);
        };
        beginTimer();

        try {
            await projectService.startPRSession(id as string, pullNumber, currentPrDiff);
            if (!mounted) return;
            clearTimeout(timeoutId);
            setIsModelLoading(false);
        } catch (error: unknown) {
            console.error('Failed to start PR review session:', error);
            if (!mounted) return;
            clearTimeout(timeoutId);

            const details = (error as { details?: { code?: string } })?.details;
            if (details?.code === 'INDEX_REQUIRED') {
                setIsModelLoading(false);
                void refetchRepo();
                return;
            }

            setIsModelLoading(false);
            setSessionInitError(
                (error as Error | undefined)?.message || 'Failed to initialize the local AI session.',
            );
        }

        return () => {
            mounted = false;
            if (timeoutId) clearTimeout(timeoutId);
            projectService.stopPRSession(id as string, pullNumber).catch((error) => {
                console.error('Failed to stop PR review session:', error);
            });
        };
    }, [id, pullNumber, refetchRepo]);

    useEffect(() => {
        if (!id || !pullNumber || !isIndexed) return;

        if (isFetchingDiff && !prDiff) {
            setSessionInitError(null);
            setIsModelLoading(true);
            setModelLoadingMessage('Fetching the pull request diff…');
            return;
        }

        if (!prDiff) {
            setIsModelLoading(false);
            setSessionInitError(
                isDiffError
                    ? 'Could not fetch the PR diff from GitHub. It may exceed GitHub\u2019s size limit for a single diff request.'
                    : 'This pull request has no loadable diff. Please select a different pull request.',
            );
            return;
        }

        const cleanup = initSession(prDiff);
        return () => {
            cleanup.then(fn => fn?.());
        };
    }, [id, pullNumber, prDiff, isIndexed, isFetchingDiff, isDiffError, initSession]);

    useSocketEffect({
        onModelProgress: useCallback(
            (data: { projectId?: string; pullNumber?: number; message?: string }) => {
                if (data.projectId && id && data.projectId !== id) return;
                if (data.pullNumber !== undefined && data.pullNumber !== pullNumber) return;
                if (data.message) {
                    setModelLoadingMessage(data.message);
                }
            },
            [id, pullNumber],
        ),
    });

    // Ticker so the "loading models into memory" overlay visibly progresses
    // (first cold load of the 6GB+ LLM can take a while).
    useEffect(() => {
        if (!isModelLoading) {
            setModelLoadingSeconds(0);
            return;
        }
        const interval = setInterval(() => setModelLoadingSeconds((s) => s + 1), 1000);
        return () => clearInterval(interval);
    }, [isModelLoading]);

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
        pr?.changed_files,
    );

    useSocketEffect({
        onReviewProgress: useCallback(
            (data: any) => {
                if (data.projectId && id && data.projectId !== id) return;

                if (data.status === 'running') {
                    setReviewStatus('running');
                    setReviewMessage(data.message || 'Reviewing pull request…');
                    return;
                }

                if (data.status === 'success') {
                    setReviewStatus('success');
                    setReview(data.review);
                    setReviewMessage('');
                    setActiveTab('ai_review');

                    setMessages((prev) => {
                        const alreadyAdded = prev.some(
                            (message) =>
                                message.role === 'system' &&
                                message.content.includes('Review complete'),
                        );

                        if (alreadyAdded) return prev;

                        return [
                            ...prev,
                            {
                                id: Date.now(),
                                role: 'system',
                                content: `Review complete · ${data.review?.issues?.length ?? 0} finding(s).`,
                            },
                        ];
                    });

                    return;
                }

                if (data.status === 'error') {
                    setReviewStatus('error');
                    setReviewMessage(data.message || 'Review generation failed.');
                }
            },
            [id, setMessages],
        ),
    });

    const { data: initialReviewState } = useQuery({
        queryKey: ['review-state', id, pullNumber],
        queryFn: () => projectService.getReview(id as string, pullNumber),
        enabled: !!id && !!pullNumber,
    });

    useEffect(() => {
        if (!initialReviewState) return;

        setReviewStatus(initialReviewState.status);

        if (initialReviewState.review) {
            setReview(initialReviewState.review);
        }

        if (initialReviewState.message) {
            setReviewMessage(initialReviewState.message);
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

    const handleRetrySessionInit = useCallback(async () => {
        setSessionInitError(null);
        setIsModelLoading(true);
        setModelLoadingMessage('Retrying…');
        const result = await refetchDiff();
        
        if (result.isError) {
            setIsModelLoading(false);
            setSessionInitError('Could not fetch the PR diff from GitHub. It may exceed GitHub’s size limit for a single diff request.');
            return;
        }
        
        if (!result.data) {
            setIsModelLoading(false);
            setSessionInitError('This pull request has no loadable diff. Please select a different pull request.');
            return;
        }
        
        initSession(result.data);
    }, [refetchDiff, initSession]);

    const handleInitializeReview = async () => {
        // Dynamic gate mirrors the backend: no completed index → no review.
        if (!hasCompletedIndex(repo)) {
            setReviewStatus('error');
            setReviewMessage(
                isIndexing
                    ? 'AI review is unavailable while indexing is still running. Please wait for it to finish.'
                    : 'AI review requires at least one completed index for this repository.',
            );
            return;
        }

        if (!prDiff || !pr || !id) {
            setReviewStatus('error');
            setReviewMessage('Pull request data is not ready yet.');
            return;
        }

        setReviewStatus('running');
        setReviewMessage('Starting review…');

        projectService
            .generateReview(id, {
                prDiff,
                prTitle: pr.title || '',
                prBody: pr.body || '',
                prNumber: pr.number,
            })
            .catch((error: unknown) => {
                setReviewStatus('error');
                setReviewMessage(
                    (error as Error).message || 'Review failed to start.',
                );
            });
    };

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!pr || !repo || messages.length > 0 || isLoadingCommits || isFetchingDiff) return;

        const fileCount = pr.changed_files ?? changedFiles.length;

        addSystemMessage(
            `PR #${pr.number} loaded · ${commits.length} commit${commits.length === 1 ? '' : 's'} · ${fileCount} file${fileCount === 1 ? '' : 's'} changed.`,
        );
    }, [
        pr,
        repo,
        messages.length,
        addSystemMessage,
        commits.length,
        changedFiles.length,
        isLoadingCommits,
        isFetchingDiff,
    ]);

    if (isLoadingRepo || isLoadingPrs) {
        return (
            <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-background">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading pull request…
                </div>
            </div>
        );
    }

    if (!repo || !pr) {
        return (
            <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-background">
                <div className="rounded-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                    Pull request not found.
                </div>
            </div>
        );
    }

    // ─ Index access gate ──────────────────────────────────────────────
    // The review experience is only reachable once the repository has at
    // least one completed index. This page unlocks automatically when
    // indexing finishes (the repo query is invalidated via socket events).
    if (!isIndexed) {
        return (
            <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-background px-4">
                <div className="w-full max-w-md rounded-md border border-border bg-card px-5 py-7 text-center shadow-sm">
                    {isIndexing ? (
                        <>
                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                            <h2 className="mt-3 text-sm font-semibold text-foreground">
                                Indexing in progress
                            </h2>
                            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                                AI reviews are locked until this repository has been indexed at
                                least once. Indexing is still running — this page unlocks
                                automatically as soon as it completes, no refresh needed.
                            </p>
                        </>
                    ) : (
                        <>
                            <Bot className="mx-auto h-6 w-6 text-muted-foreground" />
                            <h2 className="mt-3 text-sm font-semibold text-foreground">
                                This repository is not indexed yet
                            </h2>
                            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                                AI reviews require at least one completed index. Go back to the
                                repository, start indexing, and this review experience unlocks
                                automatically once it finishes.
                            </p>
                            <Button onClick={() => navigate(`/repo/${id}`)} className="mt-5">
                                Back to repository
                            </Button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    const issueCount = review?.issues?.length ?? 0;

    return (
        <div className="relative flex h-[calc(100vh-64px)] flex-1 flex-col overflow-hidden bg-background">
            <PRReviewHeader
                repo={repo}
                pr={pr}
                commitsLength={commits.length}
                reviewStatus={reviewStatus}
                issueCount={issueCount}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
            />

            <Visible visible={!!sessionInitError}>
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/75 backdrop-blur-[1px]">
                    <div className="flex w-full max-w-md flex-col gap-3 rounded-md border border-destructive/30 bg-card px-5 py-5 shadow-lg">
                        <div className="flex items-start gap-3">
                            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                            <div>
                                <p className="text-xs font-medium text-foreground">
                                    Couldn’t start the AI session
                                </p>
                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                    {sessionInitError}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={handleRetrySessionInit}
                            >
                                Retry
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/repo/${id}`)}
                            >
                                Back to repository
                            </Button>
                        </div>
                    </div>
                </div>
            </Visible>

            <Visible visible={isModelLoading}>
<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/75 backdrop-blur-[1px]">
                    <div className="flex min-w-[280px] items-center gap-3 rounded-md border border-border bg-card px-4 py-3 shadow-lg">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />

                        <div>
                            <p className="text-xs font-medium text-foreground">
                                Starting local AI
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {modelLoadingMessage} {modelLoadingSeconds > 0 ? `· ${modelLoadingSeconds}s` : ''}
                            </p>
                        </div>
                    </div>
                </div>
</Visible>

            <ResizablePanelGroup
                orientation="horizontal"
                className="flex-1 w-full overflow-hidden"
            >
                <ResizablePanel defaultSize={32} minSize={24}>
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
                        changedFiles={changedFiles}
                        onFileClick={handleFileClick}
                    />
                </ResizablePanel>

                <ResizableHandle className="bg-border/80" />

                <ResizablePanel defaultSize={68} minSize={42}>
                    <Visibility visible={activeTab === 'pr_summary'}>
                        <PRSummaryTab
                            pr={pr}
                            review={review}
                            reviewStatus={reviewStatus}
                            reviewMessage={reviewMessage}
                        />
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
                        <FilesChangedTab
                            diff={prDiff}
                            isLoading={isFetchingDiff}
                            selectedFileForDiff={selectedFileForDiff}
                            onDiffScrolled={() => setSelectedFileForDiff(null)}
                        />
                    </Visibility>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
