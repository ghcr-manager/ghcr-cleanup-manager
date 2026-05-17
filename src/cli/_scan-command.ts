import { ScanWriter, SnapshotRepository, openDatabase } from "../db/index.js";
import { importGitHubScan } from "../ingest/github/index.js";
import { findOption, hasFlag, requireOption, resolveGitHubToken, resolveLogLevel } from "./_args.js";
import { writeGitHubScanOutputs } from "./_github-output.js";
import { createLogger } from "./_logger.js";
import { runScanArtifactUploadPreflight } from "./_scan-artifact-upload-preflight.js";

export async function handleScan(args: string[]): Promise<number> {
  const databasePath = requireOption(args, "--db");
  const owner = requireOption(args, "--owner");
  const packageName = requireOption(args, "--package");
  const githubOutputPath = findOption(args, "--github-output");
  const uploadIntended = hasFlag(args, "--db-artifact-upload-intended");
  const token = resolveGitHubToken(args);
  const logger = createLogger(resolveLogLevel(args));
  const database = openDatabase(databasePath);
  const repository = new SnapshotRepository(database);
  const writer = new ScanWriter(database);
  const preflight = await runScanArtifactUploadPreflight(repository, {
    owner,
    packageName,
    token,
    logger,
    uploadIntended
  });
  await importGitHubScan(
    {
      owner,
      packageName,
      token,
      logger
    },
    writer,
    repository,
    {
      packageMetadata: preflight.isPublic !== undefined ? { isPublic: preflight.isPublic } : undefined
    }
  );
  const scanId = writer.getActiveScanId();
  const metadata = repository.getPackageMetadata(scanId);
  const summary = {
    owner: metadata.owner,
    packageName: metadata.packageName,
    isPublic: metadata.isPublic,
    scanCompletedAt: metadata.scanCompletedAt,
    packageVersions: repository.countPackageVersions(scanId),
    tags: repository.countTags(scanId),
    manifests: repository.countManifests(scanId),
    manifestEdges: repository.countManifestEdges(scanId)
  };
  if (githubOutputPath) {
    writeGitHubScanOutputs(githubOutputPath, summary);
  }
  console.log(JSON.stringify(summary, null, 2));

  database.close();
  return 0;
}
