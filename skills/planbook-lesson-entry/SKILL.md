---
name: planbook-lesson-entry
description: Enter or replace lesson plans in Planbook for the correct date and class period through the local Planbook MCP. Use whenever the user says to add, enter, upload, paste, or put a lesson in Planbook, or provides lesson-plan text with a date and period. Always use this skill for Planbook lesson entry, including multiple lessons.
---

# Planbook Lesson Entry

Use the `planbook` MCP directly. Do not open Chrome or pre-format HTML unless the user explicitly requests browser entry.

## Normal Workflow

1. Extract the date, period, optional class name, title, and complete raw lesson text.
2. If date, period, or title is genuinely missing or ambiguous, ask one concise question before writing.
3. Call `upsert_lesson` immediately with:
   - `date`: `YYYY-MM-DD` preferred
   - `period`: period number or label
   - `className`: only when needed to disambiguate
   - `title`: only when the raw plan lacks a `Lesson Title` block
   - `lessonPlan`: the user's complete raw lesson plan, unchanged
   - `overwrite: true`
   - `verify: true`
4. Confirm the returned date, class, period, title, action, and `verified` state.

The MCP owns school-year lookup, class resolution, existing-lesson lookup, formatting, replacement, saving, and verification. It replaces the entire LESSON body, removing Planbook dummy text. It always uses Arial at the default editor size and applies the established headers, bullets, and en-dash formatting rules.

Formatting is deterministic: all major headers, including `ESOL Strategies`, are bold; every timed section is bold with an explicit soft break; source bullets and explicit numbering are preserved; clear semantic lists receive bullets; narrative remains plain. Never request or reproduce Impact.

Pass lesson plans unchanged. The MCP extracts a `Lesson Title` block, a leading H1, or an unlabeled first-line title followed by a `Standards` header or standard-coded bullet. It removes Markdown syntax while preserving every remaining Markdown heading as a bold lesson/subsection heading, including lesson-specific labels. The agent must not strip, label, or convert the source first. It preserves source punctuation except for en dashes inside time ranges.

Raw pastes may contain whitespace entities such as `&#x20;`, `&#32;`, or `&nbsp;` and trailing Markdown hard-break backslashes. Pass them unchanged; deterministic server cleanup removes them and verification rejects them if they remain visible.

Markdown tables must also be passed unchanged. The formatter converts them into bordered HTML tables and verification checks that their rows and cells survive Planbook's save process.

Directional symbols must be passed unchanged. Planbook may save arrows as equivalent HTML entities such as `&darr;`; verification normalizes those entities while still requiring the complete text and formatting structure to match.

## A/B2 Schedule

- A day periods: P1, P3, P5, P7, P8.
- B2 day periods: P1, P2, P4, P6, P8.
- P1 and P8 meet every school day.

Do not infer A/B2 from the weekday alone. Use the user's day designation when supplied and let Planbook's scheduled class date remain authoritative.

## Recovery

- If multiple classes match a period, call `list_classes` with the same date, then retry `upsert_lesson` once with `className`.
- If verification fails, call `get_lesson` once. Do not immediately resubmit.
- If authentication fails, ask the user to log into Planbook in Chrome, run `npm run refresh` in the installed MCP folder, and retry.
- If the active school year differs, ask the user to select the year named by the MCP in Planbook's Chrome year selector, then retry. Never treat that error as an empty lesson.
- If the `planbook` MCP is unavailable, ask the user to restart Codex so the new MCP configuration loads. Do not silently fall back to browser automation.
- After an MCP update, restart Codex before writing. A running process keeps the old formatter even when the repository has been rebuilt.
- Treat a formatting verification failure as a real failure. Inspect once with `get_lesson`; do not accept matching text when Markdown, bold/list structure, Arial, or timed-header soft breaks are wrong.

## Multiple Lessons

Parse each lesson independently and complete one verified `upsert_lesson` call before starting the next. Summarize all completed date, period, and title combinations at the end.

## Confirmation

After success, use a concise confirmation such as:

`Added [Title] to Planbook for [Day, Date], Period [X], and verified the saved lesson.`
