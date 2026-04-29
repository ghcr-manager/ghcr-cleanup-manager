import type { ManifestDescriptorRecord, ManifestEdgeRecord, ManifestRecord } from "../../core/index.js";
import { loadRegistryPullToken } from "./_registry-token-client.js";
import {
  acceptedManifestMediaTypes,
  buildHttpErrorMessage,
  type FetchLike,
  type GitHubScanOptions,
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
  manifests?: _RegistryDescriptor[];
  subject?: {
    digest?: string;
  };
}

export async function loadManifestGraph(
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  digest: string,
  options: GitHubScanOptions,
): Promise<{
  record: ManifestRecord;
  descriptorRecords: ManifestDescriptorRecord[];
  edgeRecords: ManifestEdgeRecord[];
  rawJson: string;
}> {
  const url = new URL(`/v2/${options.owner}/${options.packageName}/manifests/${digest}`, registryBaseUrl);
  const registryToken = await loadRegistryPullToken(fetchImpl, registryBaseUrl, options);
  const response = await fetchImpl(url.toString(), {
    headers: {
      Accept: acceptedManifestMediaTypes,
      Authorization: `Bearer ${registryToken}`,
      "User-Agent": "ghcr-manager",
    },
  });
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

  return {
    rawJson,
    record: {
      digest,
      mediaType,
      artifactType: document.artifactType,
      configMediaType: document.config?.mediaType,
      subjectDigest: document.subject?.digest,
      annotations: document.annotations,
    },
    descriptorRecords: _buildDescriptorRecords(digest, document),
    edgeRecords: _buildEdges(digest, document),
  };
}

function _buildDescriptorRecords(
  parentDigest: string,
  document: _RegistryManifestDocument,
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
      platform: child.platform,
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
      edgeKind: "image-child",
    });
  }

  if (document.subject?.digest) {
    edges.push({
      parentDigest: document.subject.digest,
      childDigest: parentDigest,
      edgeKind: "referrer",
    });
  }

  return edges;
}
