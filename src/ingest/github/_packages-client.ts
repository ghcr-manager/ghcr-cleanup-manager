import type { PackageVersionRecord, TagRecord } from "../../core/index.js";
import type { ScanWriter } from "../../db/index.js";
import { loadPackageVersionPage, type GitHubPackageVersionPageItem } from "./_package-version-page-load.js";
import { ingestParallelPaginated } from "./_parallel-paginated-ingest.js";
import { type FetchLike, type GitHubScanOptions } from "./_shared.js";

export async function ingestPackageVersions(
  fetchImpl: FetchLike,
  options: GitHubScanOptions,
  writer: ScanWriter
): Promise<{ packageVersions: number; tags: number }> {
  let tagCount = 0;
  const firstPageItems = await loadPackageVersionPage(fetchImpl, options, 1);
  const result = await ingestParallelPaginated<GitHubPackageVersionPageItem>({
    logger: options.logger,
    firstPageItems,
    loadPage(page) {
      return loadPackageVersionPage(fetchImpl, options, page);
    },
    writePage(pageItems) {
      _writePage(writer, pageItems);
      tagCount += _countTags(pageItems);
    }
  });
  await _assertStableFirstPage(fetchImpl, options, firstPageItems);

  return { packageVersions: result.items, tags: tagCount };
}

export function buildTags(packageVersions: PackageVersionRecord[]): TagRecord[] {
  const tags: TagRecord[] = [];

  for (const version of packageVersions) {
    const metadata = version.metadata?.container;
    const tagNames = Array.isArray((metadata as { tags?: unknown } | undefined)?.tags)
      ? ((metadata as { tags: unknown[] }).tags.filter((tag): tag is string => typeof tag === "string") as string[])
      : [];

    for (const tagName of tagNames) {
      tags.push({
        tag: tagName,
        versionId: version.versionId
      });
    }
  }

  return tags.sort((left, right) => left.tag.localeCompare(right.tag));
}

export function normalizePackageVersions(packageVersions: GitHubPackageVersionPageItem[]): PackageVersionRecord[] {
  return packageVersions
    .map((version) => ({
      versionId: version.id,
      createdAt: version.created_at,
      updatedAt: version.updated_at,
      metadata: version.metadata as Record<string, unknown> | undefined
    }))
    .sort((left, right) => left.versionId - right.versionId);
}

function _writePage(writer: ScanWriter, pageItems: GitHubPackageVersionPageItem[]): void {
  const versions = normalizePackageVersions(pageItems);
  const rawItemsByVersionId = new Map(pageItems.map((pageItem) => [pageItem.id, pageItem]));
  for (const version of versions) {
    writer.insertPackageVersion(version);
    writer.insertPackageVersionPayload(version.versionId, JSON.stringify(rawItemsByVersionId.get(version.versionId)));
  }

  const tags = buildTags(versions);
  for (const tag of tags) {
    writer.insertTag(tag);
  }
}

function _countTags(pageItems: GitHubPackageVersionPageItem[]): number {
  return buildTags(normalizePackageVersions(pageItems)).length;
}

async function _assertStableFirstPage(
  fetchImpl: FetchLike,
  options: GitHubScanOptions,
  initialPageItems: GitHubPackageVersionPageItem[]
): Promise<void> {
  const reloadedPageItems = await loadPackageVersionPage(fetchImpl, options, 1);
  if (_buildPageSignature(initialPageItems) === _buildPageSignature(reloadedPageItems)) {
    return;
  }

  throw new Error(
    `GitHub package-version page 1 changed while scanning ${options.owner}/${options.packageName}; aborting scan`
  );
}

function _buildPageSignature(pageItems: GitHubPackageVersionPageItem[]): string {
  return JSON.stringify(
    pageItems.map((pageItem) => ({
      id: pageItem.id,
      name: pageItem.name,
      createdAt: pageItem.created_at,
      updatedAt: pageItem.updated_at,
      tags: Array.isArray(pageItem.metadata?.container?.tags) ? [...pageItem.metadata.container.tags] : []
    }))
  );
}
