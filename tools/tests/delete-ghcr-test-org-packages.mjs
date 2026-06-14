#!/usr/bin/env node
/* global fetch, process, URL */

const owner = process.argv[2];
const token = process.argv[3];
const nameContains = process.argv[4] ?? "";

if (!owner || !token) {
  throw new Error("usage: node tools/tests/delete-ghcr-test-org-packages.mjs <owner> <token> [name-contains]");
}

const packageNames = await listContainerPackageNames(owner, token);
const matchingPackageNames = nameContains
  ? packageNames.filter((packageName) => packageName.includes(nameContains))
  : packageNames;

if (matchingPackageNames.length === 0) {
  process.stdout.write(`No matching container packages found for ${owner}.\n`);
  process.exit(0);
}

for (const packageName of matchingPackageNames) {
  await deleteContainerPackage(owner, packageName, token);
  process.stdout.write(`Deleted package ${owner}/${packageName}.\n`);
}

process.stdout.write(`Deleted ${matchingPackageNames.length} container package(s) from ${owner}.\n`);

async function listContainerPackageNames(ownerName, authToken) {
  const packageNames = [];

  for (let page = 1; ; page += 1) {
    const url = new URL(`/orgs/${encodeURIComponent(ownerName)}/packages`, "https://api.github.com");
    url.searchParams.set("package_type", "container");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: buildHeaders(authToken)
    });

    if (!response.ok) {
      throw new Error(await buildErrorMessage(response, `failed to list packages for ${ownerName}`));
    }

    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      break;
    }

    for (const item of payload) {
      if (item && typeof item === "object" && typeof item.name === "string") {
        packageNames.push(item.name);
      }
    }

    if (payload.length < 100) {
      break;
    }
  }

  return packageNames.sort((left, right) => left.localeCompare(right));
}

async function deleteContainerPackage(ownerName, packageName, authToken) {
  const url = new URL(
    `/orgs/${encodeURIComponent(ownerName)}/packages/container/${encodeURIComponent(packageName)}`,
    "https://api.github.com"
  );

  const response = await fetch(url, {
    method: "DELETE",
    headers: buildHeaders(authToken)
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    throw new Error(await buildErrorMessage(response, `failed to delete package ${ownerName}/${packageName}`));
  }
}

function buildHeaders(authToken) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${authToken}`,
    "User-Agent": "ghcr-cleanup-manager",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function buildErrorMessage(response, prefix) {
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
  return `${prefix}: status ${response.status} - ${message}`;
}
