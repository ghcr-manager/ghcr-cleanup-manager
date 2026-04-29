import { ScanWriter, SnapshotRepository } from "../../db/index.js";
import { ingestManifests } from "./_manifest-ingest.js";
import { ingestPackageVersions } from "./_packages-client.js";
import { defaultFetch, type GitHubScanOptions } from "./_shared.js";

export { type GitHubScanOptions } from "./_shared.js";

export async function importGitHubScan(
  options: GitHubScanOptions,
  writer: ScanWriter,
  repository: SnapshotRepository,
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const githubApiBaseUrl = options.githubApiBaseUrl ?? "https://api.github.com";
  const registryBaseUrl = options.registryBaseUrl ?? "https://ghcr.io";
  const scanStartedAt = new Date().toISOString();
  const packageName = `${options.owner}/${options.packageName}`;
  const logger = options.logger;

  writer.resetScan(packageName, scanStartedAt);
  const scanId = writer.getActiveScanId();
  logger?.info(`Starting GitHub package scan for ${packageName}`);
  try {
    const counts = await ingestPackageVersions(fetchImpl, githubApiBaseUrl, options, writer);
    logger?.info(`Loaded ${counts.packageVersions} package versions and ${counts.tags} tags`);
    await ingestManifests(fetchImpl, registryBaseUrl, options, writer, repository, scanId);
    writer.markScanCompleted(new Date().toISOString());
    logger?.info(`Completed GitHub package scan for ${packageName}`);
  } catch (error) {
    writer.markScanFailed(new Date().toISOString());
    throw error;
  }
}
