# Implementation Notes

Active handoff notes for `ghcr-cleanup-manager`.

Previous handoff material was archived to
[docs/archive/implementation-notes.archive3.md](archive/implementation-notes.archive3.md).

## Current Status

- The project was renamed from `ghcr-manager` to `ghcr-cleanup-manager`.
- Runtime: Node.js and TypeScript.
- Main npm package: `ghcr-cleanup-manager`
- Visualizer npm package: `ghcr-cleanup-manager-visualizer`
- Current repo: `ghcr-manager/ghcr-cleanup-manager`
- Current release prep: `v1.1.2` replaces the interrupted `v1.1.1` publish so both npm packages can be released
  together.

## Current Decisions

- Use a minor `v1.1.0` release for the rename-only publish because runtime behavior is unchanged.
- Use patch `v1.1.2` instead of `v1.1.1` because the earlier release attempt partially published only the main npm
  package before trusted publisher setup was completed for the visualizer package.
