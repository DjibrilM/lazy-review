import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import Visible from "@/components/common/Visible";

export function Divider({ inset = false }: { inset?: boolean }) {
    return (
        <div
            className={`border-b border-[#c6c6c8]/70 dark:border-[#38383a] ${inset ? 'ml-14' : ''
                }`}
        />
    );
}

export function InfoRow({
    label,
    value,
}: {
    label: string;
    value: React.ReactNode;
}) {
    return (
        <div className="flex min-h-[44px] items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-[16px] text-foreground">{label}</span>
            <span className="shrink-0 text-[15px] tabular-nums text-muted-foreground">
                {value}
            </span>
        </div>
    );
}

export function SectionError({
    message,
    onRetry,
}: {
    message: string;
    onRetry?: () => void;
}) {
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

export function LoadingRow() {
    return (
        <div className="px-4 py-3.5 text-[15px] text-muted-foreground">
            Loading…
        </div>
    );
}

export function SectionHeader({ title }: { title: string }) {
    return (
        <h2 className="mb-2 px-4 text-[13px] font-normal uppercase tracking-wide text-muted-foreground">
            {title}
        </h2>
    );
}

export function SectionContainer({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
    return (
        <section className="mb-8">
            <SectionHeader title={title} />
            <div className="overflow-hidden rounded-[14px] border border-black/[0.04] bg-white dark:border-white/[0.06] dark:bg-[#1c1c1e]">
                {children}
            </div>
            <Visible visible={footer}>
<div className="mt-2 px-4 text-[13px] leading-[18px] text-muted-foreground">
                    {footer}
                </div>
</Visible>
        </section>
    );
}
