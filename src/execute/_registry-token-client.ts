import {
  buildHttpErrorMessage,
  buildTransportErrorMessage,
  isRetryableStatus,
  resolveFetch,
  runWithRetry
} from "./_http.js";
import type { DeleteExecutionLogger, GitHubPackageFetch } from "./_types.js";

const _DEFAULT_REGISTRY_BASE_URL = "https://ghcr.io";

export async function loadRegistryPushToken(
  owner: string,
  packageName: string,
  token: string,
  logger: DeleteExecutionLogger,
  runtime?: {
    registryBaseUrl?: string;
    fetchImpl?: GitHubPackageFetch;
  }
): Promise<string> {
  const registryBaseUrl = runtime?.registryBaseUrl ?? _DEFAULT_REGISTRY_BASE_URL;
  const fetchImpl = resolveFetch(runtime?.fetchImpl);
  const registryUrl = new URL(registryBaseUrl);
  const tokenUrl = new URL("/token", registryUrl);
  tokenUrl.searchParams.set("service", registryUrl.host);
  tokenUrl.searchParams.set("scope", `repository:${owner}/${packageName}:pull,push`);

  let response;
  try {
    response = await runWithRetry("GHCR token request", logger, async () => {
      const tokenResponse = await fetchImpl(tokenUrl.toString(), {
        headers: {
          "User-Agent": "ghcr-manager",
          Authorization: `Basic ${Buffer.from(`${owner}:${token}`).toString("base64")}`
        }
      });
      if (!tokenResponse.ok && isRetryableStatus(tokenResponse.status)) {
        throw new Error(await buildHttpErrorMessage(tokenResponse, "GHCR token request failed"));
      }
      return tokenResponse;
    });
  } catch (error) {
    throw new Error(buildTransportErrorMessage(error, "GHCR token request failed"), {
      cause: error
    });
  }

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "GHCR token request failed"));
  }

  const body = (await response.json()) as { token?: string };
  if (!body.token) {
    throw new Error("GHCR token response did not include a token");
  }

  return body.token;
}
