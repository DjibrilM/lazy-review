export const MAX_REPOSITORY_FETCH_RETRIES = 3;

/**
 * Extracts an HTTP status from Axios-style errors and other
 * common API error shapes.
 */
export function getErrorStatus(
  error: unknown,
): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const value = error as {
    status?: number;
    response?: {
      status?: number;
    };
  };

  return (
    value.response?.status ??
    value.status
  );
}

/**
 * Converts unknown API errors into a useful user-facing message.
 */
export function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
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

  const responseMessage =
    value.response?.data?.message;

  if (Array.isArray(responseMessage)) {
    return responseMessage.join(', ');
  }

  if (
    typeof responseMessage === 'string' &&
    responseMessage.trim()
  ) {
    return responseMessage;
  }

  if (
    typeof value.message === 'string' &&
    value.message.trim()
  ) {
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
export function shouldRetryRepositoryFetch(
  failureCount: number,
  error: unknown,
) {
  if (
    failureCount >=
    MAX_REPOSITORY_FETCH_RETRIES
  ) {
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

export function formatDuration(
  seconds: number,
) {
  const minutes = Math.floor(
    seconds / 60,
  );

  const remainingSeconds =
    seconds % 60;

  return `${minutes
    .toString()
    .padStart(2, '0')}:${remainingSeconds
    .toString()
    .padStart(2, '0')}`;
}
