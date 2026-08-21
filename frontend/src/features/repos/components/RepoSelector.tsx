import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import type { GitHubRepository } from '@/interfaces/github-repo.interface';
import { githubService } from '@/services/github.service';
import Visible from '@/components/common/Visible';
import { RepoPagination } from './RepoPagination';
import { RepoSelectorItem } from './RepoSelectorItem';
import { RepoUserProfileDialog } from './RepoUserProfileDialog';

interface RepoSelectorProps {
    onSelect: (repo: GitHubRepository) => void;
}

export const RepoSelector = ({ onSelect }: RepoSelectorProps) => {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedUserLogin, setSelectedUserLogin] = useState<string | null>(null);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1); // Reset page on new search
        }, 400);
        return () => clearTimeout(handler);
    }, [search]);

    // Infinite Scroll logic for list view (when no search)
    const {
        data: listData,
        isLoading: isListLoading,
        isError: isListError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['github-repositories-list'],
        queryFn: ({ pageParam }) => githubService.getListRepositories(pageParam as number),
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.items.length === 100 ? allPages.length + 1 : undefined;
        },
        enabled: !debouncedSearch,
    });

    // Pagination logic for search view
    const {
        data: searchData,
        isLoading: isSearchLoading,
        isError: isSearchError,
    } = useQuery({
        queryKey: ['github-repositories-search', page, debouncedSearch],
        queryFn: () => githubService.searchRepositories(page, debouncedSearch),
        enabled: !!debouncedSearch,
    });

    // Intersection Observer for infinite scrolling trigger
    const observer = useRef<IntersectionObserver | null>(null);
    const lastRepoElementRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (isListLoading || isFetchingNextPage) return;
            if (observer.current) observer.current.disconnect();
            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasNextPage) {
                    fetchNextPage();
                }
            });
            if (node) observer.current.observe(node);
        },
        [isListLoading, isFetchingNextPage, hasNextPage, fetchNextPage],
    );

    const isLoading = debouncedSearch ? isSearchLoading : isListLoading;
    const isError = debouncedSearch ? isSearchError : isListError;

    const repos = debouncedSearch
        ? searchData?.items || []
        : listData?.pages.flatMap((p) => p.items) || [];

    const totalCount = debouncedSearch ? searchData?.totalCount || 0 : 0;
    const isLastPage = page * 100 >= totalCount || (debouncedSearch && repos.length === 0);
    const maxPages = Math.max(1, Math.ceil(totalCount / 100));

    return (
        <div className="flex flex-col h-full space-y-4 animate-in fade-in">
            <div className="shrink-0 mb-2 font-mono flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border shadow-sm pb-4 sticky">
                <div className="space-y-4 flex-1">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Select Repository</h2>
                        <p className="text-[12px] my-1 text-muted-foreground ">
                            Choose a GitHub repository to clone.
                        </p>
                    </div>

                    <div className="relative max-w-md">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            size={16}
                        />
                        <input
                            type="text"
                            value={search}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                            placeholder="Search repositories..."
                            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm outline-none transition-colors"
                        />
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 pb-4 space-y-4 pr-2">
                <Visible visible={isLoading && repos.length === 0}>
                    <div className="py-20 flex flex-col items-center justify-center text-muted-foreground font-mono space-y-4">
                        <Loader2 className="animate-spin" size={32} />
                        <p className="text-sm">Fetching repositories...</p>
                    </div>
                </Visible>

                <Visible visible={isError && !isLoading}>
                    <div className="py-12 text-center text-red-500 font-mono text-sm border border-red-500/20 bg-red-500/10 rounded-md">
                        Failed to load repositories. Is your backend running and authenticated?
                    </div>
                </Visible>

                <Visible visible={!isLoading && !isError && repos.length === 0}>
                    <div className="py-12 text-center text-muted-foreground font-mono text-sm border border-border rounded-md bg-card">
                        No repositories found.
                    </div>
                </Visible>

                <Visible visible={repos.length > 0 && !isError}>
                    <div className="flex flex-col gap-2">

                        {repos.map((repo, index) => {
                            const isLastElement = !debouncedSearch && index === repos.length - 1;

                            return (
                                <RepoSelectorItem
                                    key={repo.id}
                                    repo={repo as any}
                                    onSelect={onSelect}
                                    setSelectedUserLogin={setSelectedUserLogin}
                                    lastElementRef={isLastElement ? lastRepoElementRef : undefined}
                                />
                            );
                        })}

                        <Visible
                            visible={!!debouncedSearch}
                            fallback={
                                <div className="mt-6 pt-4 border-t border-border text-center text-sm text-muted-foreground font-mono">
                                    <Visible
                                        visible={isFetchingNextPage}
                                        fallback={
                                            hasNextPage ? (
                                                <span>Scroll down to load more</span>
                                            ) : repos.length > 0 ? (
                                                <span>That's all.</span>
                                            ) : null
                                        }
                                    >
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 size={14} className="animate-spin" />
                                            Loading more...
                                        </span>
                                    </Visible>
                                </div>
                            }
                        >
                            <RepoPagination
                                page={page}
                                maxPages={maxPages}
                                isLastPage={!!isLastPage}
                                setPage={setPage}
                            />
                        </Visible>
                    </div>
                </Visible>
            </div>

            <RepoUserProfileDialog
                login={selectedUserLogin}
                onClose={() => setSelectedUserLogin(null)}
            />
        </div>
    );
};