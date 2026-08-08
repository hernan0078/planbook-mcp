# Agent Handoff

## Goal

Use this MCP to place a pasted lesson plan into the correct Planbook date and
period with one tool call and a small result.

## Normal call

Call `upsert_lesson` with:

- `date`: ISO `YYYY-MM-DD` whenever possible
- `period`: a number or label such as `3` or `P3`
- `lessonPlan`: the user's raw lesson text, unchanged
- `title`: only when the raw plan has no `Lesson Title` block

Defaults already match normal operation:

- `overwrite: true`
- `verify: true`
- `dryRun: false`

Do not generate HTML. Do not call class or lesson discovery first. The MCP owns
formatting, class resolution, full-year lesson lookup, upsert, and verification.

## Compact recovery flow

1. If the error says multiple classes match the period, retry with `className`.
2. Call `list_classes` with the same target `date` only when the error does not provide enough context.
3. If authentication expired, ask the user to log into Planbook in Chrome and run `npm run refresh`.
4. If verification fails, do not immediately submit again; use `get_lesson` to inspect the target once.

## Formatting contract

The server, not the agent, applies these rules:

- Arial, default editor size
- no Planbook dummy scaffold
- standards at the top of the lesson body
- bold standalone section and timed subsection headers
- en dashes in time ranges
- bullet lists by default
- numbered lists only when the source explicitly numbers items
- plain narrative text
- no decorative emoji or horizontal rules

## Dry run

Set `dryRun: true` to validate the date, extract the title, and produce a compact
format summary. Dry runs do not authenticate and do not change Planbook.

## Tool result

`upsert_lesson` returns a short message plus structured fields:

- `action`: `created`, `updated`, or `preview`
- target date/class/period
- title and lesson ID when available
- `verified`
- heading, bullet, and HTML character counts on dry runs only

Do not echo the full lesson plan back to the user after a successful save. A
confirmation with title, date, period, action, and verification state is enough.
