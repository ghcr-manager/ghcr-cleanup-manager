import type Database from "better-sqlite3";
import type {
  ManifestDescriptorRecord,
  ManifestEdgeRecord,
  ManifestRecord,
  PackageVersionRecord,
  TagRecord,
} from "../core/index.js";
import { rebuildManifestReachability } from "./_manifest-reachability.js";

export class ScanWriter {
  readonly #database: Database.Database;
  #activeScanId: number | null = null;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  resetScan(packageName: string, scanStartedAt: string): void {
    const result = this.#database
      .prepare(
        `
        INSERT INTO package_scans(package_name, scan_started_at, scan_completed_at, status)
        VALUES(?, ?, NULL, 'running')
      `,
      )
      .run(packageName, scanStartedAt);

    if (typeof result.lastInsertRowid !== "number" && typeof result.lastInsertRowid !== "bigint") {
      throw new Error("unable to create scan row");
    }

    this.#activeScanId = Number(result.lastInsertRowid);
  }

  markScanCompleted(scanCompletedAt: string): void {
    this.#database
      .prepare(
        `
        UPDATE package_scans
        SET scan_completed_at = ?, status = 'completed'
        WHERE scan_id = ?
      `,
      )
      .run(scanCompletedAt, this.#requireScanId());
  }

  markScanFailed(scanCompletedAt: string): void {
    this.#database
      .prepare(
        `
        UPDATE package_scans
        SET scan_completed_at = ?, status = 'failed'
        WHERE scan_id = ?
      `,
      )
      .run(scanCompletedAt, this.#requireScanId());
  }

  insertPackageVersion(version: PackageVersionRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO package_versions(scan_id, version_id, digest, created_at, updated_at)
        VALUES(@scanId, @versionId, @digest, @createdAt, @updatedAt)
      `,
      )
      .run({
        scanId: this.#requireScanId(),
        versionId: version.versionId,
        digest: version.digest,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
      });

    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO package_version_metadata(scan_id, version_id, metadata_json)
        VALUES(@scanId, @versionId, @metadataJson)
      `,
      )
      .run({
        scanId: this.#requireScanId(),
        versionId: version.versionId,
        metadataJson: JSON.stringify(version.metadata ?? {}),
      });
  }

  insertPackageVersionPayload(versionId: number, rawJson: string): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO package_version_payloads(scan_id, version_id, raw_json)
        VALUES(?, ?, ?)
      `,
      )
      .run(this.#requireScanId(), versionId, rawJson);
  }

  insertTag(tag: TagRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO tags(scan_id, tag, digest, version_id)
        VALUES(@scanId, @tag, @digest, @versionId)
      `,
      )
      .run({
        scanId: this.#requireScanId(),
        ...tag,
      });
  }

  insertManifest(manifest: ManifestRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO manifests(
          scan_id,
          digest,
          media_type,
          artifact_type,
          config_media_type,
          subject_digest,
          annotations_json,
          platform_os,
          platform_architecture,
          platform_variant
        )
        VALUES(
          @scanId,
          @digest,
          @mediaType,
          @artifactType,
          @configMediaType,
          @subjectDigest,
          @annotationsJson,
          @platformOs,
          @platformArchitecture,
          @platformVariant
        )
      `,
      )
      .run({
        scanId: this.#requireScanId(),
        digest: manifest.digest,
        mediaType: manifest.mediaType,
        artifactType: manifest.artifactType ?? null,
        configMediaType: manifest.configMediaType ?? null,
        subjectDigest: manifest.subjectDigest ?? null,
        annotationsJson: manifest.annotations ? JSON.stringify(manifest.annotations) : null,
        platformOs: manifest.platform?.os ?? null,
        platformArchitecture: manifest.platform?.architecture ?? null,
        platformVariant: manifest.platform?.variant ?? null,
      });
  }

  insertManifestPayload(digest: string, rawJson: string): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO manifest_payloads(scan_id, digest, raw_json)
        VALUES(?, ?, ?)
      `,
      )
      .run(this.#requireScanId(), digest, rawJson);
  }

  insertManifestDescriptor(descriptor: ManifestDescriptorRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO manifest_descriptors(
          scan_id,
          parent_digest,
          child_digest,
          media_type,
          artifact_type,
          platform_os,
          platform_architecture,
          platform_variant
        )
        VALUES(
          @scanId,
          @parentDigest,
          @childDigest,
          @mediaType,
          @artifactType,
          @platformOs,
          @platformArchitecture,
          @platformVariant
        )
      `,
      )
      .run({
        scanId: this.#requireScanId(),
        parentDigest: descriptor.parentDigest,
        childDigest: descriptor.childDigest,
        mediaType: descriptor.mediaType,
        artifactType: descriptor.artifactType ?? null,
        platformOs: descriptor.platform?.os ?? null,
        platformArchitecture: descriptor.platform?.architecture ?? null,
        platformVariant: descriptor.platform?.variant ?? null,
      });
  }

  insertManifestEdge(edge: ManifestEdgeRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR IGNORE INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind)
        VALUES(@scanId, @parentDigest, @childDigest, @edgeKind)
      `,
      )
      .run({
        scanId: this.#requireScanId(),
        ...edge,
      });
  }

  rebuildManifestReachability(): void {
    rebuildManifestReachability(this.#database, this.#requireScanId());
  }

  getActiveScanId(): number {
    return this.#requireScanId();
  }

  #requireScanId(): number {
    if (this.#activeScanId === null) {
      throw new Error("package not initialized; call resetScan(packageName, scanStartedAt) first");
    }

    return this.#activeScanId;
  }
}
