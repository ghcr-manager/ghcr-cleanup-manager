import { PlannerRepository, openDatabase } from "../db/index.js";
import { collectRepeatedOption, hasFlag, requireOption } from "./_args.js";
import { resolveOlderThan } from "./_older-than.js";

export async function handlePlan(args: string[]): Promise<number> {
  const databasePath = requireOption(args, "--db");
  const owner = requireOption(args, "--owner");
  const packageName = requireOption(args, "--package");
  const deleteTags = collectRepeatedOption(args, "--delete-tag");
  const excludeTags = collectRepeatedOption(args, "--exclude-tag");
  const deleteUntagged = hasFlag(args, "--delete-untagged");
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
  const selectorCount =
    (deleteUntagged ? 1 : 0) +
    (deleteTags.length > 0 ? 1 : 0) +
    (keepNTagged !== undefined ? 1 : 0) +
    (keepNUntagged !== undefined ? 1 : 0);
  if (selectorCount > 1) {
    throw new Error(
      "plan currently supports exactly one selector family: --delete-untagged, --delete-tag, --keep-n-tagged, or --keep-n-untagged"
    );
  }
  if (selectorCount === 0) {
    throw new Error(
      "missing required cleanup selector: --delete-untagged, --delete-tag, --keep-n-tagged, or --keep-n-untagged"
    );
  }

  if (deleteUntagged && excludeTags.length > 0) {
    throw new Error("--exclude-tag is only supported with --delete-tag");
  }
  if (keepNTagged !== undefined && excludeTags.length > 0) {
    throw new Error("--exclude-tag is only supported with --delete-tag");
  }
  if (keepNUntagged !== undefined && excludeTags.length > 0) {
    throw new Error("--exclude-tag is only supported with --delete-tag");
  }
  if (olderThanRaw.length > 1) {
    throw new Error("--older-than may only be provided once");
  }

  const olderThan = olderThanRaw[0] ? resolveOlderThan(olderThanRaw[0], new Date()) : undefined;

  const database = openDatabase(databasePath);
  const repository = new PlannerRepository(database);
  const plan =
    keepNTagged !== undefined
      ? repository.getKeepNTaggedPlanWithCutoff(owner, packageName, keepNTagged, olderThan)
      : keepNUntagged !== undefined
        ? repository.getKeepNUntaggedPlanWithCutoff(owner, packageName, keepNUntagged, olderThan)
        : deleteUntagged
          ? repository.getDeleteUntaggedPlanWithCutoff(owner, packageName, olderThan)
          : repository.getDeleteTagsPlanWithCutoff(owner, packageName, deleteTags, excludeTags, olderThan);
  console.log(JSON.stringify(plan, null, 2));
  database.close();
  return 0;
}

function resolveKeepCount(optionName: string, rawValue: string): number {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }

  return Number.parseInt(rawValue, 10);
}
