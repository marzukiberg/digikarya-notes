#!/usr/bin/env python3
"""Sync Vercel env vars for digikarya-notes from the live Firebase build's bundle.

Extracts the VITE_* values inlined by Vite in the live bundle at
https://digikarya-notes.web.app and writes them as (encrypted) env vars on the
Vercel project. Values are never printed.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from urllib.error import HTTPError

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
import dynamic_credentials as dc

CREDENTIAL = "custom.vercel"
ALLOWED = ["api.vercel.com"]
BASE = "https://api.vercel.com"
PROJECT_ID = "prj_wMBcQKHXTUU4a60pOXYJJbjffkAA"
BUNDLE = "/tmp/notes_bundle.js"
TARGETS = ["production", "preview", "development"]


def api(method: str, path: str, data=None):
    url = BASE + path
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    dc.add_surrogate_to_request(req, CREDENTIAL, allowed_hosts=ALLOWED)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = dc.read_response_body(resp).decode()
    except HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise SystemExit(f"{method} {path} -> HTTP {exc.code}: {detail[:300]}")
    return json.loads(raw) if raw else {}


def main() -> int:
    src = open(BUNDLE).read()

    def grab(prop: str) -> str:
        m = re.search(prop + r":Mt\(`([^`]*)`\)", src)
        return m.group(1) if m else ""

    values = {
        "VITE_FIREBASE_API_KEY": grab("apiKey"),
        "VITE_FIREBASE_AUTH_DOMAIN": grab("authDomain"),
        "VITE_FIREBASE_PROJECT_ID": grab("projectId"),
        "VITE_FIREBASE_STORAGE_BUCKET": grab("storageBucket"),
        "VITE_FIREBASE_MESSAGING_SENDER_ID": grab("messagingSenderId"),
        "VITE_FIREBASE_APP_ID": grab("appId"),
    }
    # PIN hash: the only 64-hex string, in the PIN submit handler context
    hashes = set(re.findall(r"[0-9a-f]{64}", src))
    assert len(hashes) == 1, f"expected 1 pin hash, found {len(hashes)}"
    values["VITE_ADMIN_PIN_HASH"] = next(iter(hashes))
    # databaseUrl is empty in the live build -> skip (RTDB unused)

    missing = [k for k, v in values.items() if not v]
    if missing:
        raise SystemExit(f"missing values for: {missing}")

    existing = api("GET", f"/v9/projects/{PROJECT_ID}/env").get("envs", [])
    for env in existing:
        api("DELETE", f"/v9/projects/{PROJECT_ID}/env/{env['id']}")
        print(f"deleted {env['key']} [{','.join(env.get('target', []))}]")

    for key in values:
        api(
            "POST",
            f"/v10/projects/{PROJECT_ID}/env",
            {"key": key, "value": values[key], "type": "encrypted", "target": TARGETS},
        )
        print(f"created {key} [{','.join(TARGETS)}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
