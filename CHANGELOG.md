# Changelog

## 2.0.16 - 2026-08-29

### Fixed

- `Teacher Review Guide` and `Blooket Review` now render as bold major sections.
- Numbered instructional checkpoints followed by `Model:`, `Quick check:`, or `Contrast:` now preserve their explicit number as a bold subsection label instead of becoming disconnected ordered lists that restart at 1.
- Plain detail lines under `Blooket Review` now render as bullets.

### Documented

- Updated the README, Codex installation guide, bundled lesson-entry skill, and agent handoff with review-guide, checkpoint, and Blooket formatting behavior.

### Verified

- Added a regression for two numbered grammar checkpoints with model/quick-check content and a Blooket review list.
- The exact September 10 Period 1 dry run extracted the correct title, omitted the redundant course label, preserved the review subtitle, rendered five timed headings and six bold numbered checkpoint headings, rendered all five Blooket details as bullets, preserved 21 total list items and `ESOL Strategies`, and reported zero formatting issues or Markdown leakage.
- Ran all 36 automated tests, the TypeScript build, package dry run, bundled skill validation, MCP startup smoke test, and Git diff validation successfully.

## 2.0.15 - 2026-08-29

### Fixed

- Redundant numbered `ESOL` and `ELL` course labels are now omitted from the leading lesson body because Planbook already displays the class name on each lesson card.
- Pipe-delimited metadata such as `ESOL 1-2 HS | 50-Minute Lesson` now preserves only the useful text after the pipe.
- Course-label filtering stops at `Standards`, preserving objectives, directions, `ESOL Strategies`, and strategy codes that legitimately mention ESOL.

### Documented

- Updated the README, Codex installation guide, bundled lesson-entry skill, and agent handoff with the redundant-course-label rule and its safety boundary.

### Verified

- Added regressions for standalone, spaced-number, and pipe-delimited `ESOL`/`ELL` course labels plus ESOL instructional content after `Standards`.
- The exact August 31 Period 1 source dry-run omitted the standalone course label while preserving the duration/pages subtitle, both course-named materials, `ESOL Strategies`, seven timed headings, 17 list items, and all established formatting with no Markdown leakage or validation issues.
- Ran all 35 automated tests, the TypeScript build, package dry run, bundled skill validation, MCP startup smoke test, and Git diff validation successfully.

## 2.0.14 - 2026-08-29

### Fixed

- Lesson title extraction now supports `ESOL` or `ELL` course metadata before the title and one duration/pages subtitle after it.
- In the sequence `course label → lesson title → subtitle → Standards`, only the lesson title is removed from the body and used for Planbook's title field; both metadata lines remain visible.
- `Key Teaching Notes` and `Teacher Emphasis` now render as bold major instructional labels.

### Documented

- Updated the README, Codex installation guide, bundled lesson-entry skill, and agent handoff with the course-label-first title pattern.

### Verified

- Added a regression based on an `ESOL 1-2 HS` label, a proper/common nouns lesson title, a `50-Minute Lesson | Book p. 8` subtitle, a minute-range Bell Ringer, and the two new instructional labels.
- The exact August 31 Period 1 source dry-run extracted the correct title, preserved the course label and lesson subtitle, formatted seven timed headings and 17 list items, bolded both new instructional labels, removed all entity and Markdown artifacts, and reported zero formatting issues.
- Ran all 33 automated tests, the TypeScript build, package dry run, bundled skill validation, MCP startup smoke test, and Git diff validation successfully.

## 2.0.13 - 2026-08-28

### Fixed

- Exact save verification now treats Planbook's named and numeric typographic quote entities as equivalent to the original curly quotation marks and apostrophes.
- Lessons containing text such as `“Whose pencil is this?”` and `Ana’s notebook` no longer report a false verification failure when Planbook saves the punctuation as `&ldquo;`, `&rdquo;`, and `&rsquo;`.

### Documented

- Updated the README, Codex installation guide, bundled lesson-entry skill, and agent handoff with typographic punctuation entity behavior.

### Verified

- Added a regression that accepts equivalent curly quote entities while still rejecting changed lesson words.
- Diagnosed the live August 31 Period 1 read-back: the correct ESOL class, title, complete visible content, 14 bold elements, 21 list items, five lists, Arial formatting, and all ending materials and ESOL strategies were preserved; only curly punctuation entity encoding prevented v2.0.12 verification.
- Rechecked that live lesson with v2.0.13 and obtained an exact structured match with six timed headings, 21 list items, the preserved ESOL subtitle, zero formatting issues, and no leaked numeric entities.
- Ran all 32 automated tests, the TypeScript build, package dry run, bundled skill validation, MCP startup smoke test, and Git diff validation successfully.

## 2.0.12 - 2026-08-28

### Fixed

- Unlabeled first-line titles are now extracted when one course subtitle or metadata line appears before the `Standards` section; the subtitle remains in the lesson body and the title is not duplicated.
- Numeric paste entities such as `&#x44;`, `&#x55;`, and `&#x53;` are decoded before safe HTML escaping instead of appearing as literal entity text in Planbook.
- Leading bold minute-range blocks such as `**0-5 min | Bell Ringer**Directions` now render as bold timed headers with en-dash ranges and explicit soft breaks before the directions.
- Saved-lesson validation now requires bold and soft-break formatting for minute-range headers in addition to clock-style timestamps.

### Documented

