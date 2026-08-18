import { Book } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RepositoryCard } from '../components/RepositoryCard';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { RepoSelector } from '../components/RepoSelector';
import { projectService } from '@/services/project.service';
import type { GitHubRepository } from '@/interfaces/github-repo.interface';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from '@/components/vectors/PlusIcon';
import { CloneProgressDialog } from '../components/CloneProgressDialog';
import Visible from "@/components/common/Visible";

export function RepositoriesList() {
    const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
    const [isCloning, setIsCloning] = useState(false);
    const [cloningRepoName, setCloningRepoName] = useState('');

    const { data: projects = [], refetch } = useQuery({
        queryKey: ['local-projects'],
        queryFn: () => projectService.getProjects(),
    });

    const handleClone = async (repo: GitHubRepository) => {
        setIsCloneModalOpen(false); // Close the selector immediately
        setCloningRepoName(repo.name);
        setIsCloning(true); // Open the progress dialog

        try {
            await projectService.createProject({
                repository_name: repo.name,
                repository_url: repo.clone_url,
                owner: repo.owner.login,
            });
            toast.success(`Successfully cloned ${repo.name}`);
            refetch();
        } catch (err: any) {
            toast.error(err.message || 'Failed to clone repository');
            // We don't close the dialog here so the user can read the error logs in the terminal
        }
    };

    return (
        <div className="max-w-6xl mx-auto w-full p-6 lg:p-8 flex-1">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl text-foreground font-semibold flex items-center">
                    <Book className="w-6 h-6 mr-3 text-muted-foreground" />
                    Local Repositories
                </h1>
                <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => setIsCloneModalOpen(true)}
                >
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Clone Repository
                </Button>
            </div>

            <div className="flex flex-col gap-3">
                {projects.map((repo: any) => (
                    <RepositoryCard
                        key={repo.id}
                        repo={{
                            id: repo.id,
                            name: repo.name,
                            owner: repo.repository_url.split('/')[3] || 'unknown',
                            description: '',
                            updated: new Date(repo.updated_at).toLocaleDateString(),
                            lang: 'Mixed',
                            isPrivate: false,
                        }}
                        viewType="list"
                    />
                ))}
                <Visible visible={projects.length === 0}>
<div className="py-12 text-center text-muted-foreground font-mono text-sm border border-border rounded-md bg-card">
                        No local repositories found. Clone one to get started.
                    </div>
</Visible>
            </div>

            <Dialog open={isCloneModalOpen} onOpenChange={setIsCloneModalOpen}>
                <DialogContent className="sm:max-w-3xl h-[85vh] flex flex-col overflow-hidden">
                    <DialogTitle className="sr-only">Select Repository</DialogTitle>
                    <div className="flex-1 relative min-h-0 h-full flex flex-col">
                        <RepoSelector onSelect={handleClone} />
                    </div>
                </DialogContent>
            </Dialog>

            <CloneProgressDialog
                isOpen={isCloning}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsCloning(false);
                        setCloningRepoName('');
                    }
                }}
                repoName={cloningRepoName}
            />
        </div>
    );
}
