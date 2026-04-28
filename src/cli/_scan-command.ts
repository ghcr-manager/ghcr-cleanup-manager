import { ScanWriter, SnapshotRepository, openDatabase } from "../db/index.js";
import { importFileScan } from "../ingest/file/index.js";
import { importGitHubScan } from "../ingest/github/index.js";
import { findOption, requireOption, resolveOptionalGitHubToken } from "./_args.js";

export async function handleScan(args: string[]): Promise<number> {
  const databasePath = requireOption(args, "--db");
  const database = openDatabase(databasePath);
  const repository = new SnapshotRepository(database);
  const writer = new ScanWriter(database);
  await _importScan(args, writer, repository);
  const metadata = repository.getPackageMetadata();
  console.log(
    JSON.stringify(
      {
        packageName: metadata.packageName,
        scannedAt: metadata.scannedAt,
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

async function _importScan(args: string[], writer: ScanWriter, repository: SnapshotRepository) {
  const source = findOption(args, "--source") ?? "file";
  switch (source) {
    case "file":
      return importFileScan(requireOption(args, "--snapshot"), writer);
    case "github":
      return importGitHubScan(
        {
          owner: requireOption(args, "--owner"),
          packageName: requireOption(args, "--package"),
          token: resolveOptionalGitHubToken(args),
        },
        writer,
        repository,
      );
    default:
      throw new Error(`unknown scan source: ${source}`);
  }
}
