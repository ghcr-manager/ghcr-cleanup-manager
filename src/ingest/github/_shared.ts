import { ingestRequestRetryCount, ingestRequestRetryDelayMs } from "../../tuning/index.js";

export interface GitHubScanOptions {
  owner: string;
  packageName: string;
  token?: string;
  githubApiBaseUrl?: string;
  registryBaseUrl?: string;
  username?: string;
  fetchImpl?: FetchLike;
  logger?: GitHubScanLogger;
}

export interface GitHubScanLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json(): Promise<unknown>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<FetchLikeResponse>;

export const acceptedManifestMediaTypes = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.artifact.manifest.v1+json",
].join(", ");

export async function defaultFetch(input: string, init?: RequestInit): Promise<FetchLikeResponse> {
  return fetch(input, init);
}

export function buildFetchTransportErrorMessage(error: unknown, fallback: string): string {
  const details = [fallback];
  if (error instanceof Error && error.message) {
    details.push(error.message);
  } else {
    details.push(String(error));
  }
  return details.join(" - ");
}

export async function buildHttpErrorMessage(response: FetchLikeResponse, fallback: string): Promise<string> {
  const details: string[] = [fallback, `status ${response.status}`];
  const body = await _readJsonErrorBody(response);
  const message = typeof body?.message === "string" ? body.message : undefined;
  const documentationUrl = typeof body?.documentation_url === "string" ? body.documentation_url : undefined;
  const authenticateHeader = response.headers.get("www-authenticate") ?? undefined;

  if (message) {
    details.push(message);
  }
  if (documentationUrl) {
    details.push(documentationUrl);
  }
  if (authenticateHeader) {
    details.push(`www-authenticate: ${authenticateHeader}`);
  }

  return details.join(" - ");
}

export async function withFetchRetry<T>(
  run: () => Promise<T>,
  options: {
    logger?: GitHubScanLogger;
    label: string;
    shouldRetry?: (error: unknown) => boolean;
  },
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      attempt += 1;
      const shouldRetry = options.shouldRetry ? options.shouldRetry(error) : true;
      if (!shouldRetry || attempt > ingestRequestRetryCount) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      options.logger?.warn(
        `${options.label} failed on attempt ${attempt}/${ingestRequestRetryCount + 1}; retrying in ${ingestRequestRetryDelayMs}ms - ${errorMessage}`,
      );
      await _sleep(ingestRequestRetryDelayMs);
    }
  }
}

async function _readJsonErrorBody(response: FetchLikeResponse): Promise<
  | {
      message?: unknown;
      documentation_url?: unknown;
    }
  | undefined
> {
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType && contentType !== "application/json" && !contentType.endsWith("+json")) {
    return undefined;
  }

  try {
    const body = await response.json();
    if (body && typeof body === "object") {
      return body as { message?: unknown; documentation_url?: unknown };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function _sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
