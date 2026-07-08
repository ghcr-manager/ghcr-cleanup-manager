import { buildHttpErrorMessage, type HttpErrorResponse } from "./_http-error.js";

const _RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const _MINUTE_MS = 60_000;

export interface GitHubApiLogger {
  warn(message: string): void;
}

export interface GitHubApiResponse extends HttpErrorResponse {
  ok: boolean;
}

export class RetryableGitHubApiError extends Error {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RetryableGitHubApiError";
    this.retryAfterMs = retryAfterMs;
  }
}

export async function runGitHubApiWithRetry<T>(
  label: string,
  logger: GitHubApiLogger,
  retryCount: number,
  retryDelayMs: number,
  run: () => Promise<T>
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      attempt += 1;
      if (attempt > retryCount || !_shouldRetryGitHubApiError(error)) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const resolvedRetryDelayMs = _resolveRetryDelayMs(error, retryDelayMs);
      logger.warn(
        `${label} failed on attempt ${attempt}/${retryCount + 1}; retrying in ${resolvedRetryDelayMs}ms - ${errorMessage}`
      );
      await _sleep(resolvedRetryDelayMs);
    }
  }
}

export async function throwIfRetryableGitHubApiResponse(
  response: GitHubApiResponse,
  fallback: string,
  retryDelayMs: number
): Promise<void> {
  if (response.ok) {
    return;
  }

  const errorMessage = await buildHttpErrorMessage(response, fallback);
  if (isRetryableGitHubApiStatus(response.status)) {
    throw new RetryableGitHubApiError(errorMessage);
  }

  const rateLimitRetryAfterMs = _resolveRateLimitRetryAfterMs(response, errorMessage, retryDelayMs);
  if (rateLimitRetryAfterMs !== undefined) {
    throw new RetryableGitHubApiError(errorMessage, rateLimitRetryAfterMs);
  }
}

export function isRetryableGitHubApiStatus(status: number): boolean {
  return _RETRYABLE_STATUS_CODES.has(status);
}

export function buildTransportErrorMessage(error: unknown, fallback: string): string {
  const details = [fallback];
  details.push(..._collectErrorDetails(error));
  return details.join(" - ");
}

function _shouldRetryGitHubApiError(error: unknown): boolean {
  return (
    error instanceof RetryableGitHubApiError ||
    (error instanceof Error && /fetch failed|status 429|status 502|status 503|status 504/.test(error.message))
  );
}

function _resolveRetryDelayMs(error: unknown, retryDelayMs: number): number {
  if (error instanceof RetryableGitHubApiError && error.retryAfterMs !== undefined) {
    return error.retryAfterMs;
  }

  return retryDelayMs;
}

function _resolveRateLimitRetryAfterMs(
  response: GitHubApiResponse,
  errorMessage: string,
  retryDelayMs: number
): number | undefined {
  const retryAfterHeader = response.headers.get("retry-after");
  if (retryAfterHeader) {
    const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return retryAfterSeconds * 1000;
    }
  }

  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (remaining === "0" && reset) {
    const resetEpochSeconds = Number.parseInt(reset, 10);
    if (Number.isFinite(resetEpochSeconds)) {
      return Math.max(resetEpochSeconds * 1000 - Date.now(), retryDelayMs);
    }
  }

  if (/secondary rate limit|API rate limit exceeded/i.test(errorMessage)) {
    return _MINUTE_MS;
  }

  return undefined;
}

function _sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function _collectErrorDetails(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [String(error)];
  }

  const details: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const message = _formatErrorMessage(current);
    if (message && !details.includes(message)) {
      details.push(message);
    }
    current = current.cause;
  }

  return details.length > 0 ? details : [String(error)];
}

function _formatErrorMessage(error: Error): string | undefined {
  const code =
    "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;
  if (error.message && code) {
    return `${error.message} (${code})`;
  }
  if (error.message) {
    return error.message;
  }
  if (code) {
    return code;
  }

  return undefined;
}
