import React from 'react';

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
