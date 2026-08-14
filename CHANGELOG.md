# Changelog

## 2.0.5 - 2026-08-14

### Fixed

- Nested Markdown emphasis, including bold prompts containing italicized titles, is removed without consuming source bullets or answer blanks.
- Save verification now checks the complete normalized lesson body, Arial wrapper, list and bold structure, visible Markdown artifacts, and timed-header soft breaks instead of accepting a 120-character prefix.
- Ordinary hyphens and source punctuation are preserved; only hyphens inside time ranges are normalized to en dashes.
- Single-character `⸻` separators are removed consistently.

### Documented

- Added stale-MCP restart guidance and a post-upgrade saved-HTML audit checklist to the README, Codex installation guide, skill, and agent handoff.
- Clarified that a rebuild prevents future formatting defects but does not rewrite lessons saved by an already-running older process.

### Verified

- Added regressions for nested bold/italic Markdown, escaped answer blanks, full-body save verification, formatting-structure mismatches, and Planbook HTML entities.
- Ran 21 automated tests and dry-ran all original affected lesson sources.
- Replaced and verified 17 affected lessons, then audited all 25 scheduled lessons for August 17–21, 2026: 25 passed with Arial, 208 bold soft-separated timed headers, 1,672 list items, bold major headers, and no visible Markdown.

## 2.0.4 - 2026-08-11

### Fixed

- Markdown lesson plans now save without literal `#`, `**`, backtick, or escaped-underscore markers.
- A leading Markdown H1 is extracted as the lesson title and omitted from the lesson body.
- Markdown section levels feed the existing bold-header, timed-header, bullet, Arial, and ESOL strategy formatting rules without agent-side preprocessing.

### Documented

- Clarified in the README, skill, and agent handoff that agents must send Markdown lesson text unchanged because deterministic server code owns cleanup.

### Verified

- Added a Markdown regression fixture covering H1 title extraction, major and timed headings, bold text, escaped blanks, standards, materials, and ESOL strategies.
- Ran 18 automated tests and dry-ran the complete 5,062-character Unit 1 lesson with 14 headers, six timed soft breaks, 86 list items, Arial, and no leaked Markdown syntax.

## 2.0.3 - 2026-08-11

### Fixed

- `ESOL Strategies`, `Materials`, `Agenda`, and `Pages / Materials` now render as bold major headers.
- Every timed section is recognized in parenthesized or trailing-dash form, normalized to an en-dash range, bolded, and followed by a soft break.
- Source bullets and explicit numbering remain intact; clear standards, objectives, agenda, materials, assessment, ESOL strategy, and colon-introduced groups now receive consistent bullets.
- Blank lines inside a copied list no longer split it into multiple one-item lists.
- Nested Planbook event lessons now inherit their parent day, preventing a Friday lesson from being returned for Thursday.
- Lesson reads and writes now fail closed when Planbook's active school year differs from the resolved class year, preventing false-empty lookups and accidental extra lessons.

### Documented

- Added the school rotation: A days use P1/P3/P5/P7/P8, B2 days use P1/P2/P4/P6/P8, and P1/P8 meet daily.
- Added active-year recovery, stale browser-cache guidance, exact-date agent behavior, and the expanded formatting contract to the README, install guide, skill, and agent handoff.

### Verified

- Ran 17 automated formatter, resolver, payload, active-year, and verification tests.
- Dry-ran the original lesson sources and updated all five scheduled lessons on Thursday, August 13, 2026 and all five scheduled lessons on Friday, August 14, 2026 with verified read-back.
- Audited all saved HTML for Arial, bold/soft-separated timed sections, bullet lists, and bold ESOL strategy headers; confirmed the corrected rendering in a freshly reloaded Planbook day view.

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
