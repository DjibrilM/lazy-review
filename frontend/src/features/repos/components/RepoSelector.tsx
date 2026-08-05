import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
  Lock,
  Globe,
  Star,
  HardDrive,
  Loader2,
  Search,
  Users,
  MapPin,
  Building2,
  Link as LinkIcon,
  BookOpen,
  Clock,
} from 'lucide-react';
import type { GitHubRepository } from '@/interfaces/github-repo.interface';
import { githubService } from '@/services/github.service';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Visible from '@/components/common/Visible';

interface RepoSelectorProps {
  onSelect: (repo: GitHubRepository) => void;
}

const LanguageBar = ({ url, primary }: { url: string; primary: string | null }) => {
  const { data: languages, isLoading } = useQuery({
    queryKey: ['repo-languages', url],
    queryFn: () => githubService.getRepositoryLanguages(url),
    staleTime: Infinity,
  });

  if (isLoading) return <div className="h-4 w-24 bg-muted rounded animate-pulse" />;

  if (!languages || Object.keys(languages).length === 0) {
    if (!primary) return null;
    return (
      <div className="flex gap-2 text-[11px] font-mono text-muted-foreground">
        <span>{primary}</span>
      </div>
    );
  }

  const total = Object.values(languages).reduce((acc, val) => acc + val, 0);

  return (
    <div className="flex flex-wrap gap-2 text-[11px] font-mono text-muted-foreground">
      {Object.entries(languages)
        .slice(0, 3)
        .map(([lang, count]) => (
          <span key={lang}>
            {lang} {Math.round((count / total) * 100)}%
          </span>
        ))}
      {Object.keys(languages).length > 3 && <span>...</span>}
    </div>
  );
};

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

  // User Profile Data
  const { data: userProfile, isLoading: isUserProfileLoading } = useQuery({
    queryKey: ['github-user-profile', selectedUserLogin],
    queryFn: () => githubService.getUserProfile(selectedUserLogin!),
    enabled: !!selectedUserLogin,
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

  const renderPaginationItems = () => {
    const items = [];

    // Always show first page
    items.push(
      <PaginationItem key="1">
        <PaginationLink
          href="#"
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            setPage(1);
          }}
          isActive={page === 1}
        >
          1
        </PaginationLink>
      </PaginationItem>,
    );

    // Show ellipsis if page is far from start
    if (page > 3 && maxPages > 4) {
      items.push(
        <PaginationItem key="ellipsis-start">
          <PaginationEllipsis />
        </PaginationItem>,
      );
    }

    // Show pages around current
    for (let p = Math.max(2, page - 1); p <= Math.min(maxPages - 1, page + 1); p++) {
      if (p === 1 || p === maxPages) continue; // Skip first/last as they are handled explicitly
      items.push(
        <PaginationItem key={p}>
          <PaginationLink
            href="#"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              setPage(p);
            }}
            isActive={page === p}
          >
            {p}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    // Show ellipsis if page is far from end
    if (page < maxPages - 2 && maxPages > 4) {
      items.push(
        <PaginationItem key="ellipsis-end">
          <PaginationEllipsis />
        </PaginationItem>,
      );
    }

    // Always show last page if > 1
    if (maxPages > 1) {
      items.push(
        <PaginationItem key={maxPages}>
          <PaginationLink
            href="#"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              setPage(maxPages);
            }}
            isActive={page === maxPages}
          >
            {maxPages}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    return items;
  };

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
              // Apply ref to the last item in the list only when infinite scrolling
              const isLastElement = !debouncedSearch && index === repos.length - 1;

              return (
                <div
                  key={repo.id}
                  ref={isLastElement ? lastRepoElementRef : null}
                  onClick={() => onSelect(repo)}
                  className="group cursor-pointer border border-border bg-card px-4 py-3 transition-all hover:border-primary hover:shadow-sm rounded-md flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {repo.owner?.avatar_url ? (
                        <img
                          src={repo.owner.avatar_url}
                          alt={repo.owner.login}
                          title={`View ${repo.owner.login}'s profile`}
                          className="w-5 h-5 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-primary transition-all shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUserLogin(repo.owner.login);
                          }}
                        />
                      ) : (
                        !repo.private && <Globe size={14} className="text-emerald-500 shrink-0" />
                      )}
                      {repo.private && (
                        <Lock size={14} className="text-amber-500 shrink-0" />
                      )}
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
            })}

            {debouncedSearch ? (
              maxPages > 1 && (
                <div className="mt-6 pt-4 border-t border-border">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e: React.MouseEvent) => {
                            e.preventDefault();
                            if (page > 1) setPage(page - 1);
                          }}
                          className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>

                      {renderPaginationItems()}

                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e: React.MouseEvent) => {
                            e.preventDefault();
                            if (!isLastPage) setPage(page + 1);
                          }}
                          className={isLastPage ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )
            ) : (
              <div className="mt-6 pt-4 border-t border-border text-center text-sm text-muted-foreground font-mono">
                {isFetchingNextPage ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Loading more...
                  </span>
                ) : hasNextPage ? (
                  <span>Scroll down to load more</span>
                ) : (
                  repos.length > 0 && <span>That's all.</span>
                )}
              </div>
            )}
          </div>
        </Visible>
      </div>

      {/* User Profile Dialog */}
      <Dialog
        open={!!selectedUserLogin}
        onOpenChange={(open) => !open && setSelectedUserLogin(null)}
      >
        <DialogContent className="sm:max-w-md font-mono">
          <DialogHeader>
            <DialogTitle>User Profile</DialogTitle>
          </DialogHeader>

          {isUserProfileLoading ? (
            <div className="py-8 flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <Loader2 className="animate-spin" size={24} />
              <p className="text-xs">Loading profile...</p>
            </div>
          ) : userProfile ? (
            <div className="flex flex-col gap-5 pt-2">
              <div className="flex items-start gap-4">
                <img
                  src={userProfile.avatar_url}
                  alt={userProfile.login}
                  className="w-16 h-16 rounded-full border-2 border-border shadow-sm object-cover"
                />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <h3 className="font-bold text-lg leading-tight truncate">
                    {userProfile.name || userProfile.login}
                  </h3>
                  <a
                    href={userProfile.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline text-sm truncate"
                  >
                    @{userProfile.login}
                  </a>
                </div>
              </div>

              {userProfile.bio && (
                <div className="text-sm text-foreground bg-accent/30 p-3 rounded-md border border-border/50 shadow-inner">
                  {userProfile.bio}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground mt-1">
                {userProfile.company && (
                  <div className="flex items-center gap-2" title={userProfile.company}>
                    <Building2 size={14} className="shrink-0" />
                    <span className="truncate">{userProfile.company}</span>
                  </div>
                )}
                {userProfile.location && (
                  <div className="flex items-center gap-2" title={userProfile.location}>
                    <MapPin size={14} className="shrink-0" />
                    <span className="truncate">{userProfile.location}</span>
                  </div>
                )}
                {userProfile.blog && (
                  <div className="flex items-center gap-2" title={userProfile.blog}>
                    <LinkIcon size={14} className="shrink-0" />
                    <a
                      href={
                        userProfile.blog.startsWith('http')
                          ? userProfile.blog
                          : `https://${userProfile.blog}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:text-primary hover:underline transition-colors"
                    >
                      {userProfile.blog.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users size={14} className="shrink-0" />
                  <span>
                    <strong className="text-foreground">{userProfile.followers}</strong> followers
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="shrink-0" />
                  <span>
                    <strong className="text-foreground">{userProfile.public_repos}</strong> public
                    repos
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="shrink-0" />
                  <span>Joined {new Date(userProfile.created_at).getFullYear()}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-red-500/80 text-sm bg-red-500/10 border border-red-500/20 rounded-md">
              Failed to load user profile.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
