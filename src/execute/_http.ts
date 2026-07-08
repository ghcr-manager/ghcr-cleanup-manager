import { executeRequestRetryCount, executeRequestRetryDelayMs } from "../config/index.js";
import { isRetryableGitHubApiStatus, runGitHubApiWithRetry } from "../core/index.js";
import type { DeleteExecutionLogger, GitHubPackageFetch, GitHubPackageFetchResponse } from "./_types.js";
export { buildHttpErrorMessage, buildTransportErrorMessage } from "../core/index.js";

export async function runWithRetry<T>(label: string, logger: DeleteExecutionLogger, run: () => Promise<T>): Promise<T> {
  return runGitHubApiWithRetry(label, logger, executeRequestRetryCount, executeRequestRetryDelayMs, run);
}

export function isRetryableStatus(status: number): boolean {
  return isRetryableGitHubApiStatus(status);
}

export function resolveFetch(fetchImpl?: GitHubPackageFetch): GitHubPackageFetch {
  return fetchImpl ?? fetch;
}

export function resolveJsonHeaders(response: GitHubPackageFetchResponse): string | undefined {
  return response.headers.get("content-type")?.split(";")[0];
}
