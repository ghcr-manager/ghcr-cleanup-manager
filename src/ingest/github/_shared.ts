import { ingestRequestRetryCount, ingestRequestRetryDelayMs } from "../../config/index.js";
import { buildTransportErrorMessage } from "../../core/index.js";
export { buildHttpErrorMessage } from "../../core/index.js";

export interface GitHubScanOptions {
  owner: string;
  packageName: string;
  token: string;
  logger: GitHubScanLogger;
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
  "application/vnd.oci.artifact.manifest.v1+json"
].join(", ");

export async function defaultFetch(input: string, init?: RequestInit): Promise<FetchLikeResponse> {
  return fetch(input, init);
}

export function buildFetchTransportErrorMessage(error: unknown, fallback: string): string {
  return buildTransportErrorMessage(error, fallback);
}

export async function withFetchRetry<T>(
  run: () => Promise<T>,
  options: {
    logger: GitHubScanLogger;
    label: string;
    shouldRetry?: (error: unknown) => boolean;
  }
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
      options.logger.warn(
        `${options.label} failed on attempt ${attempt}/${ingestRequestRetryCount + 1}; retrying in ${ingestRequestRetryDelayMs}ms - ${errorMessage}`
      );
      await _sleep(ingestRequestRetryDelayMs);
    }
  }
}

function _sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
