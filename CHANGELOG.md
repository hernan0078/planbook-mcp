# Changelog

## 2.0.2 - 2026-08-10

### Fixed

- New lessons in empty Planbook cells now mirror the first-party date/class/slot save contract and omit unsupported `lessonId`, conflict snapshot, fetch, and false linked-edit fields.
- Dates outside a class's normal sequence now use Planbook's extra-lesson creation slot automatically.
- Existing extra lessons are discovered and verified through the date-event feed so retries update the same lesson instead of duplicating it.
- Lesson resolution no longer falls back to a record that explicitly belongs to another class.
- Verification now normalizes Planbook-generated HTML entities and punctuation before comparing saved content.
- Save verification now performs bounded read-back retries for short Planbook propagation delays.
- Explicit `success: false`, `ok: false`, and error status responses are reported as failures instead of accepted saves.

### Documented

- Added empty-cell troubleshooting and the safe agent recovery sequence for verification failures.

### Verified

- Added regression tests for the first-party save field set, scheduled-date detection, nested extra-lesson discovery, wrong-class rejection, entity-safe verification, extra-slot selection, and preservation of untouched lesson tabs.
- Ran the full automated test suite, package validation, skill validation, and a live out-of-sequence extra-lesson creation plus verified update.

## 2.0.1 - 2026-08-10

### Added

- `install-codex.sh` for a repeatable macOS Codex installation.
- A bundled MCP-first `planbook-lesson-entry` skill with Codex UI metadata.
- `docs/CODEX_INSTALL.md` with installation, verification, migration, and troubleshooting steps.
- Repository release rules in `AGENTS.md` so future agents document, version, push, and publish every update.

### Changed

- The Codex workflow now uses `upsert_lesson` directly instead of Chrome browser automation.
- The installer detects a working Codex CLI and falls back to the binary bundled with the ChatGPT desktop app when a system wrapper is broken.
- The README now includes a two-command Codex setup path.

### Verified

- Clean `npm ci` build and seven automated tests.
- Bundled and locally installed skill validation.
- End-to-end Codex installer execution and global MCP registration.
- Chrome cookie refresh without printing cookie identifiers or values.
- MCP protocol dry run and live read-only Planbook lesson lookup.

## 2.0.0 - 2026-08-08

- Replaced nine low-level tools with one normal lesson-entry call and two diagnostics.
- Added deterministic Arial lesson formatting, dummy-text replacement, multi-year class resolution, existing-lesson lookup, and verification.
- Added compact structured MCP results, strict TypeScript, automated tests, secure Chrome-cookie refresh, and an agent handoff.
