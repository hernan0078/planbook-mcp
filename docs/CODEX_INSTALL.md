# Install Planbook MCP In Codex On macOS

This guide installs the local Planbook MCP and its lesson-entry skill so Codex can accept a pasted lesson plan and place it on the correct Planbook date and class period.

## Requirements

- macOS with Google Chrome
- Node.js 20 or newer
- Python 3
- ChatGPT desktop app or a working Codex CLI
- An active Planbook login in Chrome

## Fast Installation

```bash
git clone https://github.com/hernan0078/planbook-mcp.git
cd planbook-mcp
./install-codex.sh
npm run refresh
```

Restart Codex once after installation. New tasks will then load the `planbook` MCP and `planbook-lesson-entry` skill.

## What The Installer Changes

The installer:

- installs exact Node dependencies with `npm ci` and builds TypeScript;
- registers a global `planbook` STDIO MCP in `~/.codex/config.toml`;
- installs the skill under `~/.codex/skills/planbook-lesson-entry`;
- updates only the existing `planbook` MCP entry when reinstalling;
- leaves all unrelated Codex MCP servers, plugins, and settings unchanged.

The configured command points to this clone's absolute `dist/index.js` path. Do not move or delete the repository without reinstalling from its new location.

## Authentication

`npm run refresh` reads only `api.planbook.com` cookies from the local Chrome profile, decrypts them through macOS Keychain, and writes `cookies.json` with owner-only permissions. Cookie identifiers and values are not printed, and the file is ignored by Git.

For a non-default Chrome profile:

```bash
PLANBOOK_CHROME_PROFILE="Profile 1" npm run refresh
```

## Verify The Installation

```bash
/Applications/ChatGPT.app/Contents/Resources/codex mcp get planbook
npm test
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  ~/.codex/skills/planbook-lesson-entry
```

The MCP registration should show an enabled STDIO server whose command is Node and whose argument is the absolute path to `dist/index.js`.

After restarting Codex, paste a lesson with its date and period and ask:

`Add this lesson to Planbook.`

The skill calls `upsert_lesson` with verified overwrite enabled. The MCP resolves the school year and class, replaces the entire lesson body, applies Arial formatting, saves, and reads the target back for verification.

## Troubleshooting

### Planbook MCP tools are missing

Restart Codex after installation. Local MCP configuration is loaded when a new Codex host/session starts.

### The `codex` command is broken

The installer automatically tries the CLI bundled with the ChatGPT desktop app at:

```text
/Applications/ChatGPT.app/Contents/Resources/codex
```

### Authentication expired

Open Planbook in Chrome, confirm you are logged in, then run `npm run refresh` again. The MCP also retries one expired session automatically.

### Planbook has another school year active

Planbook can return an empty lesson array for a valid class when its year selector
is set to another school year, even when the API request includes the target year.
Version 2.0.3 and later detects this mismatch and stops before saving. In Chrome,
open Planbook, select the school year named in the error, and retry the MCP call.

### The repository moved

Run `./install-codex.sh` from the new location. It replaces only the `planbook` MCP entry with the new absolute path.

### A new empty lesson is accepted but not visible

Update to version 2.0.2 or newer and rerun `./install-codex.sh`. Earlier v2
builds sent browser-only identity and linked-edit fields that Planbook's own
save client omits, which could leave blank cells unchanged. Current releases
mirror the first-party save contract, automatically select an extra-lesson slot
for dates outside the class sequence, verify extras through the date-event feed,
and perform bounded read-back retries.

### A lesson appears unchanged after a verified update

Planbook's open plan view may retain its pre-update class payload. Reload the
Planbook page or leave and return to the date before judging the rendered result.
Use `get_lesson` for the authoritative saved HTML check.

## Safe Reinstallation

Pull the latest release and rerun the installer:

```bash
git pull --ff-only
./install-codex.sh
npm run refresh
```

Restart Codex after an MCP or skill update. Rebuilding the repository does not
hot-reload an MCP process that is already running.

Unlabeled lesson titles may be followed by either a `Standards` header or a
standard-coded bullet. Pass both forms unchanged; the MCP removes the title from
the lesson body after using it for Planbook's title field.
Starting in v2.0.12, one course subtitle may appear between the title and
`Standards`; the subtitle remains in the body. Numeric paste entities such as
`&#x44;` are decoded, and bold `0-5 min | ...` prefixes become verified timed
headers with soft breaks.
Starting in v2.0.14, an `ESOL` or `ELL` course label may precede the title while
a duration/pages subtitle follows it; both metadata lines remain in the lesson
body and only the middle line becomes Planbook's lesson title.
Starting in v2.0.15, the redundant numbered course label is omitted from the
lesson body while the useful duration/pages subtitle remains. This also handles
pipe-delimited metadata such as `ESOL 1-2 HS | 50-Minute Lesson` by retaining
only `50-Minute Lesson`. Filtering ends at `Standards`, preserving later ESOL
instructional text and strategies.
Starting in v2.0.16, `Teacher Review Guide` and `Blooket Review` are recognized
as bold major sections. Numbered instructional checkpoints followed by
`Model:`, `Quick check:`, or `Contrast:` remain bold numbered subsection labels,
and Blooket detail lines render as bullets.
Starting in v2.0.17, pipe-delimited lines in inferred semantic list sections
such as `Agenda`, `Materials`, and `ESOL Strategies` become separate bullets.
Narrative text and explicitly marked source bullets keep their pipes unchanged.
Starting in v2.0.18, explicit bullet or numbered groups no longer cause later
teacher/student narrative to be inferred as list items. Common activity cues,
Book/Workbook activity references, and vocabulary/grammar review labels render
as bold subsections while preserving the source wording.
Starting in v2.0.19, implicit-list inference also stops when a new explicit list
begins after plain prompt text. Presentation slide markers, unit-exam labels,
and homophonic/homographic/compound pun labels render as bold subsections.

After a formatting-related update, use `get_lesson` with `includeHtml: true` to
audit lessons written by the previous version. Confirm Arial, bold major and
timed headers, a soft break after each timed header, preserved lists, and no
visible `#`, `**`, single-asterisk italics, backticks, or escaped Markdown.
Also confirm copied whitespace entities such as `&#x20;`, `&#32;`, and `&nbsp;`
and trailing Markdown hard-break backslashes are absent.
Directional symbols may be returned by Planbook as equivalent HTML entities
such as `&darr;`; v2.0.11 normalizes them during exact read-back verification.
Curly quotes and apostrophes may likewise return as `&ldquo;`, `&rdquo;`, or
`&rsquo;`; v2.0.13 normalizes those entities without weakening text or
formatting checks.
Reinstalling prevents future defects but does not automatically rewrite saved
Planbook lessons.
