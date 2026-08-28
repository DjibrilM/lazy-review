export const MAX_REPOSITORY_FETCH_RETRIES = 3;

export interface IndexStateProject {
  analysis?: unknown;
  indexing_version?: number;
  current_task?: string | null;
}

/**
 * A project is review-ready once it has completed at least one indexing pass.
 *
 * `indexing_version` is only incremented by the indexer AFTER a full index has
 * been built, so a value > 0 combined with a non-empty `analysis` manifest is
 * the source of truth (a freshly-created project starts at 0).
 */
export function hasCompletedIndex(project?: IndexStateProject | null): boolean {
  const analysis = project?.analysis;

  const hasAnalysis =
    analysis != null &&
    (typeof analysis === 'string' ? analysis.length > 0 : Object.keys(analysis as object).length > 0);

  return hasAnalysis && (project?.indexing_version ?? 0) > 0;
}

/**
 * Extracts an HTTP status from Axios-style errors and other
 * common API error shapes.
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const value = error as {
    status?: number;
    response?: {
      status?: number;
    };
  };

  return value.response?.status ?? value.status;
}

/**
 * Converts unknown API errors into a useful user-facing message.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const value = error as {
    message?: string;

    response?: {
      data?: {
        message?: string | string[];
      };
    };
  };

  const responseMessage = value.response?.data?.message;

  if (Array.isArray(responseMessage)) {
    return responseMessage.join(', ');
  }

  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    return responseMessage;
  }

  if (typeof value.message === 'string' && value.message.trim()) {
    return value.message;
  }

  return fallback;
}

/**
 * Retry network failures and server-side/transient failures.
 *
 * Avoid retrying most 4xx responses because they usually require
 * user intervention and won't resolve by sending the same request.
 */
export function shouldRetryRepositoryFetch(failureCount: number, error: unknown) {
  if (failureCount >= MAX_REPOSITORY_FETCH_RETRIES) {
    return false;
  }

  const status = getErrorStatus(error);

  // Network errors generally don't include an HTTP status.
  if (!status) {
    return true;
  }

  if (status === 408 || status === 429) {
    return true;
  }

  return status >= 500;
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}
