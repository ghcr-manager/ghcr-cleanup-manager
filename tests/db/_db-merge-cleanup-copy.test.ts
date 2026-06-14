import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ManifestKinds } from "../../src/core/index.js";
import { DbMergeCleanupCopy } from "../../src/db/_db-merge-cleanup-copy.js";
import { CleanupRunWriter, DeletePlanValidationStatuses, ScanWriter, openDatabase } from "../../src/db/index.js";
import type { DeletePlan } from "../../src/db/index.js";

test("db merge cleanup copy lists cleanup UUIDs in local cleanup-run order", () => {
  const database = openDatabase(":memory:");
  database
    .prepare(
      `
        INSERT INTO package_scans(
          scan_uuid,
          owner,
          package_name,
          package_metadata_json,
          github_actions_run_url,
          scan_started_at,
          scan_completed_at,
          status
        )
        VALUES(
          'scan-uuid',
          'acme',
          'example',
          '{"visibility":"public"}',
          NULL,
          '2026-05-17T09:00:00.000Z',
          '2026-05-17T09:00:00.000Z',
          'completed'
        )
      `
    )
    .run();
  database
    .prepare(
      `
        INSERT INTO cleanup_runs(
          scan_id,
          cleanup_uuid,
          cleanup_started_at,
          github_actions_run_url,
          dry_run,
          planner_inputs_json,
          direct_target_tag_count,
          direct_target_root_count,
          delete_root_candidate_count,
          untag_only_root_count,
          fully_deletable_root_count,
          blocked_delete_root_count,
          protected_root_count
        )
        VALUES(1, ?, '2026-05-17T09:02:00.000Z', NULL, 1, '{}', 0, 0, 0, 0, 0, 0, 0),
              (1, ?, '2026-05-17T09:01:00.000Z', NULL, 1, '{}', 0, 0, 0, 0, 0, 0, 0)
      `
    )
    .run("cleanup-b", "cleanup-a");
  const helper = new DbMergeCleanupCopy(database);

  assert.deepEqual(helper.listCleanupUuids("cleanup_runs", 1), ["cleanup-b", "cleanup-a"]);

  database.close();
});

