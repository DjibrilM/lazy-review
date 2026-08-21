import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import Visible from "@/components/common/Visible";

interface SectionErrorProps {
    message: string;
    onRetry?: () => void;
}

export function SectionError({
    message,
    onRetry,
}: SectionErrorProps) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>

                <span className="text-[14px] leading-5 text-red-500">
                    {message}
                </span>
            </div>

            <Visible visible={onRetry}>
<Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 rounded-full px-3 text-[13px]"
                    onClick={onRetry}
                >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Retry
                </Button>
</Visible>
        </div>
    );
}
