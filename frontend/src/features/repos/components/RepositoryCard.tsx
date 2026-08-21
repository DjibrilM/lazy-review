import { ExternalLink, GitBranch, Terminal, Code2, Cloud, Clock } from 'lucide-react';
import { cn } from '@/lib/util/shared';
import { useNavigate } from 'react-router-dom';
import { useSetup } from '@/components/providers/SetupProvider';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Visible from "@/components/common/Visible";

export interface Repo {
    id: number;
    name: string;
    owner: string;
    description: string;
    updated: string;
    lang: string;
    isPrivate: boolean;
}

interface RepositoryCardProps {
    repo: Repo;
    viewType?: 'card' | 'list';
}

export const RepositoryCard = ({ repo, viewType = 'card' }: RepositoryCardProps) => {
    const isList = viewType === 'card' ? false : true;
    const navigate = useNavigate();
    const { isSetupComplete } = useSetup();
    const [showSetupWarning, setShowSetupWarning] = useState(false);

    useEffect(() => {
        if (isSetupComplete && showSetupWarning) {
            setShowSetupWarning(false);
        }
    }, [isSetupComplete, showSetupWarning]);

    const handleOpen = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!isSetupComplete) {
            setShowSetupWarning(true);
            return;
        }
        navigate(`/repo/${repo.id}`);
    };

    return (
        <>
            <div
                onClick={() => handleOpen()}
                className={cn(
                    'group cursor-pointer border border-border bg-card transition-all hover:border-primary hover:shadow-sm rounded-md',
                    isList ? 'px-4 py-3 flex items-center justify-between gap-4' : 'p-5 flex flex-col h-full',
                )}
            >
                <div
                    className={cn('flex-1 min-w-0', isList ? 'flex items-center gap-4' : 'flex flex-col mb-4')}
                >
                    <div className={cn('flex items-center gap-2', isList ? '' : 'mb-1')}>
                        <div className="w-5 bg-white/10 h-5 border border-border rounded-md overflow-hidden">
                            <img src={`https://github.com/${repo.owner}.png`} alt={repo.owner} className="w-full h-full object-cover" />
                        </div>
                        <h3 className="font-mono text-base font-bold text-foreground group-hover:text-primary transition-colors truncate">
                            {repo.owner}/{repo.name}
                        </h3>
                        <span
                            className={cn(
                                'text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 transition-all duration-300',
                                !repo.isPrivate
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.05)]'
                                    : 'bg-accent border-border text-muted-foreground',
                            )}
                        >
                            <Visible visible={repo.isPrivate} fallback={'Public'}>
                                'Private'
                            </Visible>
                        </span>
                    </div>

                    <Visible visible={!isList}>
                        <p className="text-sm text-muted-foreground mt-2 mb-2 line-clamp-2">
                            {repo.description}
                        </p>
                    </Visible>

                    <div
                        className={cn(
                            'flex flex-wrap items-center gap-3 text-[11px] font-mono text-muted-foreground',
                            isList ? '' : 'mt-auto',
                        )}
                    >
                        <a
                            href={`https://github.com/${repo.owner}/${repo.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-foreground transition-colors flex items-center gap-1 group/link"
                        >
                            github.com
                            <ExternalLink
                                size={10}
                                className="opacity-0 transition-opacity group-hover/link:opacity-100"
                            />
                        </a>

                        <span className="flex items-center gap-1">
                            <Code2 size={12} /> {repo.lang}
                        </span>

                        <span className="flex items-center gap-1" title="Owner">
                            <Cloud size={12} /> {repo.owner}
                        </span>
                    </div>
                </div>

                <div
                    className={cn(
                        'flex items-center justify-between text-xs font-mono text-muted-foreground',
                        isList ? 'shrink-0 gap-6' : 'mt-4 pt-4 border-t border-border',
                    )}
                >
                    <div className={cn('flex items-center', isList ? 'gap-6' : 'justify-between w-full')}>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-sm">
                                <GitBranch size={12} />
                                <span className="truncate max-w-[100px]">main</span>
                            </div>
                            <span className="flex items-center gap-1">
                                <Clock size={12} /> {repo.updated}
                            </span>
                        </div>

                        <div className="flex items-center justify-end">
                            <button
                                onClick={(e) => handleOpen(e)}
                                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border p-1.5 bg-transparent hover:bg-accent rounded-sm"
                                title="Open AI Review Workspace"
                            >
                                <Terminal size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={showSetupWarning} onOpenChange={setShowSetupWarning}>
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>Setup Required</DialogTitle>
                    <DialogDescription className="py-2">
                        You must complete the AI model setup before you can open a repository. Please go to Settings to download the required local models. Once the download is complete, the frontend will automatically unlock.
                    </DialogDescription>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSetupWarning(false)}>Cancel</Button>
                        <Button onClick={() => { setShowSetupWarning(false); navigate('/settings'); }}>Go to Settings</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
