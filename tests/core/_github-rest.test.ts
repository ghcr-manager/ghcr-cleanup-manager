import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTransportErrorMessage,
  isRetryableGitHubApiStatus,
  runGitHubApiWithRetry,
  throwIfRetryableGitHubApiResponse
} from "../../src/core/index.js";

test("GitHub REST helper identifies retryable statuses", () => {
  assert.equal(isRetryableGitHubApiStatus(429), true);
  assert.equal(isRetryableGitHubApiStatus(404), false);
});

test("GitHub REST helper formats transport errors with nested causes", () => {
  const transportError = new TypeError("fetch failed", {
    cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })
  });

  assert.equal(
    buildTransportErrorMessage(transportError, "request failed"),
    "request failed - fetch failed - socket hang up (ECONNRESET)"
  );
});

test("GitHub REST helper retries retryable errors and logs warnings", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const warnings: string[] = [];
  let attempts = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    const result = await runGitHubApiWithRetry(
      "request",
      {
        warn(message) {
          warnings.push(message);
        }
      },
      3,
      1000,
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("fetch failed");
        }
        return "ok";
      }
    );

    assert.equal(result, "ok");
    assert.equal(attempts, 3);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0] ?? "", /request failed on attempt 1\/4; retrying in 1000ms - fetch failed/);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("GitHub REST helper retries rate-limited responses until reset", async () => {
  const originalDateNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  const warnings: string[] = [];
  let nowMs = 1_000;

  Date.now = () => nowMs;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number) => {
    nowMs += Number(delay ?? 0);
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    let attempts = 0;
    const result = await runGitHubApiWithRetry(
      "request",
      {
        warn(message) {
          warnings.push(message);
        }
      },
      3,
      1000,
      async () => {
        attempts += 1;
        const response =
          attempts === 1
            ? {
                ok: false,
                status: 403,
                headers: new Headers({
                  "content-type": "application/json",
                  "x-ratelimit-remaining": "0",
                  "x-ratelimit-reset": "3"
                }),
                async json() {
                  return { message: "API rate limit exceeded for installation" };
                }
              }
            : {
                ok: true,
                status: 204,
                headers: new Headers(),
                async json() {
                  return {};
                }
              };
        await throwIfRetryableGitHubApiResponse(response, "request failed", 1000);
        return "ok";
      }
    );

    assert.equal(result, "ok");
    assert.equal(attempts, 2);
    assert.match(
      warnings[0] ?? "",
      /request failed on attempt 1\/4; retrying in 2000ms - request failed - status 403 - API rate limit exceeded for installation/
    );
  } finally {
    Date.now = originalDateNow;
    globalThis.setTimeout = originalSetTimeout;
  }
});
