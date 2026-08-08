#!/usr/bin/env python3
"""Export Planbook cookies from a local macOS Chrome profile.

The script never prints cookie values. Set PLANBOOK_CHROME_PROFILE to a profile
directory (or a profile name such as "Profile 1") when auto-discovery chooses
the wrong Chrome profile. Set PLANBOOK_COOKIE_FILE to change the output path.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from Crypto.Cipher import AES
except ImportError:
    print(
        "Missing pycryptodome. Install it with: python3 -m pip install --user pycryptodome",
        file=sys.stderr,
    )
    raise SystemExit(1)


SCRIPT_DIR = Path(__file__).resolve().parent
COOKIE_FILE = Path(os.environ.get("PLANBOOK_COOKIE_FILE", SCRIPT_DIR / "cookies.json")).expanduser()
CHROME_ROOT = Path.home() / "Library/Application Support/Google/Chrome"


def profile_candidates() -> list[Path]:
    configured = os.environ.get("PLANBOOK_CHROME_PROFILE", "").strip()
    if configured:
        path = Path(configured).expanduser()
        if not path.is_absolute():
            path = CHROME_ROOT / path
        if (path / "Cookies").exists():
            return [path]
        raise RuntimeError(f"Chrome profile has no Cookies database: {path}")

    candidates = [CHROME_ROOT / "Default", *CHROME_ROOT.glob("Profile *")]
    return sorted(
        (path for path in candidates if (path / "Cookies").exists()),
        key=lambda path: (path / "Cookies").stat().st_mtime,
        reverse=True,
    )


def copy_database(source: Path) -> Path:
    handle = tempfile.NamedTemporaryFile(prefix="planbook-cookies-", suffix=".db", delete=False)
    handle.close()
    destination = Path(handle.name)
    shutil.copy2(source, destination)
    for extension in ("-wal", "-shm"):
        sidecar = Path(f"{source}{extension}")
        if sidecar.exists():
            shutil.copy2(sidecar, Path(f"{destination}{extension}"))
    return destination


def profile_has_planbook_cookies(profile: Path) -> bool:
    database = copy_database(profile / "Cookies")
    try:
        with sqlite3.connect(database) as connection:
            count = connection.execute(
                "SELECT COUNT(*) FROM cookies WHERE host_key = 'api.planbook.com'"
            ).fetchone()[0]
        return bool(count)
    finally:
        for path in (database, Path(f"{database}-wal"), Path(f"{database}-shm")):
            path.unlink(missing_ok=True)


def select_profile() -> Path:
    candidates = profile_candidates()
    for profile in candidates:
        if profile_has_planbook_cookies(profile):
            return profile
    names = ", ".join(path.name for path in candidates) or "none"
    raise RuntimeError(
        "No api.planbook.com cookies were found. Log into Planbook in Chrome. "
        f"Profiles checked: {names}."
    )


def chrome_password() -> bytes:
    service = os.environ.get("PLANBOOK_KEYCHAIN_SERVICE", "Chrome Safe Storage")
    account = os.environ.get("PLANBOOK_KEYCHAIN_ACCOUNT", "Chrome")
    result = subprocess.run(
        ["security", "find-generic-password", "-w", "-s", service, "-a", account],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Could not read {service!r} from macOS Keychain")
    return result.stdout.strip().encode()


def aes_key(password: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha1", password, b"saltysalt", 1003, dklen=16)


def decrypt_cookie(encrypted: bytes, key: bytes, database_version: int) -> str:
    if not encrypted:
        return ""
    if not encrypted.startswith((b"v10", b"v11")):
        return encrypted.decode("utf-8", "replace")

    decrypted = AES.new(key, AES.MODE_CBC, IV=b" " * 16).decrypt(encrypted[3:])
    padding = decrypted[-1]
    if not 1 <= padding <= 16 or decrypted[-padding:] != bytes([padding]) * padding:
        raise RuntimeError("Chrome cookie decryption produced invalid padding")
    value = decrypted[:-padding]

    # Chrome database version 24+ prefixes encrypted values with SHA256(host_key).
    if database_version >= 24 and len(value) >= 32:
        value = value[32:]
    return value.decode("utf-8", "strict")


def read_cookies(profile: Path) -> list[dict[str, object]]:
    database = copy_database(profile / "Cookies")
    try:
        with sqlite3.connect(database) as connection:
            version_row = connection.execute(
                "SELECT value FROM meta WHERE key = 'version'"
            ).fetchone()
            database_version = int(version_row[0]) if version_row else 0
            rows = connection.execute(
                """
                SELECT host_key, name, path, encrypted_value, value, expires_utc, is_secure
                FROM cookies
                WHERE host_key = 'api.planbook.com'
                """
            ).fetchall()
    finally:
        for path in (database, Path(f"{database}-wal"), Path(f"{database}-shm")):
            path.unlink(missing_ok=True)

    key = aes_key(chrome_password())
    cookies: list[dict[str, object]] = []
    for domain, name, path, encrypted, plain, expires, secure in rows:
        value = plain or decrypt_cookie(encrypted, key, database_version)
        if value:
            cookies.append(
                {
                    "name": name,
                    "value": value,
                    "domain": domain,
                    "path": path,
                    "expires": expires,
                    "secure": bool(secure),
                }
            )
    return cookies


def main() -> int:
    try:
        profile = select_profile()
        cookies = read_cookies(profile)
        if not cookies:
            raise RuntimeError("Planbook cookies were found but could not be decrypted")

        COOKIE_FILE.parent.mkdir(parents=True, exist_ok=True)
        COOKIE_FILE.write_text(json.dumps(cookies, indent=2), encoding="utf-8")
        COOKIE_FILE.chmod(0o600)
        print(f"Saved {len(cookies)} Planbook cookies from Chrome {profile.name}.")
        print(f"Output: {COOKIE_FILE}")
        return 0
    except Exception as error:  # concise CLI boundary
        print(f"Cookie refresh failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
