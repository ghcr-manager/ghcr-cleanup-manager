import { githubApiBaseUrl, githubApiVersion } from "../../config/index.js";
import { getOwnerURIComponent } from "../../core/index.js";
import {
  buildFetchTransportErrorMessage,
  buildHttpErrorMessage,
  type FetchLike,
  type GitHubScanOptions,
  withFetchRetry
} from "./_shared.js";

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
    response = await withFetchRetry(
      async () => {
        const packageResponse = await fetchImpl(url, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${options.token}`,
            "User-Agent": "ghcr-cleanup-manager",
            "X-GitHub-Api-Version": githubApiVersion
          }
        });
        if (!packageResponse.ok && _shouldRetryStatus(packageResponse.status)) {
          throw new Error(await buildHttpErrorMessage(packageResponse, "GitHub package metadata request failed"));
        }
        return packageResponse;
      },
      {
        logger: options.logger,
        label: "GitHub package metadata request",
        shouldRetry: (error) => _shouldRetryError(error)
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

function _shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function _shouldRetryError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /fetch failed|status 429|status 502|status 503|status 504/.test(error.message);
}
