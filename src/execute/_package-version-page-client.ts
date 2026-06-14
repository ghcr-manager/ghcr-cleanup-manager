import { githubApiBaseUrl, githubApiVersion } from "../config/index.js";
import { getOwnerURIComponent } from "../core/index.js";
import {
  buildHttpErrorMessage,
  buildTransportErrorMessage,
  isRetryableStatus,
  resolveFetch,
  runWithRetry
} from "./_http.js";
import type { DeleteExecutionLogger, GitHubPackageFetch } from "./_types.js";

export interface GitHubPackageVersionPageItem {
  id: number;
  name?: string;
  metadata?: {
    container?: {
      tags?: string[];
    };
  };
}

export async function findPackageVersionByDigestAndTag(
  owner: string,
  packageName: string,
  digest: string,
  tag: string,
  token: string,
  logger: DeleteExecutionLogger,
  runtime?: {
    fetchImpl?: GitHubPackageFetch;
  }
): Promise<number> {
  const fetchImpl = resolveFetch(runtime?.fetchImpl);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const versionId = await _findPackageVersionByDigestAndTagOnce(
      owner,
      packageName,
      digest,
      tag,
      token,
      logger,
      fetchImpl
    );
    if (versionId !== undefined) {
      return versionId;
    }

    if (attempt < 5) {
      logger.warn(
        `Temporary package version for ${owner}/${packageName}:${tag} (${digest}) not visible yet; retrying lookup ${attempt}/5`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`could not find temporary package version for ${owner}/${packageName}:${tag} (${digest})`);
}

export async function loadPackageVersionPage(
  owner: string,
  packageName: string,
  page: number,
  token: string,
  logger: DeleteExecutionLogger,
  fetchImpl: GitHubPackageFetch
): Promise<GitHubPackageVersionPageItem[]> {
  const ownerURIComponent = await getOwnerURIComponent(fetchImpl, owner, token, logger);
  const url = new URL(
    `/${ownerURIComponent}/packages/container/${encodeURIComponent(packageName)}/versions`,
    githubApiBaseUrl
  );
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));

  let response;
  try {
    response = await runWithRetry(`GitHub Packages request for page ${page}`, logger, async () => {
      const pageResponse = await fetchImpl(url.toString(), {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "ghcr-cleanup-manager",
          "X-GitHub-Api-Version": githubApiVersion
        }
      });
      if (!pageResponse.ok && isRetryableStatus(pageResponse.status)) {
        throw new Error(await buildHttpErrorMessage(pageResponse, `GitHub Packages request for page ${page} failed`));
      }
      return pageResponse;
    });
  } catch (error) {
    throw new Error(buildTransportErrorMessage(error, `GitHub Packages request for page ${page} failed`), {
      cause: error
    });
  }

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, `GitHub Packages request for page ${page} failed`));
  }

  return (await response.json()) as GitHubPackageVersionPageItem[];
}

async function _findPackageVersionByDigestAndTagOnce(
  owner: string,
  packageName: string,
  digest: string,
  tag: string,
  token: string,
  logger: DeleteExecutionLogger,
  fetchImpl: GitHubPackageFetch
): Promise<number | undefined> {
  for (let page = 1; ; page += 1) {
    const items = await loadPackageVersionPage(owner, packageName, page, token, logger, fetchImpl);
    if (items.length === 0) {
      return undefined;
    }

    const match = items.find((item) => item.name === digest && item.metadata?.container?.tags?.includes(tag));
    if (match) {
      return match.id;
    }

    if (items.length < 100) {
      return undefined;
    }
  }
}
