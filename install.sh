#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required for Chrome cookie refresh." >&2
  exit 1
fi

cd "$repo_dir"
npm ci
npm run build

if ! python3 -c "from Crypto.Cipher import AES" >/dev/null 2>&1; then
  echo "Installing the cookie-decryption dependency for the current user..."
  python3 -m pip install --user pycryptodome
fi

echo
echo "Planbook MCP is built at: $repo_dir/dist/index.js"
echo "Log into Planbook in Chrome, then run:"
echo "  cd \"$repo_dir\" && npm run refresh"
echo
echo "Add this MCP server to your agent configuration:"
echo "  command: node"
echo "  args: [\"$repo_dir/dist/index.js\"]"
