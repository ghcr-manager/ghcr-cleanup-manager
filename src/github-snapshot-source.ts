import type { ManifestEdgeRecord, ManifestRecord, PackageSnapshot, PackageVersionRecord, TagRecord } from "./types.js";

interface _GitHubPackageVersion {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    container?: {
      tags?: string[];
    };
  };
}

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
  manifests?: _RegistryDescriptor[];
  subject?: {
    digest?: string;
  };
  config?: {
    digest?: string;
  };
}

interface _FetchLikeResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json(): Promise<unknown>;
}

type _FetchLike = (input: string, init?: RequestInit) => Promise<_FetchLikeResponse>;

const _acceptedManifestMediaTypes = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.artifact.manifest.v1+json",
].join(", ");

interface GitHubScanOptions {
  owner: string;
  packageName: string;
  token: string;
  githubApiBaseUrl?: string;
  registryBaseUrl?: string;
  username?: string;
  fetchImpl?: _FetchLike;
}

export async function loadSnapshotFromGitHub(options: GitHubScanOptions): Promise<PackageSnapshot> {
  const fetchImpl = options.fetchImpl ?? _defaultFetch;
  const githubApiBaseUrl = options.githubApiBaseUrl ?? "https://api.github.com";
  const registryBaseUrl = options.registryBaseUrl ?? "https://ghcr.io";
  const scannedAt = new Date().toISOString();
  const packageVersions = await _loadPackageVersions(fetchImpl, githubApiBaseUrl, options);

  const tags = _buildTags(packageVersions);
  const manifestsByDigest = new Map<string, ManifestRecord>();
  const edges: ManifestEdgeRecord[] = [];

  for (const version of packageVersions) {
    const manifest = await _loadManifest(fetchImpl, registryBaseUrl, version.digest, options);
    manifestsByDigest.set(version.digest, manifest.record);
    for (const child of manifest.childRecords) {
      manifestsByDigest.set(child.digest, child);
    }
    edges.push(...manifest.edgeRecords);
  }

  return {
    packageName: `${options.owner}/${options.packageName}`,
    scannedAt,
    packageVersions,
    tags,
    manifests: [...manifestsByDigest.values()].sort((left, right) => left.digest.localeCompare(right.digest)),
    manifestEdges: _deduplicateEdges(edges),
  };
}

async function _loadPackageVersions(
  fetchImpl: _FetchLike,
  githubApiBaseUrl: string,
  options: GitHubScanOptions,
): Promise<PackageVersionRecord[]> {
  const versions: PackageVersionRecord[] = [];

  for (let page = 1; ; page += 1) {
    const url = new URL(
      `/orgs/${encodeURIComponent(options.owner)}/packages/container/${encodeURIComponent(options.packageName)}/versions`,
      githubApiBaseUrl,
    );
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetchImpl(url.toString(), {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "User-Agent": "ghcr-manager",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub Packages request failed with status ${response.status}`);
    }

    const pageData = (await response.json()) as _GitHubPackageVersion[];
    if (pageData.length === 0) {
      break;
    }

    for (const version of pageData) {
      versions.push({
        versionId: version.id,
        digest: version.name,
        createdAt: version.created_at,
        updatedAt: version.updated_at,
        metadata: version.metadata as Record<string, unknown> | undefined,
      });
    }

    if (pageData.length < 100) {
      break;
    }
  }

  return versions.sort((left, right) => left.versionId - right.versionId);
}

function _buildTags(packageVersions: PackageVersionRecord[]): TagRecord[] {
  const tags: TagRecord[] = [];

  for (const version of packageVersions) {
    const tagNames = _readTagNames(version.metadata);
    for (const tagName of tagNames) {
      tags.push({
        tag: tagName,
        digest: version.digest,
        versionId: version.versionId,
      });
    }
  }

  return tags.sort((left, right) => left.tag.localeCompare(right.tag));
}

async function _loadManifest(
  fetchImpl: _FetchLike,
  registryBaseUrl: string,
  digest: string,
  options: GitHubScanOptions,
): Promise<{ record: ManifestRecord; childRecords: ManifestRecord[]; edgeRecords: ManifestEdgeRecord[] }> {
  const url = new URL(`/v2/${options.owner}/${options.packageName}/manifests/${digest}`, registryBaseUrl);
  const basicAuth = Buffer.from(`${options.username ?? options.owner}:${options.token}`).toString("base64");
  const response = await fetchImpl(url.toString(), {
    headers: {
      Accept: _acceptedManifestMediaTypes,
      Authorization: `Basic ${basicAuth}`,
      "User-Agent": "ghcr-manager",
    },
  });
  if (!response.ok) {
    throw new Error(`GHCR manifest request for ${digest} failed with status ${response.status}`);
  }

  const mediaTypeHeader = response.headers.get("content-type")?.split(";")[0];
  const document = (await response.json()) as _RegistryManifestDocument;
  const mediaType = document.mediaType ?? mediaTypeHeader;
  if (!mediaType) {
    throw new Error(`manifest response for ${digest} did not include a media type`);
  }

  const record: ManifestRecord = {
    digest,
    mediaType,
    artifactType: document.artifactType,
  };
  const childRecords: ManifestRecord[] = [];
  const edgeRecords: ManifestEdgeRecord[] = [];

  for (const child of document.manifests ?? []) {
    if (!child.digest || !child.mediaType) {
      continue;
    }

    childRecords.push({
      digest: child.digest,
      mediaType: child.mediaType,
      artifactType: child.artifactType,
      platform: child.platform,
    });
    edgeRecords.push({
      parentDigest: digest,
      childDigest: child.digest,
      edgeKind: "image-child",
    });
  }

  if (document.subject?.digest) {
    edgeRecords.push({
      parentDigest: document.subject.digest,
      childDigest: digest,
      edgeKind: "referrer",
    });
  }

  return {
    record,
    childRecords,
    edgeRecords,
  };
}

function _readTagNames(metadata: Record<string, unknown> | undefined): string[] {
  const container = metadata?.container;
  if (!container || typeof container !== "object") {
    return [];
  }

  const tags = (container as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.filter((tag): tag is string => typeof tag === "string");
}

function _deduplicateEdges(edges: ManifestEdgeRecord[]): ManifestEdgeRecord[] {
  const keyedEdges = new Map<string, ManifestEdgeRecord>();
  for (const edge of edges) {
    const key = `${edge.parentDigest} ${edge.childDigest} ${edge.edgeKind}`;
    keyedEdges.set(key, edge);
  }

  return [...keyedEdges.values()].sort((left, right) => {
    const leftKey = `${left.parentDigest} ${left.childDigest} ${left.edgeKind}`;
    const rightKey = `${right.parentDigest} ${right.childDigest} ${right.edgeKind}`;
    return leftKey.localeCompare(rightKey);
  });
}

async function _defaultFetch(input: string, init?: RequestInit): Promise<_FetchLikeResponse> {
  return fetch(input, init);
}
