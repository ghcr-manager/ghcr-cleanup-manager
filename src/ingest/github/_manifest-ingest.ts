import type { ManifestEdgeRecord } from "../../core/index.js";
import type { ScanWriter, SnapshotRepository } from "../../db/index.js";
import { manifestFetchConcurrency } from "../../tuning/index.js";
import { loadManifestGraph } from "./_manifest-client.js";
import { loadRegistryPullToken, type RegistryPullToken } from "./_registry-token-client.js";
import { type FetchLike, type GitHubScanOptions } from "./_shared.js";

interface _RegistryPullTokenState {
  token?: RegistryPullToken;
  load?: Promise<RegistryPullToken>;
}

export async function ingestManifests(
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
  writer: ScanWriter,
  repository: SnapshotRepository,
  scanId: number,
): Promise<void> {
  const pendingDigests = repository.listPackageVersionDigests(scanId);
  const queuedDigests = new Set(pendingDigests);
  const fetchedDigests = new Set<string>();
  const registryPullTokenState: _RegistryPullTokenState = {};
  options.logger?.info(`Fetching manifests for ${pendingDigests.length} package versions`);
  let completed = 0;
  const edgeRecords: ManifestEdgeRecord[] = [];
  const activeLoads = new Set<Promise<void>>();

  while (pendingDigests.length > 0 || activeLoads.size > 0) {
    while (pendingDigests.length > 0 && activeLoads.size < manifestFetchConcurrency) {
      const digest = pendingDigests.shift();
      if (!digest || fetchedDigests.has(digest)) {
        continue;
      }

      const load = _loadQueuedManifest(
        digest,
        fetchImpl,
        registryBaseUrl,
        options,
        writer,
        pendingDigests,
        queuedDigests,
        fetchedDigests,
        edgeRecords,
        completed,
        async () => (await _getRegistryPullToken(fetchImpl, registryBaseUrl, options, registryPullTokenState)).token,
        () => {
          completed += 1;
          if (pendingDigests.length === 0 || completed % 25 === 0) {
            options.logger?.info(`Fetched manifests ${completed}/${queuedDigests.size}`);
          }
        },
      ).finally(() => {
        activeLoads.delete(load);
      });
      activeLoads.add(load);
    }

    if (activeLoads.size > 0) {
      await Promise.race(activeLoads);
    }
  }

  for (const edge of edgeRecords) {
    writer.insertManifestEdge(edge);
  }
  writer.rebuildManifestReachability();
}

async function _loadQueuedManifest(
  digest: string,
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
  writer: ScanWriter,
  pendingDigests: string[],
  queuedDigests: Set<string>,
  fetchedDigests: Set<string>,
  edgeRecords: ManifestEdgeRecord[],
  completed: number,
  getRegistryToken: () => Promise<string>,
  onComplete: () => void,
): Promise<void> {
  options.logger?.debug(`Fetching manifest ${completed + 1}/${queuedDigests.size}: ${digest}`);
  const manifest = await loadManifestGraph(fetchImpl, registryBaseUrl, digest, await getRegistryToken(), options);
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
  onComplete();
}

async function _getRegistryPullToken(
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
  registryPullTokenState: _RegistryPullTokenState,
): Promise<RegistryPullToken> {
  if (registryPullTokenState.token && Date.now() < registryPullTokenState.token.expiresAt - 5000) {
    return registryPullTokenState.token;
  }

  if (!registryPullTokenState.load) {
    registryPullTokenState.load = loadRegistryPullToken(fetchImpl, registryBaseUrl, options).finally(() => {
      registryPullTokenState.load = undefined;
    });
  }

  const registryPullToken = await registryPullTokenState.load;
  registryPullTokenState.token = registryPullToken;
  return registryPullToken;
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
