import { useState, useEffect, useRef } from 'react';
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
import { cn } from '@/lib/util/shared';

const MOCK_COMMITS = [
  {
    id: '410ce1c',
    message: 'feat: implement the referral program',
    author: 'alice-dev',
    time: '10 hours ago',
  },
  {
    id: '5f23b9d',
    message: 'feat: enhance referral program and UI components',
    author: 'alice-dev',
    time: '39 minutes ago',
  },
  {
    id: '32b39cf',
    message: 'refactor: update styling for InviteBenefitsCard',
    author: 'alice-dev',
    time: '37 minutes ago',
  },
  {
    id: 'da37aeb',
    message: 'refactor: remove unused icon from InvitePage',
    author: 'alice-dev',
    time: '36 minutes ago',
  },
];

type TabType = 'pr_summary' | 'ai_review' | 'files';

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

  const { data: prs = [], isLoading: isLoadingPrs } = useQuery({
    queryKey: ['pull-requests', owner, repoName],
    queryFn: () => githubService.getPullRequests(owner, repoName),
    enabled: !!owner && !!repoName,
  });

  const pr = prs.find((p: any) => p.number === Number(prId));

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pr && repo && messages.length === 0) {
      setMessages([
        {
          id: 1,
          role: 'system',
          content: `Initialized Context Envelope: Analyzed PR #${pr.number} diff against ${repo.name} vector DB.`,
        },
        {
          id: 2,
          role: 'assistant',
          content: `I have reviewed PR #${pr.number}. It refactors the \`authenticate\` function.\n\n**Architectural Warning:** The new implementation concatenates strings for the SQL query, which violates our convention defined in the Architectural Manifest and introduces a SQL injection vulnerability.`,
        },
      ]);
    }
  }, [pr, repo, messages.length]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoadingRepo || isLoadingPrs) return <div className="p-8 text-muted-foreground">Loading PR...</div>;
  if (!repo || !pr) return <div className="p-8 text-muted-foreground">Repository or PR not found.</div>;

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg = { id: Date.now(), role: 'user', content: input };
    setMessages((prev) => [...prev, newMsg]);

    const userText = input.toLowerCase();
    setInput('');

    setTimeout(() => {
      if (
        userText.includes('request change') ||
        userText.includes('request the change') ||
        userText.includes('reject')
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: `I have drafted the formal change request based on our discussion, targeting lines 10-20 to require parameterized queries.\n\nShall I execute the GitHub API call to submit this review?`,
            requiresConfirmation: 'request_changes',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: `Yes, to fix this we should use parameterized queries. You can ask me to "request these changes", and I will draft the GitHub API payload for you.`,
          },
        ]);
      }
    }, 1000);
  };

  const handleConfirmAction = (_actionType: string) => {
    const loadingId = Date.now();
    setMessages((prev) => [
      ...prev,
      {
        id: loadingId,
        role: 'system',
        content: `Executing POST /repos/${repo.owner}/${repo.name}/pulls/${pr.number}/reviews...`,
      },
    ]);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `✅ Successfully submitted the "Request Changes" review to GitHub.`,
        },
      ]);
    }, 1500);
  };

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
                  wants to merge {MOCK_COMMITS.length} commits into
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
            >
              <X className="w-4 h-4 mr-2" />
              Request Changes
            </Button>
            <Button className="bg-[#238636] hover:bg-[#2ea043] text-white" size="sm">
              <Check className="w-4 h-4 mr-2" />
              Merge pull request
            </Button>
          </div>
        </div>

        {/* Custom AI-First Tabs Row */}
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
            <Bot className="w-4 h-4 mr-2" /> AI Review & Suggestions
            <span className="ml-2 bg-red-500/10 text-red-500 rounded-full px-2 py-0.5 text-xs font-semibold">
              1 Issue
            </span>
          </div>
          <div
            onClick={() => setActiveTab('files')}
            className={cn(
              'pb-3 border-b-2 cursor-pointer flex items-center text-sm transition-colors',
              activeTab === 'files' ? 'border-[#f78166] text-foreground font-semibold' : 'border-transparent text-muted-foreground font-medium hover:text-foreground'
            )}
          >
            <Code className="w-4 h-4 mr-2" /> Files changed
            <span className="ml-2 bg-muted rounded-full px-2 py-0.5 text-xs font-semibold">28</span>
          </div>
        </div>
      </div>

      {/* Split Screen Container */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 w-full overflow-hidden">
        {/* Left Side: Chat UI */}
        <ResizablePanel defaultSize={30}>
          <div className="bg-background flex flex-col z-10 shadow-lg relative h-full w-full min-w-[300px]">
            <div className="px-4 py-2 border-b border-border bg-card shrink-0 flex items-center space-x-2">
              <MessageSquareMore className="w-4 h-4 text-white/90" />
              <span className="font-semibold text-[13px] text-foreground">
                Interactive Review Architect
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
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

                    {msg.requiresConfirmation === 'request_changes' && (
                      <div className="mt-3 p-3 bg-background border border-border rounded-md shadow-inner">
                        <div className="text-xs text-muted-foreground font-mono mb-2 flex items-center">
                          <Code className="w-3.5 h-3.5 mr-1" />
                          Payload Preview: REQUEST_CHANGES
                        </div>
                        <Button
                          onClick={() => handleConfirmAction(msg.requiresConfirmation)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <GitPullRequest className="w-4 h-4 mr-2" />
                          Confirm & Call API
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
                      if (input.trim()) handleSend();
                      e.currentTarget.style.height = 'auto';
                    }
                  }}
                  placeholder="Ask about the architecture, request a fix..."
                  className="w-full bg-background border border-border rounded-md py-3 pl-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none max-h-40 overflow-y-auto"
                  rows={1}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSend}
                  className="absolute right-1 text-muted-foreground hover:text-blue-400 h-8 w-8"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground mt-2 text-center">
                Context Envelope active. Answers based on local Fact Base.
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border" />

        {/* Right Side: Tab Content */}
        <ResizablePanel defaultSize={65}>
          <Visibility visible={activeTab === 'pr_summary'}>
            <PRSummaryTab />
          </Visibility>
          <Visibility visible={activeTab === 'ai_review'}>
            <AIReviewTab setActiveTab={setActiveTab} />
          </Visibility>
          <Visibility visible={activeTab === 'files'}>
            <FilesChangedTab />
          </Visibility>


        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
