#!/usr/bin/env node

const owner = process.argv[2];
const packageName = process.argv[3];
const token = process.argv[4];

if (!owner || !packageName || !token) {
  throw new Error("usage: node tools/delete-ghcr-package.mjs <owner> <package-name> <token>");
}

const url = new URL(
  `/orgs/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(packageName)}`,
  "https://api.github.com"
).toString();

const response = await fetch(url, {
  method: "DELETE",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "ghcr-manager",
    "X-GitHub-Api-Version": "2022-11-28"
  }
});

if (response.status === 404) {
  process.stdout.write(`Package ${owner}/${packageName} did not exist; continuing.\n`);
  process.exit(0);
}

if (!response.ok) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const message =
    body !== null && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : "unknown error";
  throw new Error(`failed to delete package ${owner}/${packageName}: status ${response.status} - ${message}`);
}

process.stdout.write(`Deleted package ${owner}/${packageName}.\n`);
