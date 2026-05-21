import { buildCleanupSummary } from "../cleanup-summary/index.js";
import { CleanupRunWriter, openDatabase, PlannerRepository } from "../db/index.js";
import { executeDeletePlan } from "../execute/index.js";
import { hasFlag, resolveLogLevel, resolveToken } from "./_args.js";
import { createLogger } from "./_logger.js";
import { loadDeletePlan, resolvePlanCommandInputs } from "./_planner-options.js";
import { resolveTagSelectors } from "./_tag-selector-resolver.js";

export async function handleCleanup(args: string[]): Promise<number> {
  const inputs = resolvePlanCommandInputs(args);
  const dryRun = hasFlag(args, "--dry-run");
  const token = dryRun ? undefined : resolveToken(args);
  const logger = createLogger(resolveLogLevel(args));
  const database = openDatabase(inputs.databasePath);
  try {
    const repository = new PlannerRepository(database, logger);
    const cleanupRunWriter = new CleanupRunWriter(database);
    const scanId = repository.getLatestCompletedScanId(inputs.owner, inputs.packageName);
    logger.debug(`Starting cleanup for ${inputs.owner}/${inputs.packageName}`);
    const plan = loadDeletePlan(repository, resolveTagSelectors(database, inputs));
    cleanupRunWriter.persistCleanupRun(scanId, plan, {
      dryRun,
      cleanupStartedAt: new Date().toISOString()
    });
    if (dryRun) {
      const summary = buildCleanupSummary(plan, {
        dryRun: true,
        listRootTags: (versionId) => _listRootTags(database, inputs.owner, inputs.packageName, versionId),
        listAffectedManifestDigests: (rootDigests) => _listAffectedManifestDigests(database, scanId, rootDigests)
      });
      logger.debug(`Completed dry-run cleanup for ${inputs.owner}/${inputs.packageName}`);
      console.log(JSON.stringify(summary));
      return 0;
    }

    const executionSummary = await executeDeletePlan(plan, {
      token: token as string,
      logger,
      listRootTags: (root) => _listRootTags(database, root.owner, root.packageName, root.versionId)
    });
    const summary = buildCleanupSummary(plan, {
      dryRun: false,
      listRootTags: (versionId) => _listRootTags(database, inputs.owner, inputs.packageName, versionId),
      listAffectedManifestDigests: (rootDigests) => _listAffectedManifestDigests(database, scanId, rootDigests),
      executionSummary
    });
    logger.debug(`Completed cleanup for ${inputs.owner}/${inputs.packageName}`);
    console.log(JSON.stringify(summary));
    return 0;
  } finally {
    database.close();
  }
}

function _listAffectedManifestDigests(
  database: ReturnType<typeof openDatabase>,
  scanId: number,
  rootDigests: string[]
): string[] {
  if (rootDigests.length === 0) {
    return [];
  }

  const placeholders = rootDigests.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `
        SELECT DISTINCT descendant_digest AS digest
        FROM manifest_reachability
        WHERE scan_id = ?
          AND ancestor_digest IN (${placeholders})
        ORDER BY descendant_digest
      `
    )
    .all(scanId, ...rootDigests) as Array<{ digest: string }>;

  return rows.map((row) => row.digest);
}

function _listRootTags(
  database: ReturnType<typeof openDatabase>,
  owner: string,
  packageName: string,
  versionId: number
): string[] {
  const rows = database
    .prepare(
      `
        SELECT tags.tag
        FROM tags
        INNER JOIN v_latest_scan_per_package latest_scan ON latest_scan.scan_id = tags.scan_id
        WHERE latest_scan.owner = ?
          AND latest_scan.package_name = ?
          AND tags.version_id = ?
        ORDER BY tags.tag
      `
    )
    .all(owner, packageName, versionId) as Array<{ tag: string }>;

  return rows.map((row) => row.tag);
}
