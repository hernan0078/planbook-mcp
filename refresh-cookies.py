#!/usr/bin/env python3
"""
refresh-cookies.py
Extracts api.planbook.com cookies from Chrome's encrypted database and
saves them to cookies.json for the Planbook MCP server.

Run this whenever the MCP says "session expired":
  python3 refresh-cookies.py

Requirements: pip3 install pycryptodome
"""

import sqlite3, hashlib, json, re, shutil, subprocess, sys, os
from pathlib import Path

try:
    from Crypto.Cipher import AES
except ImportError:
    print("Installing pycryptodome...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pycryptodome", "-q"])
    from Crypto.Cipher import AES

SCRIPT_DIR = Path(__file__).parent
COOKIE_FILE = SCRIPT_DIR / "cookies.json"
CHROME_DB = Path.home() / "Library/Application Support/Google/Chrome/Default/Cookies"
TEMP_DB = Path("/tmp/planbook-chrome-cookies.db")

def get_chrome_key():
    result = subprocess.run(
        ["security", "find-generic-password", "-w", "-s", "Chrome Safe Storage", "-a", "Chrome"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError("Could not read Chrome Safe Storage key from Keychain")
    return result.stdout.strip().encode()

def derive_aes_key(chrome_password: bytes) -> bytes:
    return hashlib.pbkdf2_hmac('sha1', chrome_password, b'saltysalt', 1003, dklen=16)

def decrypt_cookie(enc: bytes, key: bytes) -> str:
    if not enc or enc[:3] != b'v10':
        return enc.decode('utf-8', 'replace') if enc else ""
    iv = b' ' * 16
    dec = AES.new(key, AES.MODE_CBC, IV=iv).decrypt(enc[3:])
    pad = dec[-1]
    raw = dec[:-pad]
    # Skip any binary prefix — find first printable ASCII run
    m = re.search(rb'[\x20-\x7e]{5,}', raw)
    return m.group(0).decode('ascii') if m else ""

def main():
    print("Reading Chrome encryption key from Keychain...")
    chrome_password = get_chrome_key()
    aes_key = derive_aes_key(chrome_password)

    print(f"Copying Chrome cookie database...")
    shutil.copy2(CHROME_DB, TEMP_DB)
    # Also copy WAL/SHM if present
    for ext in ["-wal", "-shm"]:
        src = Path(str(CHROME_DB) + ext)
        if src.exists():
            shutil.copy2(src, Path(str(TEMP_DB) + ext))

    conn = sqlite3.connect(str(TEMP_DB))
    c = conn.cursor()
    c.execute("""
        SELECT name, encrypted_value, value
        FROM cookies
        WHERE host_key = 'api.planbook.com'
    """)
    rows = c.fetchall()
    conn.close()

    cookies = []
    print("Decrypted api.planbook.com cookies:")
    for name, enc_val, plain_val in rows:
        val = plain_val if plain_val else decrypt_cookie(enc_val, aes_key)
        if val:
            cookies.append({"name": name, "value": val, "domain": "api.planbook.com"})
            display = val[:60] + ("..." if len(val) > 60 else "")
            print(f"  {name}: {display}")

    if not cookies:
        print("❌ No api.planbook.com cookies found. Make sure you're logged into Planbook in Chrome.")
        sys.exit(1)

    with open(COOKIE_FILE, "w") as f:
        json.dump(cookies, f, indent=2)

    print(f"\n✅ Saved {len(cookies)} cookies to {COOKIE_FILE}")
    print("The MCP will pick them up on the next tool call.")

if __name__ == "__main__":
    main()
