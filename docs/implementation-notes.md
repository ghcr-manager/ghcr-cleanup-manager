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
- Current release prep: `v1.1.5`

## Current Decisions

- Use a minor `v1.1.0` release for the rename-only publish because runtime behavior is unchanged.
- Use patch `v1.1.2` instead of `v1.1.1` because the earlier release attempt partially published only the main npm
  package before trusted publisher setup was completed for the visualizer package.

## Session Summary

- Manual scan/action DB paths now encode slash-bearing package names into filesystem-safe local filenames while keeping
  the real package name unchanged for API and database behavior.
- Manifest reachability diagnostics now report one concrete unresolved edge when cycle detection fails.
- Synthetic digest-tag helper edges now skip self-references from a digest-tagged artifact back to its own manifest.
- Visualizer docs and package references now consistently use `ghcr-cleanup-manager-visualizer`.
- Visualizer details now show `sha256-*` tags while the graph view continues to hide them from node labels.
- Release validation now fails if repo examples pin `uses: ghcr-manager/...@v...` action references to a version other
  than the current release tag.
- Root action helper prep now runs from `${{ github.action_path }}`, so action-local helper scripts resolve correctly
  when the action is consumed from another repository.

## Checklist

- [x] Reviewed commits after `ca337815` for user-facing impact.
- [x] Classified `1705cb42` as the user-facing fix and the remaining commits as internal cleanup/chore work.
- [x] Updated `CHANGELOG.md` for `v1.1.5`.
- [x] Updated release prep notes for `v1.1.5`.
- [x] Publish `v1.1.5` release artifacts.

## Session Decisions

- Keep debug-oriented manual scan workflow behavior simple; it exists to preserve the DB on scan failures for local
  inspection.
- For cycle failures, a single representative unresolved edge plus the preserved DB is sufficient debugging context.
- Treat `sha256-<digest>`-style tags, including suffix variants such as `.sig`, as digest-derived helper tags; the
  reachability fix only excludes self-edges, not the broader helper-tag model.
