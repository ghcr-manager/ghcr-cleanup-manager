import { ScanWriter, SnapshotRepository, openDatabase } from "../db/index.js";
import { importGitHubScan } from "../ingest/github/index.js";
import { requireOption, resolveGitHubToken, resolveLogLevel } from "./_args.js";
import { createLogger } from "./_logger.js";

export async function handleScan(args: string[]): Promise<number> {
  const databasePath = requireOption(args, "--db");
  const owner = requireOption(args, "--owner");
  const packageName = requireOption(args, "--package");
  const logger = createLogger(resolveLogLevel(args));
  const database = openDatabase(databasePath);
  const repository = new SnapshotRepository(database);
  const writer = new ScanWriter(database);
  await importGitHubScan(
    {
      owner,
      packageName,
      token: resolveGitHubToken(args),
      logger
    },
    writer,
    repository
  );
  const scanId = writer.getActiveScanId();
  const metadata = repository.getPackageMetadata(scanId);
  console.log(
    JSON.stringify(
      {
        owner: metadata.owner,
        packageName: metadata.packageName,
        scanCompletedAt: metadata.scanCompletedAt,
        packageVersions: repository.countPackageVersions(scanId),
        tags: repository.countTags(scanId),
        manifests: repository.countManifests(scanId),
        manifestEdges: repository.countManifestEdges(scanId)
      },
      null,
      2
    )
  );

  database.close();
  return 0;
}
