export const scenarios = {
  "delete-untagged-noop": {
    id: "delete-untagged-noop",
    packageSuffix: "scenario--delete-untagged-noop",
    seedStrategy: "delete-untagged-noop",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-untagged"],
    dataaxiomInputs: {
      "delete-untagged": "true"
    }
  },
  "tagged-fully-deletable": {
    id: "tagged-fully-deletable",
    packageSuffix: "scenario--tagged-fully-deletable",
    seedStrategy: "tagged-fully-deletable",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}"
    },
    tagNames: {
      deleteTag: "delete-me"
    }
  },
  "untag-only-single-shared-root": {
    id: "untag-only-single-shared-root",
    packageSuffix: "scenario--untag-only-single-shared-root",
    seedStrategy: "untag-only-single-shared-root",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}"
    },
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    }
  },
  "untag-only-multiarch-shared-root": {
    id: "untag-only-multiarch-shared-root",
    packageSuffix: "scenario--untag-only-multiarch-shared-root",
    seedStrategy: "untag-only-multiarch-shared-root",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}"
    },
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    }
  },
  "blocked-shared-closure": {
    id: "blocked-shared-closure",
    packageSuffix: "scenario--blocked-shared-closure",
    seedStrategy: "blocked-shared-closure",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}"
    },
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    }
  },
  "delete-untagged-real": {
    id: "delete-untagged-real",
    packageSuffix: "scenario--delete-untagged-real",
    seedStrategy: "delete-untagged-real",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-untagged"],
    dataaxiomInputs: {
      "delete-untagged": "true"
    },
    tagNames: {
      trackedTag: "tracked"
    }
  },
  "exclude-tag-protected-root": {
    id: "exclude-tag-protected-root",
    packageSuffix: "scenario--exclude-tag-protected-root",
    seedStrategy: "exclude-tag-protected-root",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}", "--exclude-tag", "{keepTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}",
      "exclude-tags": "{keepTag}"
    },
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    }
  },
  "keep-n-tagged-overflow": {
    id: "keep-n-tagged-overflow",
    packageSuffix: "scenario--keep-n-tagged-overflow",
    seedStrategy: "keep-n-tagged-overflow",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--keep-n-tagged", "1"],
    dataaxiomInputs: {
      "keep-n-tagged": "1"
    },
    tagNames: {
      oldestTag: "oldest",
      middleTag: "middle",
      newestTag: "newest"
    }
  },
  "keep-n-untagged-overflow": {
    id: "keep-n-untagged-overflow",
    packageSuffix: "scenario--keep-n-untagged-overflow",
    seedStrategy: "keep-n-untagged-overflow",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--keep-n-untagged", "1"],
    dataaxiomInputs: {
      "keep-n-untagged": "1"
    },
    tagNames: {
      trackedTag: "tracked"
    }
  },
  "delete-tags-keep-n-tagged-overflow": {
    id: "delete-tags-keep-n-tagged-overflow",
    packageSuffix: "scenario--delete-tags-keep-n-tagged-overflow",
    seedStrategy: "delete-tags-keep-n-tagged-overflow",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteOldTag}", "--delete-tag", "{deleteNewTag}", "--keep-n-tagged", "1"],
    dataaxiomInputs: {
      "delete-tags": "{deleteOldTag},{deleteNewTag}",
      "keep-n-tagged": "1"
    },
    tagNames: {
      deleteOldTag: "delete-old",
      deleteNewTag: "delete-new",
      keepTag: "keep"
    }
  },
  "wildcard-tagged-fully-deletable": {
    id: "wildcard-tagged-fully-deletable",
    packageSuffix: "scenario--wildcard-tagged-fully-deletable",
    seedStrategy: "tagged-fully-deletable",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "*delete-me"],
    dataaxiomInputs: {
      "delete-tags": "*delete-me"
    }
  },
  "regex-untag-only-single-shared-root": {
    id: "regex-untag-only-single-shared-root",
    packageSuffix: "scenario--regex-untag-only-single-shared-root",
    seedStrategy: "untag-only-single-shared-root",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "^untag-only-single-shared-root--delete-me$", "--use-regex"],
    dataaxiomInputs: {
      "delete-tags": "^untag-only-single-shared-root--delete-me$",
      "use-regex": "true"
    }
  }
};

export const scenarioIds = Object.keys(scenarios);

export const scenarioMatrix = scenarioIds.flatMap((scenarioId) =>
  scenarios[scenarioId].supportedExecutors.map((executor) => ({
    scenario: scenarioId,
    executor
  }))
);
