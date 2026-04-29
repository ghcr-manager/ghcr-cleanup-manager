import type { ManifestEdgeRecord } from "../../core/index.js";
import type { ScanWriter, SnapshotRepository } from "../../db/index.js";
import { manifestFetchConcurrency, manifestIngestProgressStepRatio } from "../../tuning/index.js";
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
  scanId: number
): Promise<void> {
  const pendingDigests = repository.listPackageVersionDigests(scanId);
  const initialDigestCount = pendingDigests.length;
  const progressStep = Math.max(1, Math.ceil(initialDigestCount * manifestIngestProgressStepRatio));
  const queuedDigests = new Set(pendingDigests);
  const fetchedDigests = new Set<string>();
  const persistedDigests = new Set<string>();
  const registryPullTokenState: _RegistryPullTokenState = {};
  options.logger.info(`Fetching manifests for ${pendingDigests.length} package versions`);
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
        persistedDigests,
        edgeRecords,
        completed,
        async () => (await _getRegistryPullToken(fetchImpl, registryBaseUrl, options, registryPullTokenState)).token,
        () => {
          completed += 1;
          if (completed % progressStep === 0 || pendingDigests.length === 0) {
            options.logger.info(`Fetched manifests ${completed}/${queuedDigests.size}`);
          }
        }
      ).finally(() => {
        activeLoads.delete(load);
      });
      activeLoads.add(load);
    }

    if (activeLoads.size > 0) {
      await Promise.race(activeLoads);
    }
  }

  options.logger.info(`Starting manifest graph processing for ${edgeRecords.length} edges`);
  let persistedEdgeCount = 0;
  for (const edge of edgeRecords) {
    if (!persistedDigests.has(edge.parentDigest) || !persistedDigests.has(edge.childDigest)) {
      continue;
    }
    writer.insertManifestEdge(edge);
    persistedEdgeCount += 1;
  }
  options.logger.info(`Inserted ${persistedEdgeCount} manifest edges; rebuilding reachability`);
  writer.rebuildManifestReachability();
  options.logger.info("Completed manifest graph processing");
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
  persistedDigests: Set<string>,
  edgeRecords: ManifestEdgeRecord[],
  completed: number,
  getRegistryToken: () => Promise<string>,
  onComplete: () => void
): Promise<void> {
  options.logger.debug(`Fetching manifest ${completed + 1}/${queuedDigests.size}: ${digest}`);
  let manifest;
  try {
    manifest = await loadManifestGraph(fetchImpl, registryBaseUrl, digest, await getRegistryToken(), options);
  } catch (error) {
    if (_isMissingManifestError(error)) {
      options.logger.warn(`Skipping missing GHCR manifest ${digest}`);
      fetchedDigests.add(digest);
      onComplete();
      return;
    }

    throw error;
  }
  writer.insertManifest(manifest.record);
  persistedDigests.add(manifest.record.digest);
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

function _isMissingManifestError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /GHCR manifest request .* failed - status 404/.test(error.message);
}

async function _getRegistryPullToken(
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
  registryPullTokenState: _RegistryPullTokenState
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
  fetchedDigests: Set<string>
): void {
  if (queuedDigests.has(digest) || fetchedDigests.has(digest)) {
    return;
  }

  pendingDigests.push(digest);
  queuedDigests.add(digest);
}
