import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import React from 'react';
import Visible from "@/components/common/Visible";

interface SectionProps {
    title?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export function SettingsSection({
    title,
    children,
    footer,
}: SectionProps) {
    const titleId = React.useId();

    return (
        <section
            className="mb-7"
            aria-labelledby={title ? titleId : undefined}
        >
            <Visible visible={title}>
                <h2
                    id={titleId}
                    className="
                      mb-1.5 px-4
                      text-[12px] font-normal uppercase
                      leading-4 tracking-[0.02em]
                      text-[#6e6e73]
                      dark:text-[#98989d]
                    "
                >
                    {title}
                </h2>
            </Visible>

            <div
                className="
          overflow-hidden rounded-xl
          bg-white
          ring-1 ring-black/[0.035]
          dark:bg-[#1c1c1e]
          dark:ring-white/[0.05]
        "
            >
                {children}
            </div>

            <Visible visible={footer}>
                <div
                    className="
                      mt-1.5 px-4
                      text-[12px] leading-[17px]
                      text-[#6e6e73]
                      dark:text-[#98989d]
                    "
                >
                    {footer}
                </div>
            </Visible>
        </section>
    );
}

type DividerInset = 'none' | 'row' | 'icon';

export function Divider({
    inset = 'none',
}: {
    inset?: DividerInset;
}) {
    const insetClass = {
        none: '',
        row: 'ml-4',
        icon: 'ml-14',
    }[inset];

    return (
        <div
            aria-hidden="true"
            className={`
        h-px bg-[#c6c6c8]/60
        dark:bg-[#38383a]
        ${insetClass}
      `}
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
        <div className="flex min-h-[44px] items-center justify-between gap-4 px-4 py-2">
            <span className="min-w-0 text-[16px] leading-5 text-foreground">
                {label}
            </span>

            <span
                className="
          shrink-0 text-[15px] leading-5
          tabular-nums
          text-[#8e8e93]
          dark:text-[#98989d]
        "
            >
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
        <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
            <AlertTriangle
                className="
          h-[18px] w-[18px] shrink-0
          text-[#ff3b30]
          dark:text-[#ff453a]
        "
            />

            <p
                className="
          min-w-0 flex-1
          text-[14px] leading-[18px]
          text-[#ff3b30]
          dark:text-[#ff453a]
        "
            >
                {message}
            </p>

            <Visible visible={onRetry}>
                <button
                    type="button"
                    onClick={onRetry}
                    className="
                      -mr-1 flex h-8 shrink-0 items-center gap-1.5
                      rounded-md px-1.5
                      text-[14px] font-normal
                      text-[#007aff]
                      transition-opacity
                      hover:opacity-70
                      active:opacity-50
                      focus-visible:outline-none
                      focus-visible:ring-2
                      focus-visible:ring-[#007aff]/30
                    "
                >
                    <RotateCw className="h-3.5 w-3.5" />
                    Retry
                </button>
            </Visible>
        </div>
    );
}

export function LoadingRow({
    label = 'Loading…',
}: {
    label?: string;
}) {
    return (
        <div className="flex min-h-[44px] items-center gap-2.5 px-4 py-2">
            <Loader2
                className="
          h-4 w-4 animate-spin
          text-[#8e8e93]
          dark:text-[#98989d]
        "
            />

            <span
                className="
          text-[15px]
          text-[#8e8e93]
          dark:text-[#98989d]
        "
            >
                {label}
            </span>
        </div>
    );
}
