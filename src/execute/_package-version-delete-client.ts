import { getOwnerURIComponent } from "../core/index.js";
import {
  buildHttpErrorMessage,
  buildTransportErrorMessage,
  isRetryableStatus,
  resolveFetch,
  runWithRetry
} from "./_http.js";
import type { DeleteExecutionLogger, GitHubPackageFetch } from "./_types.js";

const _DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const _GITHUB_API_VERSION = "2022-11-28";

export async function deletePackageVersion(
  owner: string,
  packageName: string,
  versionId: number,
  token: string,
  logger: DeleteExecutionLogger,
  runtime?: {
    githubApiBaseUrl?: string;
    fetchImpl?: GitHubPackageFetch;
  }
): Promise<void> {
  const githubApiBaseUrl = runtime?.githubApiBaseUrl ?? _DEFAULT_GITHUB_API_BASE_URL;
  const fetchImpl = resolveFetch(runtime?.fetchImpl);
  const ownerURIComponent = await getOwnerURIComponent(fetchImpl, githubApiBaseUrl, owner, token, logger);
  const url = new URL(
    `/${ownerURIComponent}/packages/container/${encodeURIComponent(packageName)}/versions/${versionId}`,
    githubApiBaseUrl
  ).toString();

  let response;
  try {
    response = await runWithRetry(`GitHub package delete request for version ${versionId}`, logger, async () => {
      const deleteResponse = await fetchImpl(url, {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "ghcr-manager",
          "X-GitHub-Api-Version": _GITHUB_API_VERSION
        }
      });
      if (!deleteResponse.ok && isRetryableStatus(deleteResponse.status)) {
        throw new Error(
          await buildHttpErrorMessage(deleteResponse, `GitHub package delete request failed for version ${versionId}`)
        );
      }
      return deleteResponse;
    });
  } catch (error) {
    throw new Error(
      buildTransportErrorMessage(error, `GitHub package delete request failed for version ${versionId}`),
      {
        cause: error
      }
    );
  }

  if (!response.ok) {
    throw new Error(
      await buildHttpErrorMessage(response, `GitHub package delete request failed for version ${versionId}`)
    );
  }
}
