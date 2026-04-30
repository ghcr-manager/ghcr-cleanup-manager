import type { GitHubScanLogger } from "./_shared.js";
import { packageVersionPageFetchConcurrency, paginatedIngestProgressIntervalPages } from "../../tuning/index.js";

const _DEFAULT_PAGE_SIZE = 100;
const _PROGRESS_LABEL = "GitHub package-version pages";

export interface ParallelPaginatedIngestOptions<T> {
  loadPage(page: number): Promise<T[]>;
  writePage(pageItems: T[], page: number): Promise<void> | void;
  logger: GitHubScanLogger;
}

export interface ParallelPaginatedIngestResult {
  pages: number;
  items: number;
}

export async function ingestParallelPaginated<T>(
  options: ParallelPaginatedIngestOptions<T>
): Promise<ParallelPaginatedIngestResult> {
  const firstPageItems = await options.loadPage(1);
  let pages = 0;
  let items = 0;
  let lastLoggedPage = 0;

  if (firstPageItems.length === 0) {
    return { pages: 0, items: 0 };
  }

  await options.writePage(firstPageItems, 1);
  pages = 1;
  items = firstPageItems.length;
  options.logger.info(`Loaded ${_PROGRESS_LABEL} 1 (${items} items total)`);
  lastLoggedPage = 1;

  if (firstPageItems.length < _DEFAULT_PAGE_SIZE) {
    return { pages, items };
  }

  let nextPage = 2;
  let stopPageExclusive = Number.POSITIVE_INFINITY;
  const workers = Array.from({ length: packageVersionPageFetchConcurrency }, async () => {
    while (nextPage < stopPageExclusive) {
      const page = nextPage;
      nextPage += 1;

      const pageItems = await options.loadPage(page);
      if (pageItems.length === 0) {
        stopPageExclusive = Math.min(stopPageExclusive, page);
        return;
      }

      await options.writePage(pageItems, page);
      pages = Math.max(pages, page);
      items += pageItems.length;

      if (page % paginatedIngestProgressIntervalPages === 0 || pageItems.length < _DEFAULT_PAGE_SIZE) {
        options.logger.info(`Loaded ${_PROGRESS_LABEL} ${page} (${items} items total)`);
        lastLoggedPage = Math.max(lastLoggedPage, page);
      }

      if (pageItems.length < _DEFAULT_PAGE_SIZE) {
        stopPageExclusive = Math.min(stopPageExclusive, page + 1);
        return;
      }
    }
  });
  await Promise.all(workers);

  if (pages > 0 && lastLoggedPage !== pages) {
    options.logger.info(`Loaded ${_PROGRESS_LABEL} ${pages} (${items} items total)`);
  }

  return { pages, items };
}
