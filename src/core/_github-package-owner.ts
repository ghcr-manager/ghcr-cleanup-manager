import {
  githubApiBaseUrl,
  githubApiVersion,
  ingestRequestRetryCount,
  ingestRequestRetryDelayMs
} from "../config/index.js";
import { buildHttpErrorMessage } from "./_http-error.js";
import { runGitHubApiWithRetry, throwIfRetryableGitHubApiResponse } from "./_github-rest.js";

interface _FetchLikeResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json(): Promise<unknown>;
}

interface _Logger {
  warn(message: string): void;
}

const _ownerUriComponentByOwner = new Map<string, string>();

export async function getOwnerURIComponent(
  fetchImpl: (input: string, init?: RequestInit) => Promise<_FetchLikeResponse>,
  owner: string,
  token: string,
  logger: _Logger
): Promise<string> {
  const cachedOwnerURIComponent = _ownerUriComponentByOwner.get(owner);
  if (cachedOwnerURIComponent) {
    return cachedOwnerURIComponent;
  }

  const url = new URL(`/users/${encodeURIComponent(owner)}`, githubApiBaseUrl).toString();

  const response = await runGitHubApiWithRetry(
    "GitHub owner lookup",
    logger,
    ingestRequestRetryCount,
    ingestRequestRetryDelayMs,
    async () => {
      const ownerResponse = await fetchImpl(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "ghcr-cleanup-manager",
          "X-GitHub-Api-Version": githubApiVersion
        }
      });
      await throwIfRetryableGitHubApiResponse(ownerResponse, "GitHub owner lookup failed", ingestRequestRetryDelayMs);
      return ownerResponse;
    }
  );

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, "GitHub owner lookup failed"));
  }

  const payload = (await response.json()) as { type?: unknown };
  if (payload.type === "Organization") {
    const ownerURIComponent = `orgs/${encodeURIComponent(owner)}`;
    _ownerUriComponentByOwner.set(owner, ownerURIComponent);
    return ownerURIComponent;
  }
  if (payload.type === "User") {
    const ownerURIComponent = `users/${encodeURIComponent(owner)}`;
    _ownerUriComponentByOwner.set(owner, ownerURIComponent);
    return ownerURIComponent;
  }
  throw new Error(`GitHub owner lookup did not include a supported type`);
}
