import type { DeletePlan, PlannerRepository } from "../db/index.js";
import { collectRepeatedOption, hasFlag, requireOption } from "./_args.js";
import { resolveOlderThan } from "./_older-than.js";

export interface PlanCommandInputs {
  databasePath: string;
  owner: string;
  packageName: string;
  deleteTags: string[];
  deleteTagsRequested: boolean;
  deleteGhostImages: boolean;
  deletePartialImages: boolean;
  deleteOrphanedImages: boolean;
  excludeTags: string[];
  deleteUntagged: boolean;
  useRegex: boolean;
  keepNTagged?: number;
  keepNUntagged?: number;
  olderThan?: string;
  cutoffTimestamp?: string;
}

export function resolvePlanCommandInputs(args: string[]): PlanCommandInputs {
  const databasePath = requireOption(args, "--db");
  const owner = requireOption(args, "--owner");
  const packageName = requireOption(args, "--package");
  const deleteTags = collectRepeatedOption(args, "--delete-tag");
  const deleteGhostImages = hasFlag(args, "--delete-ghost-images");
  const deletePartialImages = hasFlag(args, "--delete-partial-images");
  const deleteOrphanedImages = hasFlag(args, "--delete-orphaned-images");
  const excludeTags = collectRepeatedOption(args, "--exclude-tag");
  const deleteUntagged = hasFlag(args, "--delete-untagged");
  const useRegex = hasFlag(args, "--use-regex");
  const keepNTaggedRaw = collectRepeatedOption(args, "--keep-n-tagged");
  const keepNUntaggedRaw = collectRepeatedOption(args, "--keep-n-untagged");
  const olderThanRaw = collectRepeatedOption(args, "--older-than");

  if (keepNTaggedRaw.length > 1) {
    throw new Error("--keep-n-tagged may only be provided once");
  }
  if (keepNUntaggedRaw.length > 1) {
    throw new Error("--keep-n-untagged may only be provided once");
  }

  const keepNTagged = keepNTaggedRaw[0] ? resolveKeepCount("--keep-n-tagged", keepNTaggedRaw[0]) : undefined;
  const keepNUntagged = keepNUntaggedRaw[0] ? resolveKeepCount("--keep-n-untagged", keepNUntaggedRaw[0]) : undefined;
  const taggedSelectorActive =
    deleteTags.length > 0 ||
    deleteGhostImages ||
    deletePartialImages ||
    deleteOrphanedImages ||
    keepNTagged !== undefined;
  const selectorCount =
    (deleteUntagged ? 1 : 0) + (taggedSelectorActive ? 1 : 0) + (keepNUntagged !== undefined ? 1 : 0);
  if (selectorCount > 1) {
    throw new Error(
      "plan currently supports exactly one selector family: --delete-untagged, --delete-tag, --delete-ghost-images, --delete-partial-images, --delete-orphaned-images, --keep-n-tagged, or --keep-n-untagged"
    );
  }
  if (selectorCount === 0) {
    throw new Error(
      "missing required cleanup selector: --delete-untagged, --delete-tag, --delete-ghost-images, --delete-partial-images, --delete-orphaned-images, --keep-n-tagged, or --keep-n-untagged"
    );
  }

  if ((deleteUntagged || keepNUntagged !== undefined) && excludeTags.length > 0) {
    throw new Error("--exclude-tag is only supported with tagged selector families");
  }
  if (olderThanRaw.length > 1) {
    throw new Error("--older-than may only be provided once");
  }

  const olderThan = olderThanRaw[0] ? resolveOlderThan(olderThanRaw[0], new Date()) : undefined;

  return {
    databasePath,
    owner,
    packageName,
    deleteTags,
    deleteTagsRequested: deleteTags.length > 0 || deleteGhostImages || deletePartialImages || deleteOrphanedImages,
    deleteGhostImages,
    deletePartialImages,
    deleteOrphanedImages,
    excludeTags,
    deleteUntagged,
    useRegex,
    keepNTagged,
    keepNUntagged,
    olderThan: olderThan?.olderThan,
    cutoffTimestamp: olderThan?.cutoffTimestamp
  };
}

export function loadDeletePlan(repository: PlannerRepository, inputs: PlanCommandInputs): DeletePlan {
  if (inputs.keepNUntagged !== undefined) {
    return repository.getKeepNUntaggedPlanWithCutoff(inputs.owner, inputs.packageName, inputs.keepNUntagged, {
      olderThan: inputs.olderThan,
      cutoffTimestamp: inputs.cutoffTimestamp
    });
  }

  if (inputs.deleteUntagged) {
    return repository.getDeleteUntaggedPlanWithCutoff(inputs.owner, inputs.packageName, {
      olderThan: inputs.olderThan,
      cutoffTimestamp: inputs.cutoffTimestamp
    });
  }

  if (
    !inputs.deleteTagsRequested &&
    !inputs.deleteGhostImages &&
    !inputs.deletePartialImages &&
    !inputs.deleteOrphanedImages &&
    inputs.keepNTagged !== undefined
  ) {
    return repository.getKeepNTaggedPlanWithCutoff(inputs.owner, inputs.packageName, inputs.keepNTagged, [], {
      olderThan: inputs.olderThan,
      cutoffTimestamp: inputs.cutoffTimestamp
    });
  }

  return repository.getDeleteTagsPlanWithCutoff(
    inputs.owner,
    inputs.packageName,
    inputs.deleteTags,
    inputs.excludeTags,
    {
      deleteGhostImages: inputs.deleteGhostImages,
      deletePartialImages: inputs.deletePartialImages,
      deleteOrphanedImages: inputs.deleteOrphanedImages,
      deleteTagsRequested: inputs.deleteTagsRequested,
      keepNTagged: inputs.keepNTagged,
      useRegex: inputs.useRegex,
      olderThan: inputs.olderThan,
      cutoffTimestamp: inputs.cutoffTimestamp
    }
  );
}

function resolveKeepCount(optionName: string, rawValue: string): number {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }

  return Number.parseInt(rawValue, 10);
}
