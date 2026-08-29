# Planbook Lesson Extraction

Planbook MCP v2.1 adds read-only single and bulk lesson exports. These tools use
the same authenticated API client as lesson entry and do not automate Chrome.

## One Lesson

Call `extract_lesson` with:

- `date`: `YYYY-MM-DD` preferred; `MM/DD/YYYY` accepted
- `period`: a number or label such as `3` or `P3`
- `className`: optional disambiguating substring
- `format`: `json`, `markdown`, `text`, or `html`; default `json`

Example:

```json
{
  "date": "2026-09-10",
  "period": "P3",
  "format": "json"
}
```

## Bulk Lessons

Call `extract_lessons` with:

- `startDate`: inclusive first date
- `endDate`: inclusive final date; defaults to `startDate`
- `periods`: optional array; empty selects all classes
- `classNames`: optional case-insensitive substring array
- `format`: export format; default `json`
- `includeEmpty`: include empty class/date slots; default `false`
- `includeWeekends`: include Saturday and Sunday; default `false`

Example:

```json
{
  "startDate": "2026-09-08",
  "endDate": "2026-09-11",
  "periods": [1, 3, 5, 7, 8],
  "format": "json",
  "includeEmpty": false
}
```

Ranges are limited to 31 calendar days. When `periods` and `classNames` are both
provided, a class must match both filters. Results are ordered by date, numeric
period, and class name.

## Formats

`json` returns ordered `sections`. Each section has an optional `heading` and
blocks of these types:

- `paragraph`: a text string
- `list`: an `ordered` flag and item strings
- `table`: rows containing cell strings

`markdown` returns a title, section headings, lists, and Markdown tables. `text`
uses readable headings, list markers, and tab-separated table cells. `html`
returns Planbook's exact saved lesson body, including its HTML entities and
inline formatting.

JSON, Markdown, and text are deterministic normalized views of saved Planbook
HTML. They preserve lesson organization but cannot recover the byte-for-byte raw
source supplied before the lesson was formatted and saved.

## Performance And Token Use

Bulk extraction requests each selected class's full-year feed once. If a target
date may contain an extra lesson outside the normal schedule, the server requests
that date's event feed once and reuses it across all selected classes.

Prefer `json` for PPT and agent workflows because it avoids sending both parsed
content and full HTML. Filter by period or class whenever possible. For very large
lesson plans, split long ranges into smaller calls so downstream model context
stays manageable.

## Recovery

- If authentication expires, log into Planbook in Chrome and run `npm run refresh`.
- If the active school year differs, select the year named by the MCP in Chrome and retry.
- If a period is ambiguous in `extract_lesson`, pass `className`.
- If bulk filters match no classes, call `list_classes` for the first target date and refine the filters.
- Keep `get_lesson` for compact backwards-compatible metadata checks; use the extraction tools when content is needed.
