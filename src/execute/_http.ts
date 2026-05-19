import type { DeleteExecutionLogger, GitHubPackageFetch, GitHubPackageFetchResponse } from "./_types.js";
export { buildHttpErrorMessage } from "../core/index.js";

const _RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const _RETRY_LIMIT = 3;
const _RETRY_DELAY_MS = 1000;

export async function runWithRetry<T>(label: string, logger: DeleteExecutionLogger, run: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      attempt += 1;
      if (attempt > _RETRY_LIMIT || !_shouldRetryError(error)) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        `${label} failed on attempt ${attempt}/${_RETRY_LIMIT + 1}; retrying in ${_RETRY_DELAY_MS}ms - ${errorMessage}`
      );
      await sleep(_RETRY_DELAY_MS);
    }
  }
}

export function isRetryableStatus(status: number): boolean {
  return _RETRYABLE_STATUS_CODES.has(status);
}

export function buildTransportErrorMessage(error: unknown, fallback: string): string {
  const details = [fallback];
  if (error instanceof Error && error.message) {
    details.push(error.message);
  } else {
    details.push(String(error));
  }
  return details.join(" - ");
}

export function resolveFetch(fetchImpl?: GitHubPackageFetch): GitHubPackageFetch {
  return fetchImpl ?? fetch;
}

export function resolveJsonHeaders(response: GitHubPackageFetchResponse): string | undefined {
  return response.headers.get("content-type")?.split(";")[0];
}

function _shouldRetryError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /fetch failed|status 429|status 502|status 503|status 504/.test(error.message);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
