import assert from "node:assert/strict";
import test from "node:test";
import { ingestParallelPaginated } from "../../../src/ingest/github/_parallel-paginated-ingest.js";

test("parallel paginated ingest loads later pages concurrently", async () => {
  const loadedPages: number[] = [];
  let activeLoads = 0;
  let maxActiveLoads = 0;

  const result = await ingestParallelPaginated({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    async loadPage(page) {
      activeLoads += 1;
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
      await new Promise((resolve) => setTimeout(resolve, page === 1 ? 1 : 5));
      activeLoads -= 1;

      if (page === 1) {
        return Array.from({ length: 100 }, (_, index) => index);
      }
      if (page === 2) {
        return [100];
      }
      return [];
    },
    writePage(_pageItems, page) {
      loadedPages.push(page);
    }
  });

  assert.deepEqual(result, { pages: 2, items: 101 });
  assert.deepEqual(
    loadedPages.sort((left, right) => left - right),
    [1, 2]
  );
  assert.ok(maxActiveLoads > 1);
});

test("parallel paginated ingest can reuse preloaded page 1 items", async () => {
  let firstPageLoads = 0;

  const result = await ingestParallelPaginated({
    firstPageItems: [{ id: 1 }],
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    async loadPage(page) {
      if (page === 1) {
        firstPageLoads += 1;
      }
      return [];
    },
    writePage() {}
  });

  assert.deepEqual(result, { pages: 1, items: 1 });
  assert.equal(firstPageLoads, 0);
});

test("parallel paginated ingest returns zero pages when page 1 is empty", async () => {
  let writes = 0;

  const result = await ingestParallelPaginated({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    async loadPage() {
      return [];
    },
    writePage() {
      writes += 1;
    }
  });

  assert.deepEqual(result, { pages: 0, items: 0 });
  assert.equal(writes, 0);
});

test("parallel paginated ingest stops after a short first page", async () => {
  const messages: string[] = [];
  const writtenPages: number[] = [];

  const result = await ingestParallelPaginated({
    logger: {
      debug() {},
      info(message) {
        messages.push(message);
      },
      warn() {},
      error() {}
    },
    async loadPage(page) {
      assert.equal(page, 1);
      return [1, 2, 3];
    },
    writePage(_pageItems, page) {
      writtenPages.push(page);
    }
  });

  assert.deepEqual(result, { pages: 1, items: 3 });
  assert.deepEqual(writtenPages, [1]);
  assert.deepEqual(messages, ["Loaded GitHub package-version pages 1 (3 items total)"]);
});

test("parallel paginated ingest logs a final summary when the last full page is followed by an empty page", async () => {
  const messages: string[] = [];

  const result = await ingestParallelPaginated({
    logger: {
      debug() {},
      info(message) {
        messages.push(message);
      },
      warn() {},
      error() {}
    },
    async loadPage(page) {
      if (page <= 3) {
        return Array.from({ length: 100 }, (_, index) => page * 1000 + index);
      }
      return [];
    },
    writePage() {}
  });

  assert.deepEqual(result, { pages: 3, items: 300 });
  assert.deepEqual(messages, [
    "Loaded GitHub package-version pages 1 (100 items total)",
    "Loaded GitHub package-version pages 3 (300 items total)"
  ]);
});
