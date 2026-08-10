# Changelog

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
