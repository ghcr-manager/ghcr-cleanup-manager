export interface PackageVersionRecord {
  versionId: number;
  digest: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface TagRecord {
  tag: string;
  digest: string;
  versionId: number;
}

export interface ManifestRecord {
  digest: string;
  mediaType: string;
  artifactType?: string;
  configMediaType?: string;
  subjectDigest?: string;
  annotations?: Record<string, unknown>;
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
  scannedAt: string;
  packageVersions: PackageVersionRecord[];
  tags: TagRecord[];
  manifests: ManifestRecord[];
  manifestEdges: ManifestEdgeRecord[];
}

export interface PlanOptions {
  olderThanDays: number;
  deleteUntagged: boolean;
  excludeTags: string[];
}

export interface PlanSummary {
  packageName: string;
  scannedAt: string;
  totalPackageVersions: number;
  totalTaggedVersions: number;
  protectedVersionIds: number[];
  deletableVersionIds: number[];
}
