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

  constructor(database: Database.Database) {
    this.#database = database;
  }

  resetScan(packageName: string, scannedAt: string): void {
    this.#database.exec(`
      DELETE FROM package_scans;
      DELETE FROM tags;
      DELETE FROM package_version_payloads;
      DELETE FROM package_version_metadata;
      DELETE FROM manifest_reachability;
      DELETE FROM manifest_payloads;
      DELETE FROM manifest_descriptors;
      DELETE FROM manifest_edges;
      DELETE FROM manifests;
      DELETE FROM package_versions;
    `);

    this.#database
      .prepare("INSERT INTO package_scans(package_name, scanned_at) VALUES(?, ?)")
      .run(packageName, scannedAt);
  }

  insertPackageVersion(version: PackageVersionRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO package_versions(version_id, digest, created_at, updated_at)
        VALUES(@versionId, @digest, @createdAt, @updatedAt)
      `,
      )
      .run({
        versionId: version.versionId,
        digest: version.digest,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
      });

    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO package_version_metadata(version_id, metadata_json)
        VALUES(@versionId, @metadataJson)
      `,
      )
      .run({
        versionId: version.versionId,
        metadataJson: JSON.stringify(version.metadata ?? {}),
      });
  }

  insertPackageVersionPayload(versionId: number, rawJson: string): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO package_version_payloads(version_id, raw_json)
        VALUES(?, ?)
      `,
      )
      .run(versionId, rawJson);
  }

  insertTag(tag: TagRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO tags(tag, digest, version_id)
        VALUES(@tag, @digest, @versionId)
      `,
      )
      .run(tag);
  }

  insertManifest(manifest: ManifestRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO manifests(
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
        INSERT OR REPLACE INTO manifest_payloads(digest, raw_json)
        VALUES(?, ?)
      `,
      )
      .run(digest, rawJson);
  }

  insertManifestDescriptor(descriptor: ManifestDescriptorRecord): void {
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO manifest_descriptors(
          parent_digest,
          child_digest,
          media_type,
          artifact_type,
          platform_os,
          platform_architecture,
          platform_variant
        )
        VALUES(
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
        INSERT OR IGNORE INTO manifest_edges(parent_digest, child_digest, edge_kind)
        VALUES(@parentDigest, @childDigest, @edgeKind)
      `,
      )
      .run(edge);
  }

  rebuildManifestReachability(): void {
    rebuildManifestReachability(this.#database);
  }
}
