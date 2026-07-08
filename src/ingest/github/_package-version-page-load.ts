import {
  githubApiBaseUrl,
  githubApiVersion,
  ingestRequestRetryCount,
  ingestRequestRetryDelayMs
} from "../../config/index.js";
import {
  buildHttpErrorMessage,
  getOwnerURIComponent,
  runGitHubApiWithRetry,
  throwIfRetryableGitHubApiResponse
} from "../../core/index.js";
import { buildFetchTransportErrorMessage, type FetchLike, type GitHubScanOptions } from "./_shared.js";

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
  options: GitHubScanOptions,
  page: number
): Promise<GitHubPackageVersionPageItem[]> {
  const startTime = Date.now();
  const url = await buildPackageVersionPageUrl(fetchImpl, options, page);
  let response;
  try {
    response = await runGitHubApiWithRetry(
      `GitHub Packages request for page ${page}`,
      options.logger,
      ingestRequestRetryCount,
      ingestRequestRetryDelayMs,
      async () => {
        const pageResponse = await fetchImpl(url, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${options.token}`,
            "User-Agent": "ghcr-cleanup-manager",
            "X-GitHub-Api-Version": githubApiVersion
          }
        });
        await throwIfRetryableGitHubApiResponse(
          pageResponse,
          `GitHub Packages request for page ${page} failed`,
          ingestRequestRetryDelayMs
        );
        return pageResponse;
      }
    );
  } catch (error) {
    throw new Error(buildFetchTransportErrorMessage(error, `GitHub Packages request for page ${page} failed`), {
      cause: error
    });
  }

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "GitHub Packages request failed"));
  }

  const pageItems = (await response.json()) as GitHubPackageVersionPageItem[];
  options.logger.debug(
    `Loaded GitHub package-version page ${page} in ${Date.now() - startTime}ms (${pageItems.length} items)`
  );
  return pageItems;
}

async function buildPackageVersionPageUrl(
  fetchImpl: FetchLike,
  options: GitHubScanOptions,
  page: number
): Promise<string> {
  const ownerURIComponent = await getOwnerURIComponent(fetchImpl, options.owner, options.token, options.logger);
  const url = new URL(
    `/${ownerURIComponent}/packages/container/${encodeURIComponent(options.packageName)}/versions`,
    githubApiBaseUrl
  );
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  return url.toString();
}
