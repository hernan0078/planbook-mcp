# Agent Handoff

## Installation

On a new macOS computer, follow [CODEX_INSTALL.md](CODEX_INSTALL.md). The bundled
installer registers the `planbook` MCP and installs this workflow as a Codex
skill. Restart Codex after installation or any MCP/skill update.

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
Send Markdown plans unchanged: the formatter extracts a leading `#` title and
removes Markdown heading, nested bold/italic, inline-code, and escaped-character
markers before applying Planbook formatting.
It also removes copied whitespace entities (`&#x20;`, `&#32;`, `&nbsp;`) and
trailing Markdown hard-break backslashes. Agents must not clean these manually.
An unlabeled first line is also extracted as the title when the next content is
a `Standards` header or a standard-coded bullet. Do not add a synthetic
`Lesson Title` label or remove that line.
Every remaining Markdown heading is preserved as a bold lesson heading even
when its label is lesson-specific and not in the formatter's known-header list.
Markdown tables are rendered as real HTML tables with their header and cell text
preserved; agents must not flatten or pre-convert them.

## Compact recovery flow

1. If the error says multiple classes match the period, retry with `className`.
2. Call `list_classes` with the same target `date` only when the error does not provide enough context.
3. If authentication expired, ask the user to log into Planbook in Chrome and run `npm run refresh`.
4. If verification fails, do not immediately submit again; the MCP has already retried its read-back. Use `get_lesson` to inspect the target once.
5. Retry once with the resolved `className` only when `get_lesson` confirms the target cell is still empty.
6. If the MCP names a different active school year, switch Planbook's year selector in Chrome to the requested year, then retry once.

The MCP mirrors Planbook's first-party date/class/extra-slot save contract and
intentionally omits browser-only identity and linked-edit flags. Agents should
never construct or modify these payloads themselves; always use `upsert_lesson`.
When the requested date is within the school year but outside the class's normal
sequence, the MCP automatically creates an extra lesson for that date.
Extra lessons are read back from the date-event feed because Planbook omits them
from the class's full-year sequence; retries therefore update the existing extra
slot instead of creating duplicates.
Class IDs remain authoritative during recovery; the resolver never substitutes a
single lesson record that explicitly belongs to another period.
Verification normalizes Planbook-generated HTML entities, including directional
arrow entities such as `&darr;`, compares the complete
visible body, matches list and bold structure, and rejects visible Markdown or
malformed timed headings. It no longer accepts a save merely because its first
120 normalized characters match.
Event-feed lessons inherit the date of their parent day record. Never accept a
lesson ID returned for a neighboring day as proof that the requested cell exists.
The MCP also refuses lesson reads and writes when Planbook's active year differs
from the resolved class year; this prevents false-empty results and accidental
extra lessons.

## A/B2 Schedule

- A day: P1, P3, P5, P7, P8
- B2 day: P1, P2, P4, P6, P8
- P1 and P8 meet every school day.

Use the user's A/B2 designation and Planbook's scheduled class dates. Do not
derive the rotation from weekday alone because holidays and closures can shift it.

## Formatting contract

The server, not the agent, applies these rules:

- Arial, default editor size
- no Planbook dummy scaffold
- standards at the top of the lesson body
- bold standalone section headers, including `ESOL Strategies`, `Materials`, `Agenda`, and `Pages / Materials`
- bold every timed subsection whether its source uses parentheses or a trailing dash
- an explicit soft break after each timed header
- en dashes in time ranges
- source-marked bullets plus inferred bullets for clear standards, objectives, agenda, materials, assessment, ESOL strategy, and colon-introduced parallel lists
- numbered lists only when the source explicitly numbers items
- plain narrative text
- no decorative emoji or horizontal rules
- no literal Markdown `#`, `**`, backtick, or escaped-underscore markers
- no literal single-asterisk italics, including nested emphasis around book or story titles
- no literal pasted whitespace entities or trailing Markdown hard-break backslashes
- source punctuation remains unchanged except hyphens inside time ranges, which become en dashes

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

## Maintenance Handoff

Every implementation or workflow update must also update the applicable guide,
`CHANGELOG.md`, and release notes, then be pushed and published on GitHub. Follow
the repository checklist in `AGENTS.md`.

After pulling or rebuilding the MCP, restart Codex before any live write. An open
MCP process keeps its loaded formatter even when `dist/index.js` changes on disk.
For a formatting release, audit existing lessons written by the older process;
upgrading prevents future defects but does not rewrite already-saved HTML.
