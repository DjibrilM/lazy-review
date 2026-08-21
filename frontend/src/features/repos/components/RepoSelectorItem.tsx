import { Globe, Lock, Star, HardDrive } from 'lucide-react';
import Visible from '@/components/common/Visible';
import { LanguageBar } from './LanguageBar';
import type { GitHubRepository } from '@/interfaces/github-repo.interface';

interface RepoSelectorItemProps {
    repo: GitHubRepository;
    onSelect: (repo: GitHubRepository) => void;
    setSelectedUserLogin: (login: string) => void;
    lastElementRef?: (node: HTMLDivElement | null) => void;
}

export const RepoSelectorItem = ({
    repo,
    onSelect,
    setSelectedUserLogin,
    lastElementRef,
}: RepoSelectorItemProps) => {
    const formatSize = (kb: number) => {
        if (kb > 1024) return `${(kb / 1024).toFixed(1)} MB`;
        return `${kb} KB`;
    };

    const formatDate = (dateString: string) => {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).format(new Date(dateString));
    };

    return (
        <div
            ref={lastElementRef}
            onClick={() => onSelect(repo)}
            className="group cursor-pointer border border-border bg-card px-4 py-3 transition-all hover:border-primary hover:shadow-sm rounded-md flex items-center justify-between gap-4"
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <Visible
                        visible={!!repo.owner?.avatar_url}
                        fallback={
                            !repo.private ? (
                                <Globe
                                    size={14}
                                    className="text-emerald-500 shrink-0"
                                />
                            ) : null
                        }
                    >
                        <img
                            src={repo.owner?.avatar_url}
                            alt={repo.owner?.login}
                            title={`View ${repo.owner?.login}'s profile`}
                            className="w-5 h-5 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-primary transition-all shrink-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (repo.owner?.login) {
                                    setSelectedUserLogin(repo.owner.login);
                                }
                            }}
                        />
                    </Visible>

                    <Visible visible={!!repo.private}>
                        <Lock
                            size={14}
                            className="text-amber-500 shrink-0"
                        />
                    </Visible>
                    <h4 className="font-mono text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                        {repo.name}
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent border border-border text-muted-foreground shrink-0 hidden sm:inline-flex">
                        {repo.default_branch}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-muted-foreground">
                    <LanguageBar url={repo.languages_url} primary={repo.language} />
                    <span className="flex items-center gap-1" title="Stars">
                        <Star size={12} /> {repo.stargazers_count}
                    </span>
                    <span className="items-center gap-1 hidden sm:flex" title="Repository Size">
                        <HardDrive size={12} /> {formatSize(repo.size)}
                    </span>
                    <span className="text-[10px] text-muted-foreground hidden md:inline">
                        Updated {formatDate(repo.updated_at)}
                    </span>
                </div>
            </div>

            <button className="shrink-0 bg-primary text-primary-foreground px-4 py-1.5 text-xs font-mono font-medium hover:bg-primary/90 transition-colors rounded-sm opacity-0 group-hover:opacity-100 focus:opacity-100">
                Clone
            </button>
        </div>
    );
};
