import type { ManifestDescriptorRecord, ManifestEdgeRecord, ManifestRecord } from "../../core/index.js";
import { classifyManifestKind } from "./_manifest-kind.js";
import {
  acceptedManifestMediaTypes,
  buildFetchTransportErrorMessage,
  buildHttpErrorMessage,
  type FetchLike,
  type GitHubScanOptions,
  withFetchRetry
} from "./_shared.js";

interface _RegistryPlatform {
  architecture?: string;
  os?: string;
  variant?: string;
}

interface _RegistryDescriptor {
  mediaType?: string;
  digest?: string;
  artifactType?: string;
  platform?: _RegistryPlatform;
}

interface _RegistryManifestDocument {
  mediaType?: string;
  artifactType?: string;
  annotations?: Record<string, unknown>;
  config?: {
    mediaType?: string;
  };
  layers?: Array<{
    mediaType?: string;
    annotations?: Record<string, unknown>;
  }>;
  manifests?: _RegistryDescriptor[];
  subject?: {
    digest?: string;
  };
}

type _LoadedManifestRecord = Omit<ManifestRecord, "versionId">;

export async function loadManifestGraph(
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  digest: string,
  registryToken: string,
  options: GitHubScanOptions
): Promise<{
  record: _LoadedManifestRecord;
  descriptorRecords: ManifestDescriptorRecord[];
  edgeRecords: ManifestEdgeRecord[];
  rawJson: string;
}> {
  const startTime = Date.now();
  const url = new URL(`/v2/${options.owner}/${options.packageName}/manifests/${digest}`, registryBaseUrl);
  let response;
  try {
    response = await withFetchRetry(
      async () => {
        const manifestResponse = await fetchImpl(url.toString(), {
          headers: {
            Accept: acceptedManifestMediaTypes,
            Authorization: `Bearer ${registryToken}`,
            "User-Agent": "ghcr-manager"
          }
        });
        if (!manifestResponse.ok && _shouldRetryStatus(manifestResponse.status)) {
          throw new Error(await buildHttpErrorMessage(manifestResponse, `GHCR manifest request for ${digest} failed`));
        }
        return manifestResponse;
      },
      {
        logger: options.logger,
        label: `GHCR manifest request for ${digest}`,
        shouldRetry: (error) => _shouldRetryError(error)
      }
    );
  } catch (error) {
    throw new Error(buildFetchTransportErrorMessage(error, `GHCR manifest request for ${digest} failed`), {
      cause: error
    });
  }

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage(response, `GHCR manifest request for ${digest} failed`));
  }

  const mediaTypeHeader = response.headers.get("content-type")?.split(";")[0];
  const document = (await response.json()) as _RegistryManifestDocument;
  const rawJson = JSON.stringify(document);
  const mediaType = document.mediaType ?? mediaTypeHeader;
  if (!mediaType) {
    throw new Error(`manifest response for ${digest} did not include a media type`);
  }
  options.logger.debug(`Loaded GHCR manifest ${digest} in ${Date.now() - startTime}ms (${mediaType})`);

  return {
    rawJson,
    record: {
      digest,
      manifestKind: classifyManifestKind(document),
      mediaType,
      artifactType: document.artifactType,
      configMediaType: document.config?.mediaType,
      subjectDigest: document.subject?.digest,
      annotations: document.annotations
    },
    ...buildManifestRelations(digest, rawJson)
  };
}

export function buildManifestRelations(
  digest: string,
  rawJson: string
): {
  descriptorRecords: ManifestDescriptorRecord[];
  edgeRecords: ManifestEdgeRecord[];
} {
  const document = JSON.parse(rawJson) as _RegistryManifestDocument;

  return {
    descriptorRecords: _buildDescriptorRecords(digest, document),
    edgeRecords: _buildEdges(digest, document)
  };
}

function _buildDescriptorRecords(
  parentDigest: string,
  document: _RegistryManifestDocument
): ManifestDescriptorRecord[] {
  const records: ManifestDescriptorRecord[] = [];
  for (const child of document.manifests ?? []) {
    if (!child.digest || !child.mediaType) {
      continue;
    }

    records.push({
      parentDigest,
      childDigest: child.digest,
      mediaType: child.mediaType,
      artifactType: child.artifactType,
      platform: child.platform
    });
  }
  return records;
}

function _buildEdges(parentDigest: string, document: _RegistryManifestDocument): ManifestEdgeRecord[] {
  const edges: ManifestEdgeRecord[] = [];

  for (const child of document.manifests ?? []) {
    if (!child.digest || !child.mediaType) {
      continue;
    }

    edges.push({
      parentDigest,
      childDigest: child.digest,
      edgeKind: "image-child"
    });
  }

  if (document.subject?.digest) {
    edges.push({
      parentDigest: document.subject.digest,
      childDigest: parentDigest,
      edgeKind: "referrer"
    });
  }

  return edges;
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
