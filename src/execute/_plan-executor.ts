import type { DeletePlan } from "../db/index.js";
import { deletePackageVersion } from "./_package-version-delete-client.js";
import { untagRootTags } from "./_untag-client.js";
import {
  type DeleteExecutionOptions,
  type DeleteExecutionSummary,
  type DeletePackageVersionOperation
} from "./_types.js";

export async function executeDeletePlan(
  plan: DeletePlan,
  options: DeleteExecutionOptions
): Promise<DeleteExecutionSummary> {
  const deletedPackageVersions: DeletePackageVersionOperation[] = [];
  const untaggedTags = [];
  const directTargetTagSet = new Set(plan.directTargetTags);

  for (const decision of plan.rootDecisions) {
    if (decision.validationStatus !== "untag-only") {
      continue;
    }
    if (!options.listRootTags) {
      throw new Error(`execution requires listRootTags support for untag-only root ${decision.digest}`);
    }

    const selectedTags = options
      .listRootTags({
        owner: plan.owner,
        packageName: plan.packageName,
        versionId: decision.versionId,
        digest: decision.digest
      })
      .filter((tag) => directTargetTagSet.has(tag));
    if (selectedTags.length === 0) {
      throw new Error(`no selected tags resolved for untag-only root ${decision.digest}`);
    }

    untaggedTags.push(
      ...(await untagRootTags(plan.owner, plan.packageName, decision.versionId, decision.digest, selectedTags, options))
    );
  }

  for (const root of plan.fullyDeletableRoots) {
    options.logger.info(
      `Deleting package version ${root.versionId} for ${plan.owner}/${plan.packageName} (${root.digest})`
    );
    await deletePackageVersion(plan.owner, plan.packageName, root.versionId, options.token, options.logger, {
      fetchImpl: options.fetchImpl
    });
    deletedPackageVersions.push({
      versionId: root.versionId,
      digest: root.digest
    });
  }

  return {
    owner: plan.owner,
    packageName: plan.packageName,
    scanCompletedAt: plan.scanCompletedAt,
    plannerInputs: plan.plannerInputs,
    deletedPackageVersions,
    untaggedTags,
    blockedRoots: plan.blockedRoots,
    unsupportedUntagRoots: []
  };
}
