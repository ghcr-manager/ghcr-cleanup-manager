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

export interface GitHubPackageMetadata {
  rawJson: string;
}

export async function loadPackageMetadata(
  fetchImpl: FetchLike,
  options: GitHubScanOptions
): Promise<GitHubPackageMetadata> {
  const ownerURIComponent = await getOwnerURIComponent(fetchImpl, options.owner, options.token, options.logger);
  const url = new URL(
    `/${ownerURIComponent}/packages/container/${encodeURIComponent(options.packageName)}`,
    githubApiBaseUrl
  ).toString();

  let response;
  try {
    response = await runGitHubApiWithRetry(
      "GitHub package metadata request",
      options.logger,
      ingestRequestRetryCount,
      ingestRequestRetryDelayMs,
      async () => {
        const packageResponse = await fetchImpl(url, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${options.token}`,
            "User-Agent": "ghcr-cleanup-manager",
            "X-GitHub-Api-Version": githubApiVersion
          }
        });
        await throwIfRetryableGitHubApiResponse(
          packageResponse,
          "GitHub package metadata request failed",
          ingestRequestRetryDelayMs
        );
        return packageResponse;
      }
    );
  } catch (error) {
    throw new Error(buildFetchTransportErrorMessage(error, "GitHub package metadata request failed"), { cause: error });
  }

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "GitHub package metadata request failed"));
  }

  const payload = (await response.json()) as object;
  return { rawJson: JSON.stringify(payload) };
}
