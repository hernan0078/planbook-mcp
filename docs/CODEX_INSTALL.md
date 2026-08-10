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

### The repository moved

Run `./install-codex.sh` from the new location. It replaces only the `planbook` MCP entry with the new absolute path.

### A new empty lesson is accepted but not visible

Update to version 2.0.2 or newer and rerun `./install-codex.sh`. Earlier v2
builds sent browser-only identity and linked-edit fields that Planbook's own
save client omits, which could leave blank cells unchanged. Current releases
mirror the first-party save contract, automatically select an extra-lesson slot
for dates outside the class sequence, verify extras through the date-event feed,
and perform bounded read-back retries.

## Safe Reinstallation

Pull the latest release and rerun the installer:

```bash
git pull --ff-only
./install-codex.sh
npm run refresh
```

Restart Codex after an MCP or skill update.
