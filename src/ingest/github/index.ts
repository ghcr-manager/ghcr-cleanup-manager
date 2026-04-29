import { ScanWriter, SnapshotRepository } from "../../db/index.js";
import type { ManifestEdgeRecord } from "../../core/index.js";
import { loadManifestGraph } from "./_manifest-client.js";
import { ingestPackageVersions } from "./_packages-client.js";
import { loadRegistryPullToken, type RegistryPullToken } from "./_registry-token-client.js";
import { defaultFetch, type FetchLike, type GitHubScanOptions } from "./_shared.js";

export { type GitHubScanOptions } from "./_shared.js";

export async function importGitHubScan(
  options: GitHubScanOptions,
  writer: ScanWriter,
  repository: SnapshotRepository,
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const githubApiBaseUrl = options.githubApiBaseUrl ?? "https://api.github.com";
  const registryBaseUrl = options.registryBaseUrl ?? "https://ghcr.io";
  const scannedAt = new Date().toISOString();
  const packageName = `${options.owner}/${options.packageName}`;
  const logger = options.logger;

  writer.resetScan(packageName, scannedAt);
  logger?.info(`Starting GitHub package scan for ${packageName}`);

  const counts = await ingestPackageVersions(fetchImpl, githubApiBaseUrl, options, writer);
  logger?.info(`Loaded ${counts.packageVersions} package versions and ${counts.tags} tags`);

  const pendingDigests = repository.listPackageVersionDigests();
  const queuedDigests = new Set(pendingDigests);
  const fetchedDigests = new Set<string>();
  let registryPullToken: RegistryPullToken | undefined;
  logger?.info(`Fetching manifests for ${pendingDigests.length} package versions`);
  let completed = 0;
  const edgeRecords: ManifestEdgeRecord[] = [];
  while (pendingDigests.length > 0) {
    const digest = pendingDigests.shift();
    if (!digest || fetchedDigests.has(digest)) {
      continue;
    }

    logger?.debug(`Fetching manifest ${completed + 1}/${queuedDigests.size}: ${digest}`);
    registryPullToken = await _refreshRegistryTokenCache(fetchImpl, registryBaseUrl, options, registryPullToken);
    const manifest = await loadManifestGraph(fetchImpl, registryBaseUrl, digest, registryPullToken.token, options);
    writer.insertManifest(manifest.record);
    writer.insertManifestPayload(manifest.record.digest, manifest.rawJson);
    for (const descriptor of manifest.descriptorRecords) {
      writer.insertManifestDescriptor(descriptor);
      _enqueueDigest(descriptor.childDigest, pendingDigests, queuedDigests, fetchedDigests);
    }
    edgeRecords.push(...manifest.edgeRecords);
    for (const edge of manifest.edgeRecords) {
      _enqueueDigest(edge.parentDigest, pendingDigests, queuedDigests, fetchedDigests);
      _enqueueDigest(edge.childDigest, pendingDigests, queuedDigests, fetchedDigests);
    }
    fetchedDigests.add(digest);
    completed += 1;
    if (pendingDigests.length === 0 || completed % 25 === 0) {
      logger?.info(`Fetched manifests ${completed}/${queuedDigests.size}`);
    }
  }
  for (const edge of edgeRecords) {
    writer.insertManifestEdge(edge);
  }
  writer.rebuildManifestReachability();
  logger?.info(`Completed GitHub package scan for ${packageName}`);
}

async function _refreshRegistryTokenCache(
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
  registryPullToken: RegistryPullToken | undefined,
): Promise<RegistryPullToken> {
  if (registryPullToken && Date.now() < registryPullToken.expiresAt - 5000) {
    return registryPullToken;
  }

  return loadRegistryPullToken(fetchImpl, registryBaseUrl, options);
}

function _enqueueDigest(
  digest: string,
  pendingDigests: string[],
  queuedDigests: Set<string>,
  fetchedDigests: Set<string>,
): void {
  if (queuedDigests.has(digest) || fetchedDigests.has(digest)) {
    return;
  }

  pendingDigests.push(digest);
  queuedDigests.add(digest);
}
