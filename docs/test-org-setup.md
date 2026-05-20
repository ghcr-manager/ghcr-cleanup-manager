# Test Org Setup

This document records the intended external setup for GHCR live test execution in a dedicated organization namespace.

## Purpose

Use a separate organization for destructive and scenario-based GHCR tests so test packages do not appear under the main
repository's package list.

Current intended organization:

- `gh-workflow-test`

Visibility intent:

- scenario and seeded fixture packages are normally made `public` after publishing
- private-package behavior is covered by dedicated hardening-focused workflows rather than by a separate artifact
  protection path

## Configuration Names

Use these repository-level configuration names:

- variable: `GHCR_TEST_OWNER`
- variable: `GHCR_TEST_PAT_USERNAME`
- secret: `GHCR_TEST_PAT`

Recommended value mapping:

- `GHCR_TEST_OWNER=gh-workflow-test`
- `GHCR_TEST_PAT_USERNAME=<username that owns GHCR_TEST_PAT>`
- `GHCR_TEST_PAT=<classic PAT for a user that can administer packages in gh-workflow-test>`

Current workflow expectation:

- the GHCR live test workflows require both values
- the GHCR live test workflows also require `GHCR_TEST_PAT_USERNAME`
- they fail fast when either value is missing
- they do not fall back to the repository owner namespace

## Token Type

Use a classic personal access token for now.

Required package scopes:

- `read:packages`
- `write:packages`
- `delete:packages`

Notes:

- Prefer a dedicated machine user over a personal human account.
- The token owner needs permission to create, update, and delete GHCR packages in `gh-workflow-test`.
- Keep this token scoped to test-package workflows only.
- `GHCR_TEST_PAT_USERNAME` must match the user account that owns `GHCR_TEST_PAT`.

## Ownership Model

When test-org configuration is enabled, live scenario workflows publish and mutate packages under the configured test
owner rather than the repository owner.

Intended behavior:

- publish scenario packages to `ghcr.io/<GHCR_TEST_OWNER>/...`
- delete scenario packages via the org-scoped GitHub Packages API for `GHCR_TEST_OWNER`
- scan and execute against packages owned by `GHCR_TEST_OWNER`
