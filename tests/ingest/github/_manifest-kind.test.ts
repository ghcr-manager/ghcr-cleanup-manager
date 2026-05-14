import assert from "node:assert/strict";
import test from "node:test";
import { classifyManifestKind } from "../../../src/ingest/github/_manifest-kind.js";

test("classifyManifestKind identifies image indexes", () => {
  assert.equal(classifyManifestKind({ mediaType: "application/vnd.oci.image.index.v1+json" }), "image_index");
});

test("classifyManifestKind identifies plain image manifests", () => {
  assert.equal(classifyManifestKind({ mediaType: "application/vnd.oci.image.manifest.v1+json" }), "image_manifest");
});

test("classifyManifestKind identifies sigstore signature manifests", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      artifactType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      subject: { digest: "sha256:subject" }
    }),
    "signature_manifest"
  );
});

test("classifyManifestKind identifies in-toto attestations stored as image manifests", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      layers: [
        {
          mediaType: "application/vnd.in-toto+json",
          annotations: {
            "in-toto.io/predicate-type": "https://slsa.dev/provenance/v1"
          }
        }
      ]
    }),
    "attestation_manifest"
  );
});

test("classifyManifestKind falls back to artifact manifests", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.artifact.manifest.v1+json"
    }),
    "artifact_manifest"
  );
});

test("classifyManifestKind returns undefined when no known category matches", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/example.manifest.v1+json"
    }),
    undefined
  );
});
