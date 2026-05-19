import { ingestRequestRetryCount, ingestRequestRetryDelayMs } from "../tuning/index.js";
import { buildHttpErrorMessage } from "./_http-error.js";
import { githubApiBaseUrl } from "./_service-urls.js";

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

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "ghcr-manager",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (response.ok) {
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

    if (!_isRetryableStatus(response.status) || attempt > ingestRequestRetryCount) {
      throw new Error(await buildHttpErrorMessage(response, "GitHub owner lookup failed"));
    }

    logger.warn(
      `GitHub owner lookup failed on attempt ${attempt}/${ingestRequestRetryCount + 1}; retrying in ${ingestRequestRetryDelayMs}ms - ${await buildHttpErrorMessage(response, "GitHub owner lookup failed")}`
    );
    await _sleep(ingestRequestRetryDelayMs);
  }
}

function _isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function _sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
