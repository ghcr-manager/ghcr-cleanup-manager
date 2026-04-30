import { ScanWriter, SnapshotRepository } from "../../db/index.js";
import { ingestManifests } from "./_manifest-ingest.js";
import { ingestPackageVersions } from "./_packages-client.js";
import { defaultFetch, type FetchLike, type GitHubScanOptions } from "./_shared.js";

export { type GitHubScanOptions } from "./_shared.js";

const _GITHUB_API_BASE_URL = "https://api.github.com";
const _REGISTRY_BASE_URL = "https://ghcr.io";

interface _GitHubScanRuntime {
  fetchImpl?: FetchLike;
}

export async function importGitHubScan(
  options: GitHubScanOptions,
  writer: ScanWriter,
  repository: SnapshotRepository,
  runtime?: _GitHubScanRuntime
): Promise<void> {
  const fetchImpl = runtime?.fetchImpl ?? defaultFetch;
  const scanStartedAt = new Date().toISOString();
  const fullPackageName = `${options.owner}/${options.packageName}`;

  writer.resetScan(options.owner, options.packageName, scanStartedAt);
  const scanId = writer.getActiveScanId();
  options.logger.info(`Starting GitHub package scan for ${fullPackageName}`);
  try {
    options.logger.info(`Starting remote data pull for ${fullPackageName}`);
    const counts = await ingestPackageVersions(fetchImpl, _GITHUB_API_BASE_URL, options, writer);
    options.logger.info(`Loaded ${counts.packageVersions} package versions and ${counts.tags} tags`);
    await ingestManifests(fetchImpl, _REGISTRY_BASE_URL, options, writer, repository, scanId);
    options.logger.info(`Completed remote data pull for ${fullPackageName}`);
    writer.markScanCompleted(new Date().toISOString());
    options.logger.info(`Completed GitHub package scan for ${fullPackageName}`);
  } catch (error) {
    writer.markScanFailed(new Date().toISOString());
    throw error;
  }
}
