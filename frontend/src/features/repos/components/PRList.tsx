import { GitPullRequest, Check, MessageSquare, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { githubService } from '@/services/github.service';
import { cn } from '@/lib/util/shared';

export function PRList({ onSelectPR, owner, repoName }: { onSelectPR: (pr: any) => void; owner: string; repoName: string }) {
  const { data: prs = [], isLoading, isError } = useQuery({
    queryKey: ['pull-requests', owner, repoName],
    queryFn: () => githubService.getPullRequests(owner, repoName),
    enabled: !!owner && !!repoName,
  });

  const openCount = prs.filter((pr: any) => pr.state === 'open').length;
  const closedCount = prs.filter((pr: any) => pr.state === 'closed').length;

  if (isLoading) {
    return <div className="p-8 text-muted-foreground flex items-center justify-center"><Loader2 className="animate-spin mr-2" /> Fetching pull requests...</div>;
  }

  if (isError) {
    return <div className="p-8 text-red-500 flex items-center justify-center">Failed to fetch pull requests.</div>;
  }
  return (
    <div className="border border-[#30363d] rounded-md bg-[#161b22] overflow-hidden shadow-sm">
      <div className="bg-[#161b22] px-4 py-3 border-b border-[#30363d] flex items-center justify-between text-sm font-semibold">
        <div className="flex items-center space-x-4">
          <span className="text-white flex items-center"><GitPullRequest className="w-4 h-4 mr-2" /> {openCount} Open</span>
          <span className="text-[#8b949e] font-normal hover:text-white cursor-pointer"><Check className="w-4 h-4 inline mr-1" /> {closedCount} Closed</span>
        </div>
      </div>
      <div className="divide-y divide-[#30363d]">
        {prs.map((pr: any) => (
          <div 
            key={pr.id} 
            onClick={() => onSelectPR(pr)}
            className="px-4 py-3 flex items-start space-x-3 bg-[#0d1117] hover:bg-[#161b22] transition-colors cursor-pointer group"
          >
            <GitPullRequest className={cn('w-5 h-5 mt-0.5', pr.state === 'open' ? 'text-[#3fb950]' : 'text-[#a371f7]')} />
            <div className="flex-1">
              <div className="text-base text-white font-semibold group-hover:text-[#58a6ff] transition-colors">
                {pr.title}
              </div>
              <div className="text-xs text-[#8b949e] mt-1">
                #{pr.number} opened {new Date(pr.created_at).toLocaleDateString()} by <span className="hover:text-[#58a6ff] cursor-pointer">{pr.user?.login}</span>
              </div>
            </div>
            {pr.comments > 0 && (
              <div className="flex items-center text-xs text-[#8b949e] space-x-1">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{pr.comments}</span>
              </div>
            )}
          </div>
        ))}
        {prs.length === 0 && (
          <div className="p-8 text-muted-foreground text-center">No pull requests found.</div>
        )}
      </div>
    </div>
  );
}
