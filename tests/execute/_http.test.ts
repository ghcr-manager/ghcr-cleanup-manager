import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHttpErrorMessage,
  buildTransportErrorMessage,
  isRetryableStatus,
  resolveFetch,
  resolveJsonHeaders,
  runWithRetry
} from "../../src/execute/_http.js";

test("execute http helper identifies retryable statuses", () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(404), false);
});

test("execute http helper formats json error details", async () => {
  const message = await buildHttpErrorMessage(
    {
      status: 404,
      headers: new Headers({ "content-type": "application/json" }),
      async json() {
        return {
          message: "Not Found",
          documentation_url: "https://docs.example.test"
        };
      }
    },
    "fallback"
  );

  assert.equal(message, "fallback - status 404 - Not Found - https://docs.example.test");
});

test("execute http helper includes auth challenge and ignores non-json bodies", async () => {
  const message = await buildHttpErrorMessage(
    {
      status: 401,
      headers: new Headers({
        "content-type": "text/plain; charset=utf-8",
        "www-authenticate": 'Bearer realm="ghcr.io"'
      }),
      async json() {
        throw new Error("should not parse");
      }
    },
    "fallback"
  );

  assert.equal(message, 'fallback - status 401 - www-authenticate: Bearer realm="ghcr.io"');
});

test("execute http helper resolves content types and transport messages", () => {
  assert.equal(
    resolveJsonHeaders({
      ok: false,
      status: 500,
      headers: new Headers({ "content-type": "application/json; charset=utf-8" }),
      async json() {
        return {};
      }
    }),
    "application/json"
  );
  assert.match(buildTransportErrorMessage("boom", "fallback"), /fallback - boom/);

  const fetchImpl = async () =>
    ({
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() {
        return {};
      }
    }) as Response;
  assert.equal(resolveFetch(fetchImpl), fetchImpl);
});

test("execute http helper retries retryable errors and logs warnings", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const warnings: string[] = [];
  let attempts = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    const result = await runWithRetry(
      "request",
      {
        debug() {},
        info() {},
        warn(message) {
          warnings.push(message);
        },
        error() {}
      },
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
