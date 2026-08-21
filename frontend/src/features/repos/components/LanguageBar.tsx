import { useQuery } from '@tanstack/react-query';
import { githubService } from '@/services/github.service';
import Visible from '@/components/common/Visible';

interface LanguageBarProps {
    url: string;
    primary: string | null;
}

export const LanguageBar = ({ url, primary }: LanguageBarProps) => {
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
            <Visible visible={Object.keys(languages).length > 3}>
                <span>...</span>
            </Visible>
        </div>
    );
};
