import {
  buildFetchTransportErrorMessage,
  buildHttpErrorMessage,
  type FetchLike,
  type GitHubScanOptions,
  withFetchRetry,
} from "./_shared.js";

export interface GitHubPackageVersionPageItem {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    container?: {
      tags?: string[];
    };
  };
}

export async function loadPackageVersionPage(
  fetchImpl: FetchLike,
  githubApiBaseUrl: string,
  options: GitHubScanOptions,
  page: number,
): Promise<GitHubPackageVersionPageItem[]> {
  const startTime = Date.now();
  const url = buildPackageVersionPageUrl(githubApiBaseUrl, options, page);
  const response = await withFetchRetry(
    async () => {
      try {
        const response = await fetchImpl(url, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${options.token}`,
            "User-Agent": "ghcr-manager",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        if (!response.ok && _shouldRetryStatus(response.status)) {
          throw new Error(await buildHttpErrorMessage(response, `GitHub Packages request for page ${page} failed`));
        }
        return response;
      } catch (error) {
        throw new Error(buildFetchTransportErrorMessage(error, `GitHub Packages request for page ${page} failed`), {
          cause: error,
        });
      }
    },
    {
      logger: options.logger,
      label: `GitHub Packages request for page ${page}`,
      shouldRetry: (error) => _shouldRetryError(error),
    },
  );

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "GitHub Packages request failed"));
  }

  const pageItems = (await response.json()) as GitHubPackageVersionPageItem[];
  options.logger?.debug(
    `Loaded GitHub package-version page ${page} in ${Date.now() - startTime}ms (${pageItems.length} items)`,
  );
  return pageItems;
}

function buildPackageVersionPageUrl(githubApiBaseUrl: string, options: GitHubScanOptions, page: number): string {
  const url = new URL(
    `/orgs/${encodeURIComponent(options.owner)}/packages/container/${encodeURIComponent(options.packageName)}/versions`,
    githubApiBaseUrl,
  );
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  return url.toString();
}

function _shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function _shouldRetryError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /fetch failed|status 429|status 502|status 503|status 504/.test(error.message);
}
