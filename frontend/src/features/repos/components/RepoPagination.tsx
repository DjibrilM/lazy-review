import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';

interface RepoPaginationProps {
    page: number;
    maxPages: number;
    isLastPage: boolean;
    setPage: (page: number) => void;
}

export const RepoPagination = ({ page, maxPages, isLastPage, setPage }: RepoPaginationProps) => {
    if (maxPages <= 1) return null;

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

    return (
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
    );
};
