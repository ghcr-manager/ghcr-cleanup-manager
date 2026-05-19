import { ghcrRegistryBaseUrl } from "../../core/index.js";
import { ScanWriter, SnapshotRepository } from "../../db/index.js";
import { ingestManifests } from "./_manifest-ingest.js";
import { loadPackageMetadata, type GitHubPackageMetadata } from "./_package-metadata-load.js";
import { ingestPackageVersions } from "./_packages-client.js";
import { defaultFetch, type FetchLike, type GitHubScanOptions } from "./_shared.js";

export { type GitHubScanOptions } from "./_shared.js";
export { loadPackageMetadata, type GitHubPackageMetadata } from "./_package-metadata-load.js";
export { defaultFetch, type FetchLike, type GitHubScanLogger } from "./_shared.js";

interface _GitHubScanRuntime {
  fetchImpl?: FetchLike;
  packageMetadata?: GitHubPackageMetadata;
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
  const packageMetadata = runtime?.packageMetadata ?? (await loadPackageMetadata(fetchImpl, options));

  writer.startScan(options.owner, options.packageName, scanStartedAt, packageMetadata);
  const scanId = writer.getActiveScanId();
  options.logger.info(`Starting GitHub package scan for ${fullPackageName}`);
  try {
    options.logger.info(`Starting remote data pull for ${fullPackageName}`);
    options.logger.info(
      `Detected GitHub package visibility ${packageMetadata.isPublic ? "public" : "non-public"} for ${fullPackageName}`
    );
    const counts = await ingestPackageVersions(fetchImpl, options, writer);
    options.logger.info(`Loaded ${counts.packageVersions} package versions and ${counts.tags} tags`);
    await ingestManifests(fetchImpl, ghcrRegistryBaseUrl, options, writer, repository, scanId);
    options.logger.info(`Completed remote data pull for ${fullPackageName}`);
    writer.markScanCompleted(new Date().toISOString());
    options.logger.info(`Completed GitHub package scan for ${fullPackageName}`);
  } catch (error) {
    writer.markScanFailed(new Date().toISOString());
    throw error;
  }
}