- Updated the README, Codex installation guide, bundled lesson-entry skill, and agent handoff with title-plus-subtitle parsing, numeric-entity cleanup, and minute-range timing behavior.

### Verified

- Added regressions for a bold title followed by an ESOL course subtitle, encoded initial letters, six minute-range lesson blocks, and fail-closed minute-header verification.
- The exact August 31 Period 1 source dry-run extracted the correct title, preserved the course subtitle, formatted six timed headings and 21 list items, removed all entity and Markdown artifacts, and reported zero formatting issues.
- Ran all 31 automated tests, the TypeScript build, package dry run, bundled skill validation, MCP startup smoke test, and Git diff validation successfully.

## 2.0.11 - 2026-08-26

### Fixed

- Exact save verification now treats Planbook's named and numeric directional-arrow entities as equivalent to the original arrow characters.
- Lessons containing instructional flow diagrams such as `PLOT EVENT ↓ CHARACTER INTERACTION` no longer report a false verification failure after Planbook converts `↓` to `&darr;`.

### Documented

- Updated the README, Codex installation guide, bundled lesson-entry skill, and agent handoff with the arrow-entity normalization and recovery behavior.

### Verified

- Added a regression that accepts equivalent arrow entities while still rejecting lost bold structure.
- Diagnosed the live August 26 Period 8 read-back: title, full visible text, 13 bold elements, 29 list items, one ordered list, four unordered lists, Arial formatting, and all end-of-lesson assessment content were preserved; only `↓` versus `&darr;` prevented v2.0.10 verification.
- Rechecked that live lesson with v2.0.11 and obtained an exact structured match with seven timed headings, 29 bullets, zero formatting issues, and no duplicated title.
- Ran all 29 automated tests, the TypeScript build, package dry run, bundled skill validation, MCP startup smoke test, and Git diff validation successfully.

## 2.0.10 - 2026-08-22

### Fixed

- Unlabeled first-line lesson titles are now extracted when the next meaningful line is a standard-coded bullet, even when the source omits a standalone `Standards` header.
- The extracted title is removed from the lesson body, preventing duplication between Planbook's title field and lesson content.

### Documented

- Updated the README, Codex installation guide, skill, and agent handoff so agents pass this compact plain-text lesson format unchanged.

### Verified

- Added a regression based on a characterization lesson whose title is followed directly by ELA standard bullets.
- Ran all 28 automated tests, the TypeScript build, package dry run, bundled skill validation, MCP startup smoke test, Git diff validation, and an exact-source dry run that preserved 155 bullets without duplicating the title or reporting formatting issues.

## 2.0.9 - 2026-08-22

### Fixed

- Raw lesson pastes now remove literal `&#x20;`, `&#32;`, and `&nbsp;` whitespace entities, nonbreaking spaces, and trailing Markdown hard-break backslashes before formatting.
- Save verification now rejects visible pasted whitespace entities and trailing hard-break markers instead of accepting artifact-contaminated lesson text.

### Documented

- Updated the README, Codex installation guide, skill, and agent handoff so agents continue passing raw lesson text unchanged while deterministic server code owns paste-artifact cleanup.

### Verified

- Added formatter and saved-HTML verification regressions based on a Unit 1 vocabulary and grammar review lesson pasted with encoded spaces and line-continuation markers.
- Ran all 27 automated tests, TypeScript build, package dry run, bundled skill validation, MCP startup smoke test, and Git diff validation successfully.

## 2.0.8 - 2026-08-15

### Added

- Markdown tables now render as bordered HTML tables with preserved headers, rows, and cells instead of visible pipe and delimiter syntax.

### Changed

- Save verification now compares table, row, header-cell, and data-cell structure in addition to lesson text, headings, and lists.

### Documented

- Updated the README, skill, and agent handoff so agents pass lesson-plan tables unchanged and deterministic server code owns conversion.

### Verified

- Added a regression fixture for a subject/object-pronoun table and confirmed no Markdown table syntax remains in visible output.
- Saved and read back `Unit 1 - Celebrating Family and Object Pronouns` for August 27, 2026, Period 3; Planbook preserved one table with a two-cell header and seven two-cell pronoun rows.

## 2.0.7 - 2026-08-15

### Fixed

- Every Markdown heading in the lesson body now renders as a bold heading even when its label is lesson-specific, such as `Connect`, `Think`, or `Discuss`.
- Markdown heading markers remain absent from saved Planbook text while their source hierarchy is retained visually.

### Documented

- Updated the README, skill, and agent handoff to clarify deterministic handling of unfamiliar Markdown subsection labels.

### Verified

- Added a regression fixture covering an extracted H1 title, a timed section, and three unfamiliar Markdown subsection headings.

## 2.0.6 - 2026-08-15

### Fixed

- Plain-text plans whose first line is an unlabeled title and whose next section is `Standards` now extract that title automatically instead of duplicating it above Standards in the lesson body.
- Heading-like entries inside Agenda and Assessment, such as `Bell Ringer - Formative`, remain list items while actual lesson section headers retain bold timed formatting.
- Verification recognizes Planbook's `&rightarrow;` encoding as the original `→` character instead of reporting a false text mismatch.

### Documented

- Clarified in the README, skill, and agent handoff that agents must pass this title style unchanged without adding a synthetic label.

### Verified

- Added regression tests proving the title is used for Planbook metadata, omitted from the body, and followed immediately by Standards, that Agenda/Assessment preserve heading-like list items, and that Planbook's right-arrow entity round-trips exactly.

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
