export type ManifestKind =
  | "image_index"
  | "image_manifest"
  | "artifact_manifest"
  | "attestation_manifest"
  | "signature_manifest";

export interface PackageVersionRecord {
  versionId: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface TagRecord {
  tag: string;
  versionId: number;
}

export interface ManifestRecord {
  versionId: number;
  digest: string;
  mediaType: string;
  artifactType?: string;
  configMediaType?: string;
  subjectDigest?: string;
  annotations?: Record<string, unknown>;
  manifestKind?: ManifestKind;
  platform?: {
    architecture?: string;
    os?: string;
    variant?: string;
  };
}

export interface ManifestDescriptorRecord {
  parentDigest: string;
  childDigest: string;
  mediaType: string;
  artifactType?: string;
  platform?: {
    architecture?: string;
    os?: string;
    variant?: string;
  };
}

export interface ManifestEdgeRecord {
  parentDigest: string;
  childDigest: string;
  edgeKind: "image-child" | "referrer";
}

export interface PackageSnapshot {
  packageName: string;
  scanCompletedAt: string;
  packageVersions: PackageVersionRecord[];
  tags: TagRecord[];
  manifests: ManifestRecord[];
  manifestEdges: ManifestEdgeRecord[];
}
