import type { PackageVersionRecord, TagRecord } from "../../core/index.js";
import type { ScanWriter } from "../../db/index.js";
import { ingestPaginated } from "./_paginated-ingest.js";
import { buildHttpErrorMessage, type FetchLike, type GitHubScanOptions } from "./_shared.js";

interface _GitHubPackageVersion {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    container?: {
      tags?: string[];
    };
  };
}

export async function ingestPackageVersions(
  fetchImpl: FetchLike,
  githubApiBaseUrl: string,
  options: GitHubScanOptions,
  writer: ScanWriter,
): Promise<{ packageVersions: number; tags: number }> {
  let tagCount = 0;

  const result = await ingestPaginated<_GitHubPackageVersion>({
    logger: options.logger,
    progressLabel: "GitHub package-version pages",
    async loadPage(page) {
      const response = await fetchImpl(_buildPageUrl(githubApiBaseUrl, options, page), {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${options.token}`,
          "User-Agent": "ghcr-manager",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!response.ok) {
        throw new Error(await buildHttpErrorMessage(response, "GitHub Packages request failed"));
      }

      return (await response.json()) as _GitHubPackageVersion[];
    },
    writePage(pageItems) {
      const versions = normalizePackageVersions(pageItems);
      for (const version of versions) {
        writer.insertPackageVersion(version);
      }

      const tags = buildTags(versions);
      for (const tag of tags) {
        writer.insertTag(tag);
      }
      tagCount += tags.length;
    },
  });

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
        digest: version.digest,
        versionId: version.versionId,
      });
    }
  }

  return tags.sort((left, right) => left.tag.localeCompare(right.tag));
}

export function normalizePackageVersions(packageVersions: _GitHubPackageVersion[]): PackageVersionRecord[] {
  return packageVersions
    .map((version) => ({
      versionId: version.id,
      digest: version.name,
      createdAt: version.created_at,
      updatedAt: version.updated_at,
      metadata: version.metadata as Record<string, unknown> | undefined,
    }))
    .sort((left, right) => left.versionId - right.versionId);
}

function _buildPageUrl(githubApiBaseUrl: string, options: GitHubScanOptions, page: number): string {
  const url = new URL(
    `/orgs/${encodeURIComponent(options.owner)}/packages/container/${encodeURIComponent(options.packageName)}/versions`,
    githubApiBaseUrl,
  );
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  return url.toString();
}
