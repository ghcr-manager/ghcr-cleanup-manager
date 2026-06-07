function _ghcrManagerScenario(inputs, supportedExecutors = ["ghcr-manager", "ghcr-cleanup-action"]) {
  return {
    ghcrManager: {
      inputs
    },
    supportedExecutors
  };
}

export const cleanupScenarios = {
  "delete-untagged-noop": {
    id: "delete-untagged-noop",
    packageSuffix: "scenario--delete-untagged-noop",
    seedStrategy: "delete-untagged-noop",
    ..._ghcrManagerScenario(
      {
        "delete-untagged": "true"
      },
      ["ghcr-manager", "ghcr-cleanup-action"]
    ),
    tagNames: {
      keepTag: "keep"
    },
    scanAssertions: [{ tagNameKey: "keepTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1
    }
  },
  "tagged-fully-deletable": {
    id: "tagged-fully-deletable",
    packageSuffix: "scenario--tagged-fully-deletable",
    seedStrategy: "tagged-fully-deletable",
    ..._ghcrManagerScenario({
      "delete-tags": "{deleteTag}"
    }),
    tagNames: {
      keepTag: "keep",
      deleteTag: "delete-me"
    },
    scanAssertions: [{ tagNameKey: "keepTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1,
      absentTagNameKeys: ["deleteTag"]
    },
    cleanupAuditAssertions: {
      validationSummary: {
        directTargetRootCount: 1,
        fullyDeletableRootCount: 1,
        blockedDeleteRootCount: 0,
        protectedRootCount: 0
      },
      rootDecisions: [{ tagNameKey: "deleteTag", validationStatus: "fully-deletable" }],
      protectedTagNameKeys: [],
      protectedRootBlocks: []
    }
  },
  "digest-fully-deletable": {
    id: "digest-fully-deletable",
    packageSuffix: "scenario--digest-fully-deletable",
    seedStrategy: "digest-fully-deletable",
    ..._ghcrManagerScenario({}),
    digestSelectorTagNameKey: "deleteTag",
    tagNames: {
      keepTag: "keep",
      deleteTag: "delete-me"
    },
    scanAssertions: [{ tagNameKey: "keepTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1,
      absentTagNameKeys: ["deleteTag"]
    },
    cleanupAuditAssertions: {
      validationSummary: {
        directTargetRootCount: 1,
        fullyDeletableRootCount: 1,
        blockedDeleteRootCount: 0,
        protectedRootCount: 0
      },
      rootDecisions: [{ tagNameKey: "deleteTag", validationStatus: "fully-deletable" }],
      protectedTagNameKeys: [],
      protectedRootBlocks: []
    }
  },
  "untag-only-single-shared-root": {
    id: "untag-only-single-shared-root",
    packageSuffix: "scenario--untag-only-single-shared-root",
    seedStrategy: "untag-only-single-shared-root",
    ..._ghcrManagerScenario({
      "delete-tags": "{deleteTag}"
    }),
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    },
    scanAssertions: [{ tagNameKey: "keepTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1,
      absentTagNameKeys: ["deleteTag"]
    }
  },
  "untag-only-multiarch-shared-root": {
    id: "untag-only-multiarch-shared-root",
    packageSuffix: "scenario--untag-only-multiarch-shared-root",
    seedStrategy: "untag-only-multiarch-shared-root",
    ..._ghcrManagerScenario({
      "delete-tags": "{deleteTag}"
    }),
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "multi_arch_manifest",
        requireRoot: true
      }
    ],
    latestScanAssertions: {
      manifestCount: 3,
      tagCount: 1,
      absentTagNameKeys: ["deleteTag"]
    }
  },
  "docker-manifest-list-untag-only-shared-root": {
    id: "docker-manifest-list-untag-only-shared-root",
    packageSuffix: "scenario--docker-manifest-list-untag-only-shared-root",
    seedStrategy: "docker-manifest-list-untag-only-shared-root",
    ..._ghcrManagerScenario({
      "delete-tags": "{deleteTag}"
    }),
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "multi_arch_manifest",
        expectedManifestMediaType: "application/vnd.docker.distribution.manifest.list.v2+json",
        requireRoot: true
      }
    ]
  },
  "cosign-referrer-kept-multiarch": {
    id: "cosign-referrer-kept-multiarch",
    packageSuffix: "scenario--cosign-referrer-kept-multiarch",
    seedStrategy: "cosign-referrer-kept-multiarch",
    ..._ghcrManagerScenario({
      "delete-untagged": "true"
    }),
    includeInMatrix: false,
    tagNames: {
      keepTag: "keep-me"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "multi_arch_manifest",
        expectedManifestMediaType: "application/vnd.oci.image.index.v1+json",
        requireRoot: true
      }
    ],
    signatureSubjectAssertions: [
      {
        tagNameKey: "keepTag",
        requiredArtifactType: "application/vnd.dev.sigstore.bundle.v0.3+json",
        requiredSubjectManifestKind: "image_manifest",
        requireUntaggedRoots: true,
        minDistinctSubjectCount: 2,
        minSignatureRootCount: 2
      }
    ]
  },
  "cosign-referrer-kept-multiarch-index-signature": {
    id: "cosign-referrer-kept-multiarch-index-signature",
    packageSuffix: "scenario--cosign-referrer-kept-multiarch-index-signature",
    seedStrategy: "cosign-referrer-kept-multiarch-index-signature",
    ..._ghcrManagerScenario({
      "delete-untagged": "true"
    }),
    includeInMatrix: false,
    tagNames: {
      keepTag: "keep-me"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "multi_arch_manifest",
        expectedManifestMediaType: "application/vnd.oci.image.index.v1+json",
        requireRoot: true
      }
    ],
    signatureSubjectAssertions: [
      {
        tagNameKey: "keepTag",
        requiredArtifactType: "application/vnd.dev.sigstore.bundle.v0.3+json",
        requiredSubjectManifestKind: "multi_arch_manifest",
        requireUntaggedRoots: true,
        minDistinctSubjectCount: 1,
        minSignatureRootCount: 1
      }
    ]
  },
  "blocked-shared-closure": {
    id: "blocked-shared-closure",
    packageSuffix: "scenario--blocked-shared-closure",
    seedStrategy: "blocked-shared-closure",
    ..._ghcrManagerScenario({
      "delete-tags": "{deleteTag}"
    }),
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me",
      keepDummyTag: "keep-dummy"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "multi_arch_manifest",
        expectedManifestMediaType: "application/vnd.oci.image.index.v1+json",
        requireRoot: true
      },
      {
        tagNameKey: "keepDummyTag",
        expectedManifestKind: "image_manifest",
        requireRoot: true
      }
    ],
    latestScanAssertions: {
      manifestCount: 22,
      tagCount: 7,
      absentTagNameKeys: ["deleteTag"]
    },
    cleanupAuditAssertions: {
      validationSummary: {
        directTargetRootCount: 1,
        fullyDeletableRootCount: 1,
        blockedDeleteRootCount: 0
      },
      rootDecisions: [{ tagNameKey: "deleteTag", validationStatus: "fully-deletable" }],
      protectedTagNameKeys: [],
      protectedRootBlocks: []
    }
  },
  "delete-untagged-real": {
    id: "delete-untagged-real",
    packageSuffix: "scenario--delete-untagged-real",
    seedStrategy: "delete-untagged-real",
    ..._ghcrManagerScenario(
      {
        "delete-untagged": "true"
      },
      ["ghcr-manager", "ghcr-cleanup-action"]
    ),
    tagNames: {
      trackedTag: "tracked"
    },
    scanAssertions: [{ tagNameKey: "trackedTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1
    }
  },
  "exclude-tag-protected-root": {
    id: "exclude-tag-protected-root",
    packageSuffix: "scenario--exclude-tag-protected-root",
    seedStrategy: "exclude-tag-protected-root",
    ..._ghcrManagerScenario({
      "delete-tags": "{deleteTag}",
      "exclude-tags": "{keepTag}"
    }),
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    },
    scanAssertions: [
      { tagNameKey: "deleteTag", requireRoot: true },
      { tagNameKey: "keepTag", requireRoot: true }
    ],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 2
    }
  },
  "keep-n-tagged-overflow": {
    id: "keep-n-tagged-overflow",
    packageSuffix: "scenario--keep-n-tagged-overflow",
    seedStrategy: "keep-n-tagged-overflow",
    ..._ghcrManagerScenario(
      {
        "keep-n-tagged": "1"
      },
      ["ghcr-manager", "ghcr-cleanup-action"]
    ),
    tagNames: {
      oldestTag: "oldest",
      middleTag: "middle",
      newestTag: "newest"
    },
    scanAssertions: [{ tagNameKey: "newestTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1,
      absentTagNameKeys: ["oldestTag", "middleTag"]
    }
  },
  "keep-n-untagged-overflow": {
    id: "keep-n-untagged-overflow",
    packageSuffix: "scenario--keep-n-untagged-overflow",
    seedStrategy: "keep-n-untagged-overflow",
    ..._ghcrManagerScenario({
      "keep-n-untagged": "1"
    }),
    tagNames: {
      trackedTag: "tracked"
    },
    scanAssertions: [{ tagNameKey: "trackedTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 2,
      tagCount: 1
    }
  },
  "delete-tags-keep-n-tagged-overflow": {
    id: "delete-tags-keep-n-tagged-overflow",
    packageSuffix: "scenario--delete-tags-keep-n-tagged-overflow",
    seedStrategy: "delete-tags-keep-n-tagged-overflow",
    ..._ghcrManagerScenario({
      "delete-tags": "{deleteOldTag},{deleteNewTag}",
      "keep-n-tagged": "1"
    }),
    tagNames: {
      deleteOldTag: "delete-old",
      deleteNewTag: "delete-new",
      keepTag: "keep"
    },
    scanAssertions: [
      { tagNameKey: "deleteNewTag", requireRoot: true },
      { tagNameKey: "keepTag", requireRoot: true }
    ],
    latestScanAssertions: {
      manifestCount: 2,
      tagCount: 2,
      absentTagNameKeys: ["deleteOldTag"]
    }
  },
  "delete-ghost-images-real": {
    id: "delete-ghost-images-real",
    packageSuffix: "scenario--delete-ghost-images-real",
    seedStrategy: "delete-ghost-images-real",
    ..._ghcrManagerScenario({
      "delete-ghost-images": "true"
    }),
    tagNames: {
      keepTag: "keep"
    },
    scanAssertions: [{ tagNameKey: "keepTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1
    }
  },
  "delete-ghost-images-noop": {
    id: "delete-ghost-images-noop",
    packageSuffix: "scenario--delete-ghost-images-noop",
    seedStrategy: "delete-ghost-images-noop",
    ..._ghcrManagerScenario({
      "delete-ghost-images": "true"
    }),
    tagNames: {
      keepTag: "keep",
      ghostTag: "ghost",
      helperTag: "delete-ghost-images-noop-amd64-test"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "image_manifest",
        requireRoot: true
      },
      {
        tagNameKey: "ghostTag",
        expectedManifestKind: "multi_arch_manifest",
        requireRoot: true
      },
      {
        tagNameKey: "helperTag",
        expectedManifestKind: "image_manifest"
      }
    ],
    latestScanAssertions: {
      manifestCount: 3,
      tagCount: 3
    }
  },
  "delete-partial-images-real": {
    id: "delete-partial-images-real",
    packageSuffix: "scenario--delete-partial-images-real",
    seedStrategy: "delete-partial-images-real",
    ..._ghcrManagerScenario({
      "delete-partial-images": "true"
    }),
    tagNames: {
      keepTag: "keep",
      helperTag: "delete-partial-images-real-amd64-test"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "image_manifest",
        requireRoot: true
      },
      {
        tagNameKey: "helperTag",
        expectedManifestKind: "image_manifest"
      }
    ],
    latestScanAssertions: {
      manifestCount: 2,
      tagCount: 2
    }
  },
  "delete-partial-images-noop": {
    id: "delete-partial-images-noop",
    packageSuffix: "scenario--delete-partial-images-noop",
    seedStrategy: "delete-partial-images-noop",
    ..._ghcrManagerScenario({
      "delete-partial-images": "true"
    }),
    tagNames: {
      keepTag: "keep",
      ghostTag: "ghost",
      amd64HelperTag: "delete-partial-images-noop-amd64-test",
      arm64HelperTag: "delete-partial-images-noop-arm64-test"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "image_manifest",
        requireRoot: true
      },
      {
        tagNameKey: "ghostTag",
        expectedManifestKind: "multi_arch_manifest",
        requireRoot: true
      },
      {
        tagNameKey: "amd64HelperTag",
        expectedManifestKind: "image_manifest"
      },
      {
        tagNameKey: "arm64HelperTag",
        expectedManifestKind: "image_manifest"
      }
    ],
    latestScanAssertions: {
      manifestCount: 4,
      tagCount: 4
    }
  },
  "delete-orphaned-images-real": {
    id: "delete-orphaned-images-real",
    packageSuffix: "scenario--delete-orphaned-images-real",
    seedStrategy: "delete-orphaned-images-real",
    ..._ghcrManagerScenario({
      "delete-orphaned-images": "true"
    }),
    tagNames: {
      keepTag: "keep"
    },
    scanAssertions: [{ tagNameKey: "keepTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1
    }
  },
  "delete-orphaned-images-noop": {
    id: "delete-orphaned-images-noop",
    packageSuffix: "scenario--delete-orphaned-images-noop",
    seedStrategy: "delete-orphaned-images-noop",
    ..._ghcrManagerScenario({
      "delete-orphaned-images": "true"
    }),
    tagNames: {
      parentTag: "parent"
    },
    scanAssertions: [
      {
        tagNameKey: "parentTag",
        expectedManifestKind: "image_manifest",
        requireRoot: true
      }
    ],
    latestScanAssertions: {
      manifestCount: 2,
      tagCount: 2
    }
  },
  "wildcard-tagged-fully-deletable": {
    id: "wildcard-tagged-fully-deletable",
    packageSuffix: "scenario--wildcard-tagged-fully-deletable",
    seedStrategy: "wildcard-tagged-fully-deletable",
    ..._ghcrManagerScenario(
      {
        "delete-tags": "*delete-me"
      },
      ["ghcr-manager", "ghcr-cleanup-action" ]
    ),
    tagNames: {
      keepTag: "keep",
      deleteTag: "delete-me"
    },
    scanAssertions: [{ tagNameKey: "keepTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1,
      absentTagNameKeys: ["deleteTag"]
    }
  },
  "regex-untag-only-single-shared-root": {
    id: "regex-untag-only-single-shared-root",
    packageSuffix: "scenario--regex-untag-only-single-shared-root",
    seedStrategy: "untag-only-single-shared-root",
    ..._ghcrManagerScenario({
      "delete-tags": "^delete-me$",
      "use-regex": "true"
    }),
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    },
    scanAssertions: [{ tagNameKey: "keepTag", requireRoot: true }],
    latestScanAssertions: {
      manifestCount: 1,
      tagCount: 1,
      absentTagNameKeys: ["deleteTag"]
    }
  }
};
