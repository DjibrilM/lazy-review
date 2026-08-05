import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, GitPullRequest, FileText, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PRList } from '../components/PRList';
import { CodebaseSummary } from '../components/CodebaseSummary';
import { AIReviewSessionDialog } from '../components/AIReviewSessionDialog';
import { useQuery } from '@tanstack/react-query';
import { projectService } from '@/services/project.service';
export function RepositoryDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [prToOpen, setPrToOpen] = useState(null);

  const { data: repo, isLoading } = useQuery({
    queryKey: ['local-project', id],
    queryFn: () => projectService.getProject(id as string),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 text-muted-foreground flex items-center justify-center"><Loader2 className="animate-spin mr-2" /> Loading repository...</div>;
  if (!repo) return <div className="p-8 text-muted-foreground">Repository not found</div>;

  const handleSelectPR = (pr: any) => {
    navigate(`/repo/${repo.id}/review/${pr.number}`);
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
          </div>

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
                <CodebaseSummary />
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
