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
- Bold all major headers, including ESOL Strategies, and every timed header; preserve source lists and soft-separate timed sections.
- Remember the school rotation: A days are P1/P3/P5/P7/P8; B2 days are P1/P2/P4/P6/P8; P1 and P8 meet daily.
- Treat Planbook's scheduled dates as authoritative and fail closed on an active-school-year mismatch.
- Do not silently fall back to browser automation when the MCP is unavailable.

## Lesson Extraction Contract

- Use `extract_lesson` for one date/period and `extract_lessons` for date ranges or multiple classes.
- Prefer structured `json` for downstream agents and PPT builders; request exact `html` only when necessary.
- Bulk ranges are limited to 31 calendar days, default to weekdays, and omit empty slots unless requested.
- Treat normalized Markdown/text/JSON as exports of saved Planbook state, not exact recovery of the original raw paste.
- Keep read-only verification private: never commit or publish extracted lesson content.
