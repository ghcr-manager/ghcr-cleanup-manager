import type { CleanupSummary, CleanupSummaryRoot } from "./_cleanup-summary.js";

const _DEFAULT_MAX_DIRECT_TARGET_TAGS = 100;
const _DEFAULT_MAX_ROOTS_PER_SECTION = 100;
const _DEFAULT_MAX_TAGS_PER_ROOT = 4;

export function renderCleanupSummaryMarkdown(
  summary: CleanupSummary,
  options: {
    maxDirectTargetTags?: number;
    maxRootsPerSection?: number;
    maxTagsPerRoot?: number;
  }
): string {
  const maxDirectTargetTags = options.maxDirectTargetTags ?? _DEFAULT_MAX_DIRECT_TARGET_TAGS;
  const maxRootsPerSection = options.maxRootsPerSection ?? _DEFAULT_MAX_ROOTS_PER_SECTION;
  const maxTagsPerRoot = options.maxTagsPerRoot ?? _DEFAULT_MAX_TAGS_PER_ROOT;
  const lines = [
    "## Cleanup Summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| 📦 Package | \`${_escapeInlineCode(`${summary.owner}/${summary.packageName}`)}\` |`,
    `| ⚙️ Mode | ${summary.dryRun ? "Cleanup dry-run" : "Cleanup"} |`,
    `| 🏷️ Matched tags | ${summary.validationSummary.directTargetTagCount} |`,
    `| 🗑️ Fully deletable roots | ${summary.validationSummary.fullyDeletableRootCount} |`,
    `| 🔗 Untag-only roots | ${summary.validationSummary.untagOnlyRootCount} |`,
    `| 🛡️ Blocked roots | ${summary.validationSummary.blockedDeleteRootCount} |`,
    `| 📄 Affected manifests | ${summary.affectedManifestCount} |`,
    ""
  ];

  lines.push(..._renderJsonDetails("⚙️ Cleanup filter", summary.plannerInputs));
  lines.push(..._renderDirectTargetTags(summary.directTargetTags, maxDirectTargetTags));
  lines.push(
    ..._renderRootSection("🗑️ Fully deletable roots", summary.fullyDeletableRoots, maxRootsPerSection, maxTagsPerRoot)
  );
  lines.push(..._renderRootSection("🔗 Untag-only roots", summary.untagOnlyRoots, maxRootsPerSection, maxTagsPerRoot));
  lines.push(..._renderRootSection("🛡️ Blocked roots", summary.blockedRoots, maxRootsPerSection, maxTagsPerRoot));

  if (!summary.dryRun && (summary.deletedPackageVersions.length > 0 || summary.untaggedTags.length > 0)) {
    lines.push(..._renderLiveEffects(summary));
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function _renderJsonDetails(title: string, value: unknown): string[] {
  return [
    `<details>`,
    `<summary>${title}</summary>`,
    "",
    "```json",
    JSON.stringify(value, null, 2),
    "```",
    "",
    "</details>",
    ""
  ];
}

function _renderDirectTargetTags(tags: string[], maxDirectTargetTags: number): string[] {
  if (tags.length === 0) {
    return [];
  }

  const visibleTags = tags.slice(0, maxDirectTargetTags).map((tag) => `- \`${_escapeInlineCode(tag)}\``);
  const lines = ["<details>", "<summary>🏷️ Matched tags</summary>", "", ...visibleTags];
  if (tags.length > maxDirectTargetTags) {
    lines.push("", `_Showing first ${maxDirectTargetTags} of ${tags.length} matched tags._`);
  }
  lines.push("", "</details>", "");
  return lines;
}

function _renderRootSection(
  title: string,
  roots: CleanupSummaryRoot[],
  maxRootsPerSection: number,
  maxTagsPerRoot: number
): string[] {
  if (roots.length === 0) {
    return [];
  }

  const lines = ["<details>", `<summary>${title}</summary>`, ""];
  lines.push("| Version | Digest | Tags | Reason |");
  lines.push("| --- | --- | --- | --- |");
  for (const root of roots.slice(0, maxRootsPerSection)) {
    lines.push(
      `| ${root.versionId} | \`${_escapeInlineCode(_shortDigest(root.digest))}\` | ${_escapeMarkdown(_formatTags(root, maxTagsPerRoot))} | ${_escapeMarkdown(_formatReason(root))} |`
    );
  }

  if (roots.length > maxRootsPerSection) {
    lines.push("", `_Showing first ${maxRootsPerSection} of ${roots.length} ${title.toLowerCase()}._`);
  }

  lines.push("", "</details>", "");
  return lines;
}

function _renderLiveEffects(summary: CleanupSummary): string[] {
  const lines = ["### Applied changes", ""];
  lines.push(`- Deleted package versions: ${summary.deletedPackageVersions.length}`);
  lines.push(`- Detached tags: ${summary.untaggedTags.length}`);
  if (summary.unsupportedUntagRoots.length > 0) {
    lines.push(`- Unsupported untag roots: ${summary.unsupportedUntagRoots.length}`);
  }
  lines.push("");
  return lines;
}

function _formatTags(root: CleanupSummaryRoot, maxTagsPerRoot: number): string {
  const tags = root.rootTags.length > 0 ? root.rootTags : root.matchedTags;
  if (tags.length === 0) {
    return "(untagged)";
  }

  const visible = tags.slice(0, maxTagsPerRoot);
  const suffix = tags.length > maxTagsPerRoot ? `, +${tags.length - maxTagsPerRoot} more` : "";
  return visible.join(", ") + suffix;
}

function _formatReason(root: CleanupSummaryRoot): string {
  if (root.validationStatus === "blocked") {
    const blocking = root.blockingDigest ? _shortDigest(root.blockingDigest) : "another root";
    const overlap = root.overlapDigest ? ` via ${_shortDigest(root.overlapDigest)}` : "";
    return `Blocked by ${blocking}${overlap}`;
  }

  if (root.validationStatus === "untag-only") {
    return "Selected tags detach; root remains";
  }

  return "Root and closure can be deleted";
}

function _shortDigest(value: string): string {
  if (!value.startsWith("sha256:") || value.length <= 20) {
    return value;
  }

  return `${value.slice(0, 15)}...${value.slice(-8)}`;
}

function _escapeInlineCode(value: string): string {
  return value.replaceAll("`", "\\`");
}

function _escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
