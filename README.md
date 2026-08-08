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
- Ambiguous classes produce a short actionable error; `list_classes` is only a fallback.
- Session expiry is retried once after a safe Chrome-cookie refresh.

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
- removes separators and decorative emoji;
- places standards in the lesson body;
- uses Arial at the editor's default size;
- bolds section and timed subsection headers;
- converts lists to bullets, preserving explicitly numbered steps;
- changes time-range hyphens to en dashes;
- replaces the lesson body instead of retaining Planbook's dummy scaffold.

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

See [Agent handoff](docs/AGENT_HANDOFF.md) for complete usage and recovery rules.

## Development

```bash
npm install
npm test
```

The test suite covers date validation, title extraction, lesson formatting,
class resolution, ambiguity handling, and existing-lesson detection.

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