test("db merge cleanup copy copies selected cleanup tags with their cleanup run", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const targetDatabasePath = join(tempDirectory, "target.sqlite");
  const sourceDatabasePath = join(tempDirectory, "source.sqlite");
  _seedCleanupDatabase(targetDatabasePath, false);
  _seedCleanupDatabase(sourceDatabasePath, true);

  const targetDatabase = openDatabase(targetDatabasePath);
  const helper = new DbMergeCleanupCopy(targetDatabase);
  targetDatabase.exec(`ATTACH DATABASE '${sourceDatabasePath.replaceAll("'", "''")}' AS source_db`);

  try {
    assert.equal(helper.copyCleanupRuns("source_db", 1, 1, []), 1);
    const selectedTags = targetDatabase
      .prepare(
        `
          SELECT cleanup_run_id, tag, is_deleted
          FROM cleanup_selected_tags
          ORDER BY cleanup_run_id, tag
        `
      )
      .all() as Array<{
      cleanup_run_id: number;
      tag: string;
      is_deleted: number | null;
    }>;
    assert.deepEqual(selectedTags, [{ cleanup_run_id: 1, tag: "delete-me", is_deleted: 1 }]);
  } finally {
    targetDatabase.exec("DETACH DATABASE source_db");
    targetDatabase.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("db merge cleanup copy reuses cached statements for repeated attached cleanup copies", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const targetDatabasePath = join(tempDirectory, "target.sqlite");
  const sourceDatabasePath = join(tempDirectory, "source.sqlite");
  _seedCleanupDatabase(targetDatabasePath, false);
  _appendSeededScan(targetDatabasePath, "target-scan-2", "delete-two", "sha256:delete-root-2", false);
  _seedCleanupDatabase(sourceDatabasePath, true);
  _appendSeededScan(sourceDatabasePath, "source-scan-2", "delete-two", "sha256:delete-root-2", true);

  const targetDatabase = openDatabase(targetDatabasePath);
  const helper = new DbMergeCleanupCopy(targetDatabase);
  targetDatabase.exec(`ATTACH DATABASE '${sourceDatabasePath.replaceAll("'", "''")}' AS source_db`);

  try {
    assert.equal(helper.copyCleanupRuns("source_db", 1, 1, []), 1);
    assert.equal(helper.copyCleanupRuns("source_db", 2, 2, []), 1);
    assert.deepEqual(helper.listCleanupUuids("cleanup_runs", 1), [helper.listCleanupUuids("cleanup_runs", 1)[0]]);
    assert.deepEqual(helper.listCleanupUuids("cleanup_runs", 2), [helper.listCleanupUuids("cleanup_runs", 2)[0]]);

    const selectedTags = targetDatabase
      .prepare(
        `
          SELECT scan_id, tag, is_deleted
          FROM cleanup_selected_tags
          ORDER BY scan_id, tag
        `
      )
      .all() as Array<{
      scan_id: number;
      tag: string;
      is_deleted: number | null;
    }>;
    assert.deepEqual(selectedTags, [
      { scan_id: 1, tag: "delete-me", is_deleted: 1 },
      { scan_id: 2, tag: "delete-two", is_deleted: 1 }
    ]);
  } finally {
    targetDatabase.exec("DETACH DATABASE source_db");
    targetDatabase.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

function _seedCleanupDatabase(databasePath: string, withCleanupRun: boolean): void {
  const database = openDatabase(databasePath);
  const scanWriter = new ScanWriter(database);

  scanWriter.startScan("acme", "example", "2026-05-17T09:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  scanWriter.insertPackageVersion({
    versionId: 101,
    createdAt: "2026-05-17T08:00:00.000Z",
    updatedAt: "2026-05-17T08:00:00.000Z"
  });
  scanWriter.insertManifest({
    versionId: 101,
    digest: "sha256:delete-root",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: ManifestKinds.imageManifest
  });
  scanWriter.insertTag({
    versionId: 101,
    tag: "delete-me"
  });
  scanWriter.markScanCompleted("2026-05-17T09:00:00.000Z");

  if (withCleanupRun) {
    const cleanupRunWriter = new CleanupRunWriter(database);
    cleanupRunWriter.persistCleanupRun(scanWriter.getActiveScanId(), _buildPlan(), {
      dryRun: true,
      cleanupStartedAt: "2026-05-17T09:01:00.000Z"
    });
  }

  database.close();
}

function _appendSeededScan(
  databasePath: string,
  scanUuid: string,
  tag: string,
  digest: string,
  withCleanupRun: boolean
): void {
  const database = openDatabase(databasePath);
  const scanWriter = new ScanWriter(database);

  scanWriter.startScan("acme", "example", "2026-05-18T09:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  database
    .prepare(
      `
        UPDATE package_scans
        SET scan_uuid = ?
        WHERE scan_id = ?
      `
    )
    .run(scanUuid, scanWriter.getActiveScanId());
  scanWriter.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-18T08:00:00.000Z",
    updatedAt: "2026-05-18T08:00:00.000Z"
  });
  scanWriter.insertManifest({
    versionId: 201,
    digest,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: ManifestKinds.imageManifest
  });
  scanWriter.insertTag({
    versionId: 201,
    tag
  });
  scanWriter.markScanCompleted("2026-05-18T09:00:00.000Z");

  if (withCleanupRun) {
    const cleanupRunWriter = new CleanupRunWriter(database);
    cleanupRunWriter.persistCleanupRun(scanWriter.getActiveScanId(), _buildPlan(tag, digest, 201), {
      dryRun: true,
      cleanupStartedAt: "2026-05-18T09:01:00.000Z"
    });
  }

  database.close();
}

function _buildPlan(tag = "delete-me", digest = "sha256:delete-root", versionId = 101): DeletePlan {
  return {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-17T09:00:00.000Z",
    plannerInputs: {
      deleteTags: [tag],
      excludeTags: []
    },
    directTargetTags: [tag],
    directTargetRoots: [
      {
        versionId,
        digest,
        reason: "delete-tags-all-tags-selected",
        selectionMode: "delete-root"
      }
    ],
    rootDecisions: [
      {
        versionId,
        digest,
        selectionMode: "delete-root",
        selectionReason: "delete-tags-all-tags-selected",
        validationStatus: DeletePlanValidationStatuses.fullyDeletable,
        validationReasonCode: "fully-deletable-no-retained-overlap",
        validationReason: "root and closure can be deleted"
      }
    ],
    protectedRoots: [],
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [
      {
        versionId,
        digest,
        reason: "delete-tags-all-tags-selected",
        selectionMode: "delete-root"
      }
    ],
    collateralTags: []
  };
}
