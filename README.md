# Planbook MCP

An unofficial, token-efficient MCP server for creating and updating lessons in
[Planbook](https://planbook.com) through its web application's API.

Version 2 is designed around one agent action: pass the date, period, and raw
lesson plan to `upsert_lesson`. The server handles class lookup, existing-lesson
lookup, formatting, replacement, saving, and verification.

## Why v2 is leaner

- One normal tool call instead of `get_classes` → `get_lessons` → HTML generation → `save_lesson`.
- Raw pasted lesson text is formatted deterministically inside the server.
- Tool results are compact structured objects, not full Planbook API responses.
- Existing lessons are resolved from Planbook's full-year class payload, making retries idempotent.
- Nested event-feed lessons inherit their parent day, so an adjacent-day event can never satisfy the requested date.
- Reads and writes fail closed when Planbook has a different school year active instead of treating the target as an empty lesson.
- Save requests mirror Planbook's first-party date/class/slot contract and omit browser-only identity and linked-edit flags.
- Dates outside a class's normal sequence automatically use Planbook's extra-lesson slot instead of silently no-oping.
- Extra lessons are discovered and verified through Planbook's date-event feed, making retries update the same record.
- Verification compares the complete saved body and formatting structure, rejects visible Markdown, and normalizes Planbook's HTML entities.
- Ambiguous classes produce a short actionable error; `list_classes` is only a fallback.
- Session expiry is retried once after a safe Chrome-cookie refresh.
- Save verification performs short bounded read-back retries to tolerate API propagation without agent retries.

The design aligns with modern schema-constrained tool calling: the model supplies
small validated arguments while deterministic code owns repetitive transformation
and API work.

## Tools

| Tool | Purpose |
| --- | --- |
| `upsert_lesson` | Create or replace one lesson in a single call; supports `dryRun` |
| `get_lesson` | Read one lesson summary by date and period; HTML is optional |
| `list_classes` | Compact date-aware diagnostic list used only when a period is ambiguous |

### One-call example

```json
{
  "date": "2026-05-11",
  "period": 3,
  "lessonPlan": "Lesson Title\nPoetry Assessment and Rhythm Analysis\n\nStandards\nELA.8.R.1.1 - Analyze how text structures contribute to meaning\n\nEssential Question\nHow does rhythm affect meaning?"
}
```

The formatter automatically:

- extracts a `Lesson Title` block when `title` is omitted;
- extracts a leading Markdown H1 as the lesson title and removes Markdown heading, nested bold/italic, code, and escape markers from the saved body;
- removes separators and decorative emoji;
- places standards in the lesson body;
- uses Arial at the editor's default size;
- bolds section and timed subsection headers;
- soft-separates every timed header for scanability;
- bolds `ESOL Strategies`, `Materials`, `Agenda`, and `Pages / Materials` like other major sections;
- converts semantic and source-marked lists to bullets, preserving explicitly numbered steps;
- changes only time-range hyphens to en dashes while preserving other source punctuation;
- replaces the lesson body instead of retaining Planbook's dummy scaffold.

Agents should still pass the user's raw lesson text unchanged. Markdown cleanup is
deterministic server behavior, so plans copied from ChatGPT, Markdown documents,
or plain text follow the same Planbook formatting contract without agent-side HTML.

## Install

Requirements:

- macOS
- Node.js 20+
- Python 3
- Google Chrome logged into Planbook

```bash
git clone https://github.com/hernan0078/planbook-mcp.git
cd planbook-mcp
./install.sh
npm run refresh
```

### Fast Codex installation on macOS

The Codex installer builds the server, registers the global `planbook` STDIO MCP,
and installs the bundled `planbook-lesson-entry` skill:

```bash
git clone https://github.com/hernan0078/planbook-mcp.git
cd planbook-mcp
./install-codex.sh
npm run refresh
```

Restart Codex once after installation. An already-running MCP process does not
reload a rebuilt `dist/index.js`; continuing an old process can preserve a bug
that has already been fixed on disk. You can then paste a lesson plan with its
date and period and ask Codex to add it to Planbook. The skill calls
`upsert_lesson` directly with verified overwrite enabled, so the existing lesson
body and dummy scaffold are replaced rather than appended.

The installer checks the normal `codex` command first and falls back to the CLI
bundled with the ChatGPT desktop app. It updates only the `planbook` MCP entry and
the `planbook-lesson-entry` skill; other Codex configuration remains unchanged.

See the complete [Codex installation guide](docs/CODEX_INSTALL.md) for
verification, safe reinstallation, migration, and troubleshooting steps.

`npm run refresh` reads only `api.planbook.com` cookies from the selected local
Chrome profile. Cookie values are never printed, and `cookies.json` is written
with owner-only permissions and ignored by Git.

If Planbook is logged in under a non-default Chrome profile:

```bash
PLANBOOK_CHROME_PROFILE="Profile 1" npm run refresh
```

## Configure an MCP client

Use the absolute path to `dist/index.js`.

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.planbook]
command = "node"
args = ["/absolute/path/to/planbook-mcp/dist/index.js"]
```

### Claude Desktop

Add under `mcpServers` in `claude_desktop_config.json`:

```json
{
  "planbook": {
    "command": "node",
    "args": ["/absolute/path/to/planbook-mcp/dist/index.js"]
  }
}
```

Restart the MCP client after changing its configuration.

## Agent workflow

For normal lesson entry, agents should call `upsert_lesson` immediately. Do not
call `list_classes` or `get_lesson` first. If the server reports that a period is
ambiguous, retry once with `className` from the error or from `list_classes`.

Dates accept `YYYY-MM-DD` (preferred) or `MM/DD/YYYY`. Use `dryRun: true` to test
parsing and formatting without authenticating or changing Planbook.

For this school's rotating schedule, A days contain P1, P3, P5, P7, and P8;
B2 days contain P1, P2, P4, P6, and P8. P1 and P8 meet every day. Do not infer
the rotation from weekday alone because closures can shift it; use the user's A/B2
designation and Planbook's scheduled class dates as the authoritative check.

If Planbook reports that a save was accepted but cannot be verified, do not
immediately submit it again. `upsert_lesson` already performs bounded read-back
retries. Call `get_lesson` once to inspect the target; retry only when it confirms
that the cell is still empty, and pin the retry with `className`.

Verification is intentionally strict: the complete visible lesson text, list and
bold structure, Arial wrapper, timed-header soft breaks, and absence of Markdown
artifacts must all match. A verification failure can therefore mean Planbook
saved the text but changed its formatting; inspect before retrying.

If the active-year guard reports a mismatch, switch the Planbook year selector in
Chrome to the named year and retry. Do not save while another year is active;
Planbook can otherwise return an empty lesson array for a valid future class.

See [Agent handoff](docs/AGENT_HANDOFF.md) for complete usage and recovery rules.
See [Changelog](CHANGELOG.md) for release notes and validation history.

## Development

```bash
npm install
npm test
```

The test suite covers date validation, title extraction, timed and semantic lesson
formatting, class resolution, ambiguity handling, exact event dates, active-year
safety, and existing-lesson detection.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `PLANBOOK_ID_TOKEN` | Optional short-lived API token instead of Chrome cookies |
| `PLANBOOK_COOKIE_FILE` | Override the generated cookie file path |
| `PLANBOOK_REFRESH_SCRIPT` | Override the Python refresh script path |
| `PLANBOOK_CHROME_PROFILE` | Chrome profile path or name such as `Profile 1` |
| `PLANBOOK_KEYCHAIN_SERVICE` | Override macOS Keychain service name |
| `PLANBOOK_KEYCHAIN_ACCOUNT` | Override macOS Keychain account name |

## Migration from v1

Version 2 intentionally replaces nine low-level tools with three goal-oriented
tools. Calls to `save_lesson`, `get_lessons`, `get_settings`, and similar v1 tools
must migrate to `upsert_lesson`, `get_lesson`, or `list_classes`.

The v1 installer contained a second stale copy of the server and the lockfile did
not match `package.json`; both issues are removed in v2.

## Security and support

This project is not affiliated with Planbook. It relies on web-application API
behavior that Planbook may change. Never commit `cookies.json`, share its values,
or expose this local stdio server to untrusted users.
