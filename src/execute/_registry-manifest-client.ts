import { ghcrRegistryBaseUrl } from "../config/index.js";
import { createHash } from "node:crypto";
import {
  buildHttpErrorMessage,
  buildTransportErrorMessage,
  isRetryableStatus,
  resolveFetch,
  resolveJsonHeaders,
  runWithRetry
} from "./_http.js";
import type { DeleteExecutionLogger, GitHubPackageFetch } from "./_types.js";

const _ACCEPTED_MANIFEST_MEDIA_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.artifact.manifest.v1+json"
].join(", ");
export interface LoadedRegistryManifest {
  digest: string;
  mediaType: string;
  rawJson: string;
}

export async function loadRegistryManifestByDigest(
  owner: string,
  packageName: string,
  digest: string,
  registryToken: string,
  logger: DeleteExecutionLogger,
  runtime?: {
    fetchImpl?: GitHubPackageFetch;
  }
): Promise<LoadedRegistryManifest> {
  const fetchImpl = resolveFetch(runtime?.fetchImpl);
  const url = new URL(`/v2/${owner}/${packageName}/manifests/${digest}`, ghcrRegistryBaseUrl);

  let response;
  try {
    response = await runWithRetry(`GHCR manifest request for ${digest}`, logger, async () => {
      const manifestResponse = await fetchImpl(url.toString(), {
        headers: {
          Accept: _ACCEPTED_MANIFEST_MEDIA_TYPES,
          Authorization: `Bearer ${registryToken}`,
          "User-Agent": "ghcr-cleanup-manager"
        }
      });
      if (!manifestResponse.ok && isRetryableStatus(manifestResponse.status)) {
        throw new Error(await buildHttpErrorMessage(manifestResponse, `GHCR manifest request for ${digest} failed`));
      }
      return manifestResponse;
    });
  } catch (error) {
    throw new Error(buildTransportErrorMessage(error, `GHCR manifest request for ${digest} failed`), {
      cause: error
    });
  }

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, `GHCR manifest request for ${digest} failed`));
  }

  const document = (await response.json()) as { mediaType?: string };
  const mediaType = document.mediaType ?? resolveJsonHeaders(response);
  if (!mediaType) {
    throw new Error(`manifest response for ${digest} did not include a media type`);
  }

  return {
    digest,
    mediaType,
    rawJson: JSON.stringify(document)
  };
}

export async function putRegistryManifestForTag(
  owner: string,
  packageName: string,
  tag: string,
  mediaType: string,
  manifestJson: string,
  registryToken: string,
  logger: DeleteExecutionLogger,
  runtime?: {
    fetchImpl?: GitHubPackageFetch;
  }
): Promise<string> {
  const fetchImpl = resolveFetch(runtime?.fetchImpl);
  const url = new URL(`/v2/${owner}/${packageName}/manifests/${encodeURIComponent(tag)}`, ghcrRegistryBaseUrl);

  let response;
  try {
    response = await runWithRetry(`GHCR manifest put request for tag ${tag}`, logger, async () => {
      const putResponse = await fetchImpl(url.toString(), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${registryToken}`,
          "Content-Type": mediaType,
          "User-Agent": "ghcr-cleanup-manager"
        },
        body: manifestJson
      });
      if (!putResponse.ok && isRetryableStatus(putResponse.status)) {
        throw new Error(await buildHttpErrorMessage(putResponse, `GHCR manifest put request for tag ${tag} failed`));
      }
      return putResponse;
    });
  } catch (error) {
    throw new Error(buildTransportErrorMessage(error, `GHCR manifest put request for tag ${tag} failed`), {
      cause: error
    });
  }

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, `GHCR manifest put request for tag ${tag} failed`));
  }

  return `sha256:${createHash("sha256").update(manifestJson).digest("hex")}`;
}
