import { readFile } from "node:fs/promises";
import type { ManifestEdgeRecord, ManifestRecord, PackageVersionRecord, TagRecord } from "../../core/index.js";
import { ScanWriter } from "../../db/index.js";

interface _FixtureScanDocument {
  packageName: string;
  scanCompletedAt?: string;
  scannedAt?: string;
  packageVersions: PackageVersionRecord[];
  tags: TagRecord[];
  manifests: ManifestRecord[];
  manifestEdges: ManifestEdgeRecord[];
}

export async function importFileScan(snapshotPath: string, writer: ScanWriter): Promise<void> {
  const rawSnapshot = await readFile(snapshotPath, "utf8");
  const document = JSON.parse(rawSnapshot) as _FixtureScanDocument;
  const scanCompletedAt = document.scanCompletedAt ?? document.scannedAt;
  if (!scanCompletedAt) {
    throw new Error("fixture scan document is missing scanCompletedAt");
  }

  writer.resetScan(document.packageName, scanCompletedAt);
  try {
    for (const version of document.packageVersions) {
      writer.insertPackageVersion(version);
    }
    for (const tag of document.tags) {
      writer.insertTag(tag);
    }
    for (const manifest of document.manifests) {
      writer.insertManifest(manifest);
    }
    for (const edge of document.manifestEdges) {
      writer.insertManifestEdge(edge);
    }
    writer.rebuildManifestReachability();
    writer.markScanCompleted(scanCompletedAt);
  } catch (error) {
    writer.markScanFailed(new Date().toISOString());
    throw error;
  }
}
