const _OCI_MEDIA_TYPES = new Set([
  "application/vnd.oci.artifact.manifest.v1+json",
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json"
]);
const _DETACH_ANNOTATION_KEY = "io.github.ghcr-cleanup-manager.detached-tag";

export function buildDetachedManifestClone(
  rawManifestJson: string,
  mediaType: string,
  options: {
    detachedTag: string;
    sourceDigest: string;
  }
): string {
  const parsed = JSON.parse(rawManifestJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`manifest ${options.sourceDigest} is not a JSON object`);
  }

  const clone = structuredClone(parsed) as Record<string, unknown>;
  if (_OCI_MEDIA_TYPES.has(mediaType)) {
    const annotations = _cloneAnnotations(clone.annotations);
    annotations[_DETACH_ANNOTATION_KEY] = `${options.detachedTag} ${options.sourceDigest}`;
    clone.annotations = annotations;
  }

  return `${JSON.stringify(clone, null, 2)}\n`;
}

function _cloneAnnotations(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const annotations: Record<string, string> = {};
  for (const [key, annotationValue] of Object.entries(value)) {
    if (typeof annotationValue === "string") {
      annotations[key] = annotationValue;
    }
  }
  return annotations;
}
