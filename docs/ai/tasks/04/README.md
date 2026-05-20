# 04 Task: Doc Refactor before first release

We are nearing publication of this tool, but the documentation is not ready for that.

## Status

The current `README.md` started as an early work-in-progress document and no longer reflects what users now need. Some
newer parameters and behaviors were added over time, but the overall document structure and style should not be treated
as a strong base for release documentation.

This task should therefore not assume that the current `README.md` merely needs polishing. It may need partial or near
complete replacement in structure, tone, and flow.

## Key Ideas

### User-focused, first-time users first

This tool should help users solve a real problem. The topic is already technically dense, so the documentation should
optimize for:

- ease of first use
- clear guidance into deeper topics only when needed

### Action-first

This is foremost a GitHub Action.

Secondary use cases exist, especially around looking at the exported DB, but they are not the primary entry point. Very
few users will start by running the Node tool locally just to inspect a dry-run result.

### User groups

Users are developers maintaining GHCR image registries of some size or importance. They usually have enough technical
background to operate such tooling, but many will not have detailed GHCR-specific knowledge.

The docs should therefore be technically correct, but written so that users with Docker knowledge can still understand
the important concepts without needing deep registry internals first.

### Low-key users

Most users will want to solve problems such as:

- periodic cleanup of old images while preserving important tags
- removing specific tags safely

For these users, a quick and simple start is critical.

The main entry documentation should not feel like a long manual they must fully read before using the tool. It should be
clear where they can stop once they have enough to succeed safely.

### Medium users

Some users will also want to:

- inspect the DB artifact
- understand what a dry-run cleanup would do before trusting it
- bridge their Docker image knowledge to GHCR-specific structures used by this tool

These users need explanation docs that connect familiar Docker concepts to how GHCR package versions, manifests, tags,
and cleanup behavior are represented here.

### DB documentation

The DB must be documented clearly and completely, but not all parts deserve equal prominence.

The most important goal is helping a user understand a dry-run cleanup result: what was in scope, what was selected,
what was protected, and what would be changed.

That task-oriented reading path should come before table-by-table reference detail.

Some lower-level tables may still need documentation for completeness, but they should not dominate the first reading
path if they are rarely needed for real analysis.

### Advanced readers

Advanced readers and potential contributors do not need the same entry path as ordinary users. For them, deeper
technical and reference-style documentation is appropriate.

### Related action reference

This tool was influenced by `dataaxiom/ghcr-cleanup-action` and should reference that respectfully in user-facing
documentation.

Relevant context:

- local code reference: `../../dataaxiom/ghcr-cleanup-action`
- upstream repository: <https://github.com/dataaxiom/ghcr-cleanup-action>
- thank-you issue: <https://github.com/dataaxiom/ghcr-cleanup-action/issues/116>

The point here is simple acknowledgment. This tool follows a related concept, mirrors parts of the input surface, and in
some areas aims for feature parity or a different implementation approach.

Include a respectful reference to that action where it fits naturally.

## Writing style

Keep it simple.

We do not want to write a book. The topic already contains many technical terms, so precision matters, but clarity for
ordinary developers matters more than sounding maximally technical at every step.

## Documentation structure

The main `README.md` should stay focused on entry-level usage and orientation.

Deeper material should live in a small set of in-repo Markdown docs, linked clearly from the README. The documentation
should be layered:

- quick start and basic usage first
- deeper conceptual explanation second
- reference detail last

A GitHub wiki is probably unnecessary unless this grows far beyond a small, maintainable set of user-facing documents.

If only a handful of focused user docs are needed, keeping them in this repository is the preferred direction.
