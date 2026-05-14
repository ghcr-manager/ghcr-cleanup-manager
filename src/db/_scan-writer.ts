import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ManifestDescriptorRecord,
  ManifestEdgeRecord,
  ManifestRecord,
  PackageVersionRecord,
  TagRecord
} from "../core/index.js";
import { rebuildManifestReachability } from "./_manifest-reachability.js";

export class ScanWriter {
  readonly #database: Database.Database;
  #activeScanId: number | null = null;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  resetScan(owner: string, packageName: string, scanStartedAt: string): void {
    const result = this.#database
      .prepare(
        `
        INSERT INTO package_scans(scan_uuid, owner, package_name, scan_started_at, scan_completed_at, status)
        VALUES(?, ?, ?, ?, NULL, 'running')
      `
      )
      .run(randomUUID(), owner, packageName, scanStartedAt);

    this.#activeScanId = Number(result.lastInsertRowid);
  }

  markScanCompleted(scanCompletedAt: string): void {
    this.#database
      .prepare(
        `
        UPDATE package_scans
        SET scan_completed_at = ?, status = 'completed'
        WHERE scan_id = ?
      `
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
      `
      )
      .run(scanCompletedAt, this.#requireScanId());
  }

  insertPackageVersion(version: PackageVersionRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO package_versions(scan_id, version_id, created_at, updated_at)
        VALUES(@scanId, @versionId, @createdAt, @updatedAt)
      `
      )
      .run({
        scanId: this.#requireScanId(),
        versionId: version.versionId,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt
      });
  }

  insertPackageVersionPayload(versionId: number, rawJson: string): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO package_version_payloads(scan_id, version_id, raw_json)
        VALUES(?, ?, ?)
      `
      )
      .run(this.#requireScanId(), versionId, rawJson);
  }

  insertTag(tag: TagRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO tags(scan_id, tag, version_id)
        VALUES(@scanId, @tag, @versionId)
      `
      )
      .run({
        scanId: this.#requireScanId(),
        ...tag
      });
  }

  insertManifest(manifest: ManifestRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO manifests(
          scan_id,
          version_id,
          digest,
          media_type,
          artifact_type,
          config_media_type,
          subject_digest,
          annotations_json,
          platform_os,
          platform_architecture,
          platform_variant,
          manifest_kind
        )
        VALUES(
          @scanId,
          @versionId,
          @digest,
          @mediaType,
          @artifactType,
          @configMediaType,
          @subjectDigest,
          @annotationsJson,
          @platformOs,
          @platformArchitecture,
          @platformVariant,
          @manifestKind
        )
      `
      )
      .run({
        scanId: this.#requireScanId(),
        versionId: manifest.versionId,
        digest: manifest.digest,
        mediaType: manifest.mediaType,
        artifactType: manifest.artifactType ?? null,
        configMediaType: manifest.configMediaType ?? null,
        subjectDigest: manifest.subjectDigest ?? null,
        annotationsJson: manifest.annotations ? JSON.stringify(manifest.annotations) : null,
        platformOs: manifest.platform?.os ?? null,
        platformArchitecture: manifest.platform?.architecture ?? null,
        platformVariant: manifest.platform?.variant ?? null,
        manifestKind: manifest.manifestKind ?? null
      });
  }

  insertManifestPayload(digest: string, rawJson: string): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO manifest_payloads(scan_id, digest, raw_json)
        VALUES(?, ?, ?)
      `
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
      `
      )
      .run({
        scanId: this.#requireScanId(),
        parentDigest: descriptor.parentDigest,
        childDigest: descriptor.childDigest,
        mediaType: descriptor.mediaType,
        artifactType: descriptor.artifactType ?? null,
        platformOs: descriptor.platform?.os ?? null,
        platformArchitecture: descriptor.platform?.architecture ?? null,
        platformVariant: descriptor.platform?.variant ?? null
      });
  }

  insertManifestEdge(edge: ManifestEdgeRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR IGNORE INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind)
        VALUES(@scanId, @parentDigest, @childDigest, @edgeKind)
      `
      )
      .run({
        scanId: this.#requireScanId(),
        ...edge
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
      throw new Error("package not initialized; call resetScan(owner, packageName, scanStartedAt) first");
    }

    return this.#activeScanId;
  }
}
