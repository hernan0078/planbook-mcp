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

## Recovery

- If multiple classes match a period, call `list_classes` with the same date, then retry `upsert_lesson` once with `className`.
- If verification fails, call `get_lesson` once. Do not immediately resubmit.
- If authentication fails, ask the user to log into Planbook in Chrome, run `npm run refresh` in the installed MCP folder, and retry.
- If the `planbook` MCP is unavailable, ask the user to restart Codex so the new MCP configuration loads. Do not silently fall back to browser automation.

## Multiple Lessons

Parse each lesson independently and complete one verified `upsert_lesson` call before starting the next. Summarize all completed date, period, and title combinations at the end.

## Confirmation

After success, use a concise confirmation such as:

`Added [Title] to Planbook for [Day, Date], Period [X], and verified the saved lesson.`
