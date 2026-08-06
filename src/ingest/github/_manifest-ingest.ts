import type { ScanWriter, SnapshotRepository } from '../../db/index.js'
import { manifestFetchConcurrency, manifestIngestProgressStepRatio } from '../../config/index.js'
import { buildManifestRelations, loadManifestGraph } from './_manifest-client.js'
import { loadRegistryPullToken, type RegistryPullToken } from './_registry-token-client.js'
import { type FetchLike, type GitHubScanOptions } from './_shared.js'

interface _ManifestRef {
  versionId: number
  digest: string
}

interface _RegistryPullTokenState {
  token?: RegistryPullToken
  load?: Promise<RegistryPullToken>
}

export async function ingestManifests (
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
  writer: ScanWriter,
  repository: SnapshotRepository,
  scanId: number
): Promise<void> {
  const manifests = repository.listPackageVersionManifestRefs(scanId)
  const totalDigestCount = manifests.length
  const progressStep = Math.max(1, Math.ceil(totalDigestCount * manifestIngestProgressStepRatio))
  const registryPullTokenState: _RegistryPullTokenState = {}
  options.logger.info(`Fetching manifests for ${totalDigestCount} package versions`)
  let completed = 0
  let nextManifestIndex = 0
  const activeLoads = new Set<Promise<void>>()

  while (nextManifestIndex < manifests.length || activeLoads.size > 0) {
    while (nextManifestIndex < manifests.length && activeLoads.size < manifestFetchConcurrency) {
      const load = _fetchManifest(
        manifests[nextManifestIndex],
        fetchImpl,
        registryBaseUrl,
        options,
        writer,
        completed,
        async () => (await _getRegistryPullToken(fetchImpl, registryBaseUrl, options, registryPullTokenState)).token,
        () => {
          completed += 1
          if (completed % progressStep === 0 || completed === totalDigestCount) {
            options.logger.info(`Fetched manifests ${completed}/${totalDigestCount}`)
          }
        }
      ).finally(() => {
        activeLoads.delete(load)
      })
      nextManifestIndex += 1
      activeLoads.add(load)
    }

    if (activeLoads.size > 0) {
      await Promise.race(activeLoads)
    }
  }

  _processManifestPayloads(options, writer, repository, scanId)
}

async function _fetchManifest (
  manifestRef: _ManifestRef,
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
  writer: ScanWriter,
  completed: number,
  getRegistryToken: () => Promise<string>,
  onComplete: () => void
): Promise<void> {
  const { versionId, digest } = manifestRef
  options.logger.debug(`Fetching manifest ${completed + 1}: ${digest}`)
  let manifest
  try {
    manifest = await loadManifestGraph(fetchImpl, registryBaseUrl, digest, await getRegistryToken(), options)
  } catch (error) {
    if (_isMissingManifestError(error)) {
      options.logger.warn(`Skipping missing GHCR manifest ${digest}`)
      onComplete()
      return
    }

    throw error
  }
  writer.insertManifest({ versionId, ...manifest.record })
  writer.insertManifestPayload(manifest.record.digest, manifest.rawJson)
  onComplete()
}

function _processManifestPayloads (
  options: GitHubScanOptions,
  writer: ScanWriter,
  repository: SnapshotRepository,
  scanId: number
): void {
  const digests = new Set(repository.listManifestDigests(scanId))
  const payloads = repository.listManifestPayloads(scanId)
  options.logger.info(`Starting manifest graph processing for ${payloads.length} manifest payloads`)
  let persistedEdgeCount = 0

  for (const payload of payloads) {
    const relations = buildManifestRelations(payload.digest, payload.rawJson)
    for (const descriptor of relations.descriptorRecords) {
      writer.insertManifestDescriptor(descriptor)
    }
    for (const edge of relations.edgeRecords) {
      if (digests.has(edge.parentDigest) && digests.has(edge.childDigest)) {
        writer.insertManifestEdge(edge)
        persistedEdgeCount += 1
      }
    }
  }

  options.logger.info(`Inserted ${persistedEdgeCount} manifest edges; rebuilding reachability`)
  writer.rebuildManifestReachability()
  options.logger.info('Completed manifest graph processing')
}

function _isMissingManifestError (error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /GHCR manifest request .* failed - status 404/.test(error.message)
}

async function _getRegistryPullToken (
  fetchImpl: FetchLike,
  registryBaseUrl: string,
  options: GitHubScanOptions,
  registryPullTokenState: _RegistryPullTokenState
): Promise<RegistryPullToken> {
  if (registryPullTokenState.token != null && Date.now() < registryPullTokenState.token.expiresAt - 5000) {
    return registryPullTokenState.token
  }

  if (registryPullTokenState.load == null) {
    registryPullTokenState.load = loadRegistryPullToken(fetchImpl, registryBaseUrl, options).finally(() => {
      registryPullTokenState.load = undefined
    })
  }

  const registryPullToken = await registryPullTokenState.load
  registryPullTokenState.token = registryPullToken
  return registryPullToken
}
