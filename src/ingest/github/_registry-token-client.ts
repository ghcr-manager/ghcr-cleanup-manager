import { buildHttpErrorMessage, type FetchLike, type GitHubScanOptions } from "./_shared.js";

export interface RegistryPullToken {
  token: string;
  expiresAt: number;
}

export async function loadRegistryPullToken(
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
): Promise<RegistryPullToken> {
  const response = await fetchImpl(_buildRegistryTokenUrl(registryBaseUrl, options), {
    headers: _buildTokenHeaders(options),
  });
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

  return {
    token: body.token,
    expiresAt: _getExpiresAt(body.expires_in, body.issued_at),
  };
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
