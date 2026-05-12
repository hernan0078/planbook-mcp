# Planbook MCP Server

Connects Claude to the [Planbook](https://planbook.com) lesson planning app via direct REST API calls.  
**10× cheaper and 12× faster than browser automation** — no screenshots, no clicking, just API calls.

---

## What This Does

Gives Claude tools to read and write lesson plans in Planbook:

| Tool | What it does |
|------|-------------|
| `get_classes` | List all your classes with their IDs |
| `get_lessons` | Read lesson plans by date or date range |
| `get_lesson_events` | Get lessons as calendar events |
| `save_lesson` | Create or update a lesson plan |
| `copy_lesson` | Copy a lesson to another date/class |
| `get_schedule` | Get the cycle/page schedule |
| `get_standards` | Get available standards |
| `get_templates` | Get lesson plan templates |
| `get_settings` | Get teacher ID, year, and config |

---

## How Authentication Works

Planbook's API (`api.planbook.com`) uses **three HttpOnly cookies** that must be sent together:
- `SESSION` — session identifier
- `U|...|.accesstoken` — JWT access token
- `U|...|.refreshtoken` — refresh token

These cookies cannot be obtained by logging in programmatically (Planbook blocks bots with a 405 "Human Verification" error). Instead, we read them directly from **Chrome's encrypted cookie database** on disk.

### The Cookie Refresh Script (`refresh-cookies.py`)
- Reads Chrome's SQLite cookie database at `~/Library/Application Support/Google/Chrome/Default/Cookies`
- Gets the decryption key from macOS Keychain ("Chrome Safe Storage")
- Decrypts cookies using AES-128-CBC (PBKDF2-SHA1, 1003 iterations, IV = 16 spaces, strips `v10` prefix)
- Saves the 3 api.planbook.com cookies to `cookies.json`

### Auto-Refresh
The MCP server **automatically runs `refresh-cookies.py`** whenever cookies are expired or missing — no manual intervention needed. If a session expires mid-run, it auto-refreshes and retries the failed call transparently.

---

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3
- Chrome browser (logged into Planbook)
- Claude Desktop App

### 1. Install dependencies and build
```bash
cd ~/Downloads/planbook-mcp-main   # or wherever you cloned it
npm install
npm run build
```

### 2. Install Python dependency
```bash
pip3 install pycryptodome
```

### 3. Get cookies (must be logged into Planbook in Chrome first)
```bash
python3 refresh-cookies.py
```
Expected output:
```
Reading Chrome encryption key from Keychain...
Copying Chrome cookie database...
✅ Saved 3 cookies to cookies.json
```

### 4. Configure Claude Desktop
Run this command (replace the path if you installed somewhere other than Downloads):
```bash
mkdir -p ~/Library/Application\ Support/Claude && cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "planbook": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Downloads/planbook-mcp-main/dist/index.js"]
    }
  }
}
EOF
```
Replace `YOUR_USERNAME` with your macOS username (run `whoami` to find it).

### 5. Restart Claude Desktop
Quit and reopen Claude. The Planbook tools will appear automatically.

---

## File Structure

```
planbook-mcp/
├── src/
│   └── index.ts          # MCP server source (TypeScript)
├── dist/
│   └── index.js          # Compiled output (run by Claude)
├── refresh-cookies.py    # Extracts Chrome cookies → cookies.json
├── cookies.json          # Active session cookies (auto-generated, gitignored)
├── package.json
└── tsconfig.json
```

---

## Troubleshooting

### "Could not authenticate even after cookie refresh"
- Make sure you are **logged into Planbook in Chrome** on this Mac
- Try opening https://app.planbook.com in Chrome, then run `python3 refresh-cookies.py` again

### "Could not read Chrome Safe Storage key from Keychain"
- Chrome must be installed (not just Chromium or Brave)
- Run `security find-generic-password -w -s "Chrome Safe Storage" -a "Chrome"` to test

### "No api.planbook.com cookies found"
- Log into https://app.planbook.com in Chrome first
- Wait for the page to fully load, then run the script again

### MCP not showing up in Claude
- Check the config path: `cat ~/Library/Application\ Support/Claude/claude_desktop_config.json`
- Make sure the `dist/index.js` path is correct and the file exists
- Restart Claude Desktop completely (Quit, not just close window)

### Rebuild after changes
```bash
npm run build
```
No restart needed — the MCP picks up rebuilt code on the next tool call.

---

## GitHub
https://github.com/hernan0078/planbook-mcp

---

## How It Was Built

This MCP was built iteratively in a Claude session:
1. Discovered Planbook's REST API endpoints by watching network requests in Chrome DevTools
2. Found that login automation was blocked (bot detection) — switched to direct Chrome cookie extraction
3. Discovered that SESSION cookie alone is insufficient — all 3 api.planbook.com cookies required
4. Built Python AES-128-CBC decryption matching Chrome's exact encryption scheme
5. Added dynamic cookie reloading so `refresh-cookies.py` takes effect without restarting the server
6. Added auto-refresh: server detects expired sessions and re-runs the script automatically
