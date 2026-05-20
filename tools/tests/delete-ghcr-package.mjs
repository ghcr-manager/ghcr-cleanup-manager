#!/usr/bin/env node
/* global fetch, process, URL */

const owner = process.argv[2];
const packageName = process.argv[3];
const token = process.argv[4];

if (!owner || !packageName || !token) {
  throw new Error("usage: node tools/tests/delete-ghcr-package.mjs <owner> <package-name> <token>");
}

const ownerType = await loadOwnerType(owner, token);
const ownerPathSegment = ownerType === "Organization" ? "orgs" : ownerType === "User" ? "users" : undefined;
if (!ownerPathSegment) {
  throw new Error(`unsupported owner type for ${owner}: ${ownerType}`);
}

const url = new URL(
  `/${ownerPathSegment}/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(packageName)}`,
  "https://api.github.com"
).toString();

const response = await fetch(url, {
  method: "DELETE",
  headers: buildHeaders(token)
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

async function loadOwnerType(ownerName, authToken) {
  const url = new URL(`/users/${encodeURIComponent(ownerName)}`, "https://api.github.com").toString();
  const response = await fetch(url, {
    headers: buildHeaders(authToken)
  });
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
    throw new Error(`failed to load owner ${ownerName}: status ${response.status} - ${message}`);
  }

  const payload = await response.json();
  return payload !== null && typeof payload === "object" && "type" in payload ? payload.type : undefined;
}

function buildHeaders(authToken) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${authToken}`,
    "User-Agent": "ghcr-manager",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}
