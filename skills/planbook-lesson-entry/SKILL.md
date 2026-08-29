---
name: planbook-lesson-entry
description: Enter, replace, or extract lesson plans in Planbook through the local Planbook MCP. Use for lesson entry and for single-day, multi-period, weekly, or date-range lesson exports. Always use this skill for Planbook lesson writes and reads.
---

# Planbook Lesson Workflow

Use the `planbook` MCP directly. Do not open Chrome or pre-format HTML unless the user explicitly requests browser entry.

## Extraction Workflow

1. Use `extract_lesson` when the user requests one date and period.
2. Use `extract_lessons` for multiple dates, periods, classes, a day, or a week.
3. Prefer `format: "json"` for PPT generation and agent-to-agent workflows. It returns ordered paragraph, list, and table blocks without duplicating saved HTML.
4. Use `markdown` or `text` only when a human-readable document is requested. Use `html` only for exact saved Planbook HTML.
5. Bulk extraction defaults to weekdays and nonempty lessons. Use `includeWeekends` or `includeEmpty` only when requested or operationally necessary.
6. Keep each call within 31 calendar days and filter periods/classes when possible to control response size.
7. Confirm the date range, class/period count, lesson count, and empty count without echoing all lesson bodies unless requested.

The extraction tools are read-only. Their normalized formats represent the
saved Planbook content and structure; they do not claim to recreate the exact
raw Markdown or plain text originally pasted before formatting.

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

`Key Teaching Notes` and `Teacher Emphasis` are also treated as bold major instructional labels.

`Teacher Review Guide` and `Blooket Review` are bold major sections. Numbered instructional checkpoints followed by `Model:`, `Quick check:`, or `Contrast:` retain their visible numbers as bold subsection labels rather than becoming separate ordered lists that restart at 1. Plain Blooket review details become bullets.

Pipe-delimited items in inferred semantic list sections such as `Agenda`, `Materials`, and `ESOL Strategies` become separate bullets. Pipes in narrative text and explicitly marked source bullets remain unchanged.

When a colon cue is followed by explicit bullets or numbering, those source markers define the list boundary; subsequent teacher/student narrative returns to plain paragraphs. Plain activity cues such as `On the board`, sentence frames, examples, focus questions, recommended prompts, Book/Workbook activity references, and vocabulary/grammar review labels become bold subsections without changing their wording.

Implicit-list inference also stops when a new explicit bullet or numbered group begins after one or more plain prompt lines. Presentation slide markers, unit-exam labels, and homophonic/homographic/compound pun labels become bold subsections, while later assessment and strategy groups remain separate lists.

Pass lesson plans unchanged. The MCP extracts a `Lesson Title` block, a leading H1, or an unlabeled first-line title followed by a `Standards` header or standard-coded bullet. It also supports one useful duration/pages subtitle between an unlabeled title and `Standards`, preserving the subtitle in the lesson body. It removes Markdown syntax while preserving every remaining Markdown heading as a bold lesson/subsection heading, including lesson-specific labels. The agent must not strip, label, or convert the source first. It preserves source punctuation except for en dashes inside time ranges.

An `ESOL` or `ELL` course label may appear before the title while a duration/pages subtitle appears after it. Pass all three lines unchanged; the MCP extracts the middle title, removes the redundant course label from the Planbook body, and preserves the useful subtitle. It also removes a leading numbered course label from pipe-delimited metadata while preserving the text after the pipe. This filtering stops at `Standards`, so ESOL references in lesson content and `ESOL Strategies` remain unchanged.

Raw pastes may contain whitespace entities such as `&#x20;`, `&#32;`, or `&nbsp;` and trailing Markdown hard-break backslashes. Pass them unchanged; deterministic server cleanup removes them and verification rejects them if they remain visible.

Raw pastes may also contain numeric character entities such as `&#x44;` and bold minute-range prefixes such as `**0-5 min | Bell Ringer**`. Pass them unchanged. The formatter decodes the character entities and renders the minute range as a bold, en-dash-normalized header with an explicit soft break before its directions.

Markdown tables must also be passed unchanged. The formatter converts them into bordered HTML tables and verification checks that their rows and cells survive Planbook's save process.

Directional symbols must be passed unchanged. Planbook may save arrows as equivalent HTML entities such as `&darr;`; verification normalizes those entities while still requiring the complete text and formatting structure to match.

Curly quotes and apostrophes must also be passed unchanged. Planbook may save them as `&ldquo;`, `&rdquo;`, or `&rsquo;`; verification normalizes those equivalent entities while still rejecting any changed words or formatting structure.

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
