import { type SnapshotRepository } from "../db/index.js";
import { defaultFetch, type FetchLike, type GitHubScanLogger, loadPackageMetadata } from "../ingest/github/index.js";

const _PASSPHRASE_ENV = "GHCR_MANAGER_DB_ARTIFACT_ENCRYPTION_PASSPHRASE";
const _ENCRYPTION_REQUIRED_ERROR =
  "Refusing to upload DB artifact for a non-public registry without encryption. Provide db-artifact-encryption-passphrase to encrypt the uploaded artifact.";
const _GITHUB_API_BASE_URL = "https://api.github.com";

export interface ScanArtifactUploadPreflightOptions {
  owner: string;
  packageName: string;
  token: string;
  logger: GitHubScanLogger;
  uploadIntended: boolean;
}

export async function runScanArtifactUploadPreflight(
  repository: SnapshotRepository,
  options: ScanArtifactUploadPreflightOptions,
  fetchImpl: FetchLike = defaultFetch
): Promise<{ isPublic?: boolean }> {
  if (!options.uploadIntended) {
    return {};
  }
  if ((process.env[_PASSPHRASE_ENV] ?? "").length > 0) {
    return {};
  }

  if (repository.hasAnyNonPublicPackageScan(options.owner, options.packageName)) {
    throw new Error(_ENCRYPTION_REQUIRED_ERROR);
  }

  options.logger.info(
    `Checking GitHub package visibility before DB artifact upload for ${options.owner}/${options.packageName}`
  );
  const packageMetadata = await loadPackageMetadata(fetchImpl, _GITHUB_API_BASE_URL, options);
  if (!packageMetadata.isPublic) {
    throw new Error(_ENCRYPTION_REQUIRED_ERROR);
  }

  return { isPublic: true };
}
