import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Visible from '@/components/common/Visible';
import { useQuery } from '@tanstack/react-query';

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

type TabType = 'pr_summary' | 'ai_review' | 'files';
type ReviewStatus = 'idle' | 'running' | 'success' | 'error';

export function PRReview() {
    const { id, prId } = useParams();

    const [activeTab, setActiveTab] = useState<TabType>('pr_summary');
    const [isModelLoading, setIsModelLoading] = useState(true);
    const [modelLoadingMessage, setModelLoadingMessage] = useState(
        'Loading the models used for review and chat.',
    );
    const [review, setReview] = useState<any>(null);
    const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('idle');
    const [reviewMessage, setReviewMessage] = useState('');
    const [selectedFileForDiff, setSelectedFileForDiff] = useState<string | null>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);

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

    const pr = prs.find(
        (pullRequest: { number: number;[key: string]: unknown }) =>
            pullRequest.number === pullNumber,
    );

    const { data: commits = [], isLoading: isLoadingCommits } = useQuery({
        queryKey: ['pr-commits', owner, repoName, pullNumber],
        queryFn: () => githubService.getPRCommits(owner, repoName, pullNumber),
        enabled: !!owner && !!repoName && !!pullNumber,
    });

    const { data: prDiff = '', isLoading: isLoadingDiff } = useQuery({
        queryKey: ['pr-diff', owner, repoName, pullNumber],
        queryFn: () => githubService.getPRDiff(owner, repoName, pullNumber),
        enabled: !!owner && !!repoName && !!pullNumber,
    });

    useEffect(() => {
        if (!id || !pullNumber || !prDiff) return;

        let mounted = true;
        setIsModelLoading(true);
        setModelLoadingMessage('Loading AI models…');

        projectService
            .startPRSession(id, pullNumber, prDiff)
            .then(() => {
                if (mounted) setIsModelLoading(false);
            })
            .catch((error) => {
                console.error('Failed to start PR review session:', error);
                if (mounted) {
                    setModelLoadingMessage(
                        (error as Error).message || 'Failed to initialize local AI session.',
                    );
                    setIsModelLoading(false);
                }
            });

        return () => {
            mounted = false;
            projectService.stopPRSession(id, pullNumber).catch((error) => {
                console.error('Failed to stop PR review session:', error);
            });
        };
    }, [id, pullNumber, prDiff]);

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

    const handleInitializeReview = async () => {
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
        if (!pr || !repo || messages.length > 0 || isLoadingCommits || isLoadingDiff) return;

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
        isLoadingDiff,
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

            <Visible visible={isModelLoading}>
<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/75 backdrop-blur-[1px]">
                    <div className="flex min-w-[280px] items-center gap-3 rounded-md border border-border bg-card px-4 py-3 shadow-lg">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />

                        <div>
                            <p className="text-xs font-medium text-foreground">
                                Starting local AI
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {modelLoadingMessage}
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
                            isLoading={isLoadingDiff}
                            selectedFileForDiff={selectedFileForDiff}
                            onDiffScrolled={() => setSelectedFileForDiff(null)}
                        />
                    </Visibility>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
