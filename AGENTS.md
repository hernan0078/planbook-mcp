# Planbook MCP Agent Rules

## Release Discipline

Every functional, setup, authentication, formatting, or agent-workflow change must be documented and published so another agent on another computer can reproduce it.

Before considering an update complete:

1. Update the relevant implementation and automated tests.
2. Update `README.md` and the applicable guide under `docs/`.
3. Update `docs/AGENT_HANDOFF.md` when agent behavior or recovery changes.
4. Add a dated entry to `CHANGELOG.md` describing the user-visible change and verification performed.
5. Bump the package version for a release-worthy change.
6. Run tests, package validation, the skill validator, and safe live/read-only integration checks when available.
7. Commit and push only the intended repository files.
8. Publish a GitHub release whose notes summarize installation, migration, behavior, and validation.

Never commit `cookies.json`, authentication tokens, cookie identifiers, or lesson content obtained during private live verification.

## Lesson Entry Contract

- Use the bundled `planbook-lesson-entry` skill and `upsert_lesson` MCP tool.
- Send raw lesson text unchanged; deterministic server code owns formatting.
- Default to `overwrite: true` and `verify: true` so dummy text is replaced and the saved target is checked.
- Keep Arial at Planbook's default font size.
- Do not silently fall back to browser automation when the MCP is unavailable.
