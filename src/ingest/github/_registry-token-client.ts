import {
  buildFetchTransportErrorMessage,
  buildHttpErrorMessage,
  type FetchLike,
  type GitHubScanOptions,
  withFetchRetry,
} from "./_shared.js";

export interface RegistryPullToken {
  token: string;
  expiresAt: number;
}

export async function loadRegistryPullToken(
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
): Promise<RegistryPullToken> {
  const startTime = Date.now();
  const url = _buildRegistryTokenUrl(registryBaseUrl, options);
  const response = await withFetchRetry(
    async () => {
      try {
        const response = await fetchImpl(url, {
          headers: _buildTokenHeaders(options),
        });
        if (!response.ok && _shouldRetryStatus(response.status)) {
          throw new Error(await buildHttpErrorMessage(response, "GHCR token request failed"));
        }
        return response;
      } catch (error) {
        throw new Error(buildFetchTransportErrorMessage(error, "GHCR token request failed"), {
          cause: error,
        });
      }
    },
    {
      logger: options.logger,
      label: "GHCR token request",
      shouldRetry: (error) => _shouldRetryError(error),
    },
  );
  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "GHCR token request failed"));
  }

  const body = (await response.json()) as {
    token?: string;
    expires_in?: unknown;
    issued_at?: unknown;
  };
  if (!body.token) {
    throw new Error("GHCR token response did not include a token");
  }

  const registryPullToken = {
    token: body.token,
    expiresAt: _getExpiresAt(body.expires_in, body.issued_at),
  };
  options.logger?.debug(
    `Loaded GHCR pull token in ${Date.now() - startTime}ms (expires in ${Math.max(0, Math.round((registryPullToken.expiresAt - Date.now()) / 1000))}s)`,
  );
  return registryPullToken;
}

function _buildRegistryTokenUrl(registryBaseUrl: string, options: GitHubScanOptions): string {
  const registryUrl = new URL(registryBaseUrl);
  const tokenUrl = new URL("/token", registryUrl);
  tokenUrl.searchParams.set("service", registryUrl.host);
  tokenUrl.searchParams.set("scope", `repository:${options.owner}/${options.packageName}:pull`);
  return tokenUrl.toString();
}

function _buildTokenHeaders(options: GitHubScanOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "ghcr-manager",
  };

  if (options.token) {
    const basicAuth = Buffer.from(`${options.username ?? options.owner}:${options.token}`).toString("base64");
    headers.Authorization = `Basic ${basicAuth}`;
  }

  return headers;
}

function _getExpiresAt(expiresIn: unknown, issuedAt: unknown): number {
  const expiresInSeconds = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 60;
  const issuedAtMilliseconds =
    typeof issuedAt === "string" && !Number.isNaN(Date.parse(issuedAt)) ? Date.parse(issuedAt) : Date.now();
  return issuedAtMilliseconds + expiresInSeconds * 1000;
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
