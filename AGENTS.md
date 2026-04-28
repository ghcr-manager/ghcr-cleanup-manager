# AI Agent Playbook

Audience: AI coding agents working in this repo.

## Ground rules

- Markdown: wrap near ~120 chars.
- Keep [README.md](README.md) user-only.
- KISS: default to minimal changes; avoid optional parameters/configs or extra result objects unless explicitly
  requested.
- Visibility first: new modules default to private (`_`); keep constants private unless used outside the module.
- Do not invent new public APIs or config fields unless explicitly requested.
- Do not print `git diff` output or patch hunks in normal progress updates unless explicitly requested.
- Summarize code changes briefly and rely on commit hashes, file paths, and test results instead.
- The repository uses Node.js and TypeScript for build, test, and lint tasks.
- Disabling linters via comments is a last resort; fix first and only suppress with explicit approval.
- For any substantial work, update [docs/implementation-notes.md](docs/implementation-notes.md) before ending the
  session.
- Do not create commits unless the user explicitly asks for a commit after review.
- Keep production TypeScript files small by default:
  - up to about 100 lines is comfortable
  - above about 100 to 160 lines, strongly consider splitting
  - above about 160 to 220 lines, split unless cohesion is unusually strong
  - above about 220 lines is generally not acceptable outside repetitive or low-risk code
- Test files may exceed those sizes when scenario readability or fixture-heavy structure benefits from it.
- Evaluate file size together with cohesion, abstraction level, and testability, not line count alone.

## Linting and tests

- Lint: `./scripts/lint.sh`
- Tests: `npm test`
- Typecheck: `npm run typecheck`

## Session Continuity

- Treat [docs/implementation-notes.md](docs/implementation-notes.md) as the canonical handoff document.
- Keep a checkbox-based checklist there for completed work and the current next plan.
- Record important decisions there when they affect architecture, tooling, or workflow shape.
- When creating a clean checkpoint commit, add the commit hash to the handoff doc.
- Treat commits as user-approved checkpoints, not agent-owned defaults.
- Before starting new implementation work, read the handoff doc and align with its current next plan.
