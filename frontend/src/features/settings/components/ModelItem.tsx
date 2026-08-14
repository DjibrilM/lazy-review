import {
  AlertTriangle,
  Box,
  ChevronRight,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react';

import { Button } from '../../../components/ui/button';
import ExpandableContainer from '../../../components/common/ExpandableContainer';
import { cn } from '@/lib/util/shared';

interface Model {
  id: string;
  name: string;
  isCached: boolean;
  isCompatible: boolean;
  actualSize: number;
  requiredRamGb: number;
  totalMemGb: number;
}

interface DownloadState {
  message?: string;
  progress: number;
}

interface ModelItemProps {
  model: Model;
  isDownloading: boolean;
  download?: DownloadState;
  isExpanded: boolean;
  onToggleExpand: () => void;
  status?: string | null;
  downloadError?: string;
  actionError?: string;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
}

const formatSize = (bytes: number) => {
  if (!bytes) return '0 MB';

  const mb = bytes / 1024 / 1024;

  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }

  return `${Math.round(mb)} MB`;
};

export const ModelItem = ({
  model,
  isDownloading,
  download,
  isExpanded,
  onToggleExpand,
  status,
  downloadError,
  actionError,
  onDelete,
  onDownload,
}: ModelItemProps) => {
  const error = downloadError || actionError;

  const progress = Math.min(
    100,
    Math.max(0, download?.progress ?? 0),
  );

  return (
    <div>
      {/* Model row */}
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggleExpand}
        className={cn(
          'flex min-h-[54px] w-full items-center gap-3 px-4 py-2.5 text-left',
          'transition-colors duration-150',
          'hover:bg-muted/35 active:bg-muted/55',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Box className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium leading-5 text-foreground">
            {model.name}
          </div>

          <div className="mt-px truncate text-[11px] leading-4 text-muted-foreground">
            {model.isCached
              ? `${formatSize(model.actualSize)} on disk`
              : `Requires ${model.requiredRamGb} GB memory`}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isDownloading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}

          {status && (
            <span className="max-w-28 truncate text-[11px] tabular-nums text-muted-foreground">
              {status}
            </span>
          )}

          <ChevronRight
            className={cn(
              'h-4 w-4 text-muted-foreground/50',
              'transition-transform duration-200 ease-out',
              isExpanded && 'rotate-90',
            )}
          />
        </div>
      </button>

      <ExpandableContainer isExpanded={isExpanded}>
        <div className="border-t border-border/60 bg-muted/15 py-3 pl-14 pr-4">
          {/* Details */}
          <div className="space-y-2.5">
            <DetailRow label="Identifier">
              <code className="break-all font-mono text-[11px] text-foreground/80">
                {model.id}
              </code>
            </DetailRow>

            <DetailRow label="Memory">
              <span className="text-[11px] tabular-nums text-foreground/80">
                {model.requiredRamGb} GB required
              </span>
            </DetailRow>

            <DetailRow label="Available">
              <span className="text-[11px] tabular-nums text-foreground/80">
                {model.totalMemGb} GB
              </span>
            </DetailRow>
          </div>

          {/* Compatibility */}
          {!model.isCompatible && !model.isCached && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />

              <p className="text-[11px] leading-4 text-destructive">
                This model requires more memory than this device has available.
              </p>
            </div>
          )}

          {/* Download */}
          {isDownloading && download && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                  {download.message || 'Downloading model…'}
                </span>

                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(progress)}%
                </span>
              </div>

              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-start gap-2 text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />

              <p className="text-[11px] leading-4">
                {error}
              </p>
            </div>
          )}

          {/* Action */}
          <div className="mt-3 flex justify-end">
            {model.isCached ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDelete(model.id)}
                className="h-7 gap-1.5 px-2.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={!model.isCompatible || isDownloading}
                onClick={() => onDownload(model.id)}
                className="h-7 gap-1.5 px-3 text-[11px]"
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}

                {isDownloading ? 'Downloading' : 'Download'}
              </Button>
            )}
          </div>
        </div>
      </ExpandableContainer>
    </div>
  );
};

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>

      <div className="min-w-0 text-right">
        {children}
      </div>
    </div>
  );
}