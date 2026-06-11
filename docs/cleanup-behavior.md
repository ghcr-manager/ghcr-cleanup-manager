# Cleanup Behavior

This document explains how GHCR Cleanup Manager decides what stays and what can be removed during `cleanup`.

## Main Idea

GHCR Cleanup Manager is graph-aware. Cleanup is planned against the package's manifest graph, not as a set of isolated
tag deletions.

That is a deliberate design choice. The planner is built to leave the remaining package in a usable, internally
consistent state after cleanup.

In simple packages that often looks like "delete one tag and keep the rest".

In more complex packages, especially with:

- multi-arch index manifests
- shared child manifests
- OCI attestations
- cosign signatures

cleanup can also remove additional manifests that are no longer protected by any retained tag. The intent is to avoid
leaving behind broken, dangling, or half-cleaned graph fragments.

![Shared multi-arch graph with overlapping child images](images/visualizer/graph-2multiarch-base.png "Shared multi-arch graph with overlapping child images")

_Example shared graph: two multi-arch manifests share one child image._

## Protection Model

The main protection boundary is tag reachability.

A manifest is treated as protected when it remains reachable from a retained tag.

A manifest that is no longer reachable from any retained tag is treated as unprotected and may be deleted during
cleanup.

This means:

- retained tags protect the graph section still reachable from them
- untagged or no-longer-reachable graph sections are eligible for deletion

If you rely on digest-only pulls, keep those digests reachable through tags that your cleanup rules retain.

## Cleanup Flow

At a high level, cleanup works like this:

1. Scan the package and build a manifest graph snapshot in SQLite.
2. Resolve direct cleanup targets from the selected rules such as `delete-tags`, `keep-n-tagged`, `delete-untagged`,
   `delete-ghost-images`, `delete-partial-images`, and `delete-orphaned-images`.
3. Identify which tags are retained and therefore still protect reachable manifests.
4. Plan which directly selected roots can be fully deleted and which can only be untagged because other retained tags
   still protect the same graph area.
5. Delete the planned roots and their now-unprotected reachable manifests, or remove only the selected tag when the
   underlying root must stay.

In short:

- selected tags decide where cleanup starts
- retained tags decide what remains protected
- graph reachability decides what else must stay or can go

## Why Cleanup Can Remove More Than One Tag Target

In shared graphs, deleting one tagged root can make adjacent manifests unprotected even if they were not the original
selector match.

This is a deliberate tradeoff. In practice, narrower cleanup strategies tended to leave leftovers behind in complex
graph shapes, especially around shared multi-arch children, cosign signatures, and attestations.

The current planner instead prefers a consistent end state:

- keep the package graph that is still protected by retained tags
- remove graph sections that are no longer protected
- avoid stranded or half-broken remains where possible

This is the intended cleanup model.

## Example

Imagine a package with two multi-arch manifests that share one of their child images and only a leave image and one
multi-arch manifest are tagged.

![Only the left image and left multi-arch manifest are tagged](images/visualizer/graph-2multiarch2tags-base.png "Only the left image and left multi-arch manifest are tagged")

_Example reduced-tag layout: only the left image and left multi-arch manifest are tagged._

If cleanup removes the tagged multi-arch manifest, the manifests on its right are no longer reachable from any retained
tag. In that case the planner can remove that unprotected section instead of leaving behind orphaned graph pieces.

This can feel broader than "delete exactly one tag", but it follows the same rule: keep what is still accessible by tag
and remove what is no longer reachable, so the remaining package graph stays coherent.

![After deleting the only tagged multiarch manifest, only manifests reachable by tags remain](images/visualizer/graph-2multiarch2tags-base--delete-multiarch-a.png "After deleting the only tagged multiarch manifest, only manifests reachable by tags remain")

_Example reduced-tag layout: after deleting the only tagged multiarch manifest, only manifests reachable by tags
remain._

## What To Do Before Live Cleanup

- Start with `dry-run`.
- Read the step summary or summary JSON.
- Use the visualizer when the graph looks non-trivial.
- Be explicit about which tags must remain as protection anchors.
