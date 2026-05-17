import assert from "node:assert/strict";
import test from "node:test";
import { classifyManifestKind } from "../../../src/ingest/github/_manifest-kind.js";

test("classifyManifestKind identifies image indexes", () => {
  assert.equal(classifyManifestKind({ mediaType: "application/vnd.oci.image.index.v1+json" }), "image_index");
});

test("classifyManifestKind identifies docker manifest lists as image indexes", () => {
  assert.equal(
    classifyManifestKind({ mediaType: "application/vnd.docker.distribution.manifest.list.v2+json" }),
    "image_index"
  );
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

test("classifyManifestKind identifies sigstore signatures from config media type", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      config: {
        mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json"
      }
    }),
    "signature_manifest"
  );
});

test("classifyManifestKind identifies sigstore signatures from exact signature predicate annotation", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      annotations: {
        "dev.sigstore.bundle.predicateType": "https://sigstore.dev/cosign/sign/v1"
      }
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

test("classifyManifestKind identifies attestations from docker reference type annotation", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      annotations: {
        "vnd.docker.reference.type": "attestation-manifest"
      }
    }),
    "attestation_manifest"
  );
});

test("classifyManifestKind identifies attestations from non-signature sigstore predicate annotation", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      annotations: {
        "dev.sigstore.bundle.predicateType": "https://slsa.dev/provenance/v1"
      }
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

test("classifyManifestKind does not treat non-attestation docker reference type as attestation", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      annotations: {
        "vnd.docker.reference.type": "not-attestation"
      }
    }),
    "image_manifest"
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
