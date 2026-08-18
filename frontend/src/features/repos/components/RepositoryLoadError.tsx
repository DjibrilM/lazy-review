import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getErrorMessage, MAX_REPOSITORY_FETCH_RETRIES } from '../utils/repo-utils';

interface RepositoryLoadErrorProps {
  error: unknown;
  failureCount: number;
  isRetrying: boolean;
  onRetry: () => void;
}

export function RepositoryLoadError({
  error,
  failureCount,
  isRetrying,
  onRetry,
}: RepositoryLoadErrorProps) {
  const message = getErrorMessage(
    error,
    'Unable to load repository details.',
  );

  return (
    <div className="flex h-full items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm overflow-hidden rounded-md border border-border bg-card">
        <div className="flex items-start gap-3 px-4 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">
              Failed to load repository
            </p>

            <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">
              {message}
            </p>

            {failureCount > 0 && (
              <p className="mt-1.5 text-[10px] text-muted-foreground/70">
                Retried{' '}
                {Math.min(
                  failureCount,
                  MAX_REPOSITORY_FETCH_RETRIES,
                )}{' '}
                {failureCount === 1 ? 'time' : 'times'}.
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRetrying}
              onClick={onRetry}
              className="mt-3 h-7 gap-1.5 px-2.5 text-[11px]"
            >
              {isRetrying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {isRetrying ? 'Retrying…' : 'Try again'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
