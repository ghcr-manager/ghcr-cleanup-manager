import { ScanWriter, SnapshotRepository, openDatabase } from "../db/index.js";
import { importGitHubScan } from "../ingest/github/index.js";
import { requireOption, resolveLogLevel, resolveOptionalGitHubToken } from "./_args.js";
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
      token: resolveOptionalGitHubToken(args),
      logger,
    },
    writer,
    repository,
  );
  const metadata = repository.getPackageMetadata();
  console.log(
    JSON.stringify(
      {
        packageName: metadata.packageName,
        scanCompletedAt: metadata.scanCompletedAt,
        packageVersions: repository.countPackageVersions(),
        tags: repository.countTags(),
        manifests: repository.countManifests(),
        manifestEdges: repository.countManifestEdges(),
      },
      null,
      2,
    ),
  );

  database.close();
  return 0;
}
