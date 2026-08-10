#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")" && pwd)"
codex_home="${CODEX_HOME:-$HOME/.codex}"
skill_source="$repo_dir/skills/planbook-lesson-entry"
skill_target="$codex_home/skills/planbook-lesson-entry"

find_codex() {
  local candidate
  for candidate in \
    "${CODEX_CLI_PATH:-}" \
    "$(command -v codex 2>/dev/null || true)" \
    "/Applications/ChatGPT.app/Contents/Resources/codex"; do
    if [[ -n "$candidate" && -x "$candidate" ]] && "$candidate" mcp --help >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

codex_cli="$(find_codex || true)"
if [[ -z "$codex_cli" ]]; then
  echo "A working Codex CLI was not found. Install or open the ChatGPT desktop app first." >&2
  exit 1
fi

"$repo_dir/install.sh"

if "$codex_cli" mcp get planbook >/dev/null 2>&1; then
  "$codex_cli" mcp remove planbook >/dev/null
fi
"$codex_cli" mcp add planbook -- "$(command -v node)" "$repo_dir/dist/index.js"

mkdir -p "$skill_target/agents"
cp "$skill_source/SKILL.md" "$skill_target/SKILL.md"
cp "$skill_source/agents/openai.yaml" "$skill_target/agents/openai.yaml"

echo
echo "Installed the Planbook MCP and lesson-entry skill for Codex."
echo "Log into Planbook in Chrome, then run:"
echo "  cd \"$repo_dir\" && npm run refresh"
echo "Restart Codex once so the new MCP tools load."
