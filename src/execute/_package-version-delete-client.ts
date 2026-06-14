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

export async function deletePackageVersion(
  owner: string,
  packageName: string,
  versionId: number,
  token: string,
  logger: DeleteExecutionLogger,
  runtime?: {
    fetchImpl?: GitHubPackageFetch;
  }
): Promise<void> {
  const fetchImpl = resolveFetch(runtime?.fetchImpl);
  const ownerURIComponent = await getOwnerURIComponent(fetchImpl, owner, token, logger);
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
          "User-Agent": "ghcr-cleanup-manager",
          "X-GitHub-Api-Version": githubApiVersion
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
