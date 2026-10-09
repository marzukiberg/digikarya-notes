#!/usr/bin/env python3
"""Deploy diginotes source to Vercel via the REST API (no CLI needed).

Two-step flow (docs: /docs/rest-api/deployments/upload-deployment-files):
  1. POST /v2/files per file (raw bytes, x-vercel-digest: sha1) -> 200 empty.
  2. POST /v13/deployments with files:[{file, sha, size}] -> build on Vercel.
Then poll until READY/ERROR.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import urllib.request
from urllib.error import HTTPError

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
import dynamic_credentials as dc

CREDENTIAL = "custom.vercel"
ALLOWED = ["api.vercel.com"]
BASE = "https://api.vercel.com"
PROJECT_ID = "prj_wMBcQKHXTUU4a60pOXYJJbjffkAA"
SRC = os.path.dirname(os.path.abspath(__file__))

EXCLUDE_DIRS = {"node_modules", "dist", ".git", ".vercel", ".firebase"}
EXCLUDE_FILES = {
    "sync_env.py",
    "deploy.py",
    "deploy_api.py",
    "firebase.json",
    ".firebaserc",
    "firestore.rules",
    "database.rules.json",
}


def api(method: str, path: str, data=None, params: str = "", headers: dict | None = None):
    url = BASE + path + params
    if isinstance(data, (bytes, bytearray)):
        body = bytes(data)
        is_json = False
    else:
        body = json.dumps(data).encode() if data is not None else None
        is_json = True
    req = urllib.request.Request(url, data=body, method=method)
    dc.add_surrogate_to_request(req, CREDENTIAL, allowed_hosts=ALLOWED)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json" if is_json else "application/octet-stream")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = dc.read_response_body(resp).decode()
    except HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise SystemExit(f"{method} {path} -> HTTP {exc.code}: {detail[:300]}")
    return json.loads(raw) if raw else {}


def collect():
    items = []
    for root, dirs, names in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for name in sorted(names):
            if name in EXCLUDE_FILES or name.startswith(".env"):
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, SRC).replace(os.sep, "/")
            with open(full, "rb") as fh:
                content = fh.read()
            items.append((rel, content))
    return items


def upload_file(content: bytes) -> str:
    sha = hashlib.sha1(content).hexdigest()
    for attempt in range(3):
        try:
            api(
                "POST",
                "/v2/files",
                content,
                headers={"x-vercel-digest": sha, "x-now-size": str(len(content))},
            )
            return sha
        except SystemExit as e:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


def main() -> int:
    items = collect()
    total = sum(len(c) for _, c in items)
    print(f"uploading {len(items)} files ({total / 1024:.0f} KB)", flush=True)

    files = []
    for i, (rel, content) in enumerate(items, 1):
        sha = upload_file(content)
        files.append({"file": rel, "sha": sha, "size": len(content)})
        if i % 10 == 0 or i == len(items):
            print(f"  {i}/{len(items)} uploaded", flush=True)

    dep = api(
        "POST",
        "/v13/deployments",
        {
            "name": "digikarya-notes",
            "project": PROJECT_ID,
            "target": "production",
            "files": files,
            "projectSettings": {
                "framework": "vite",
                "buildCommand": "npm run build",
                "outputDirectory": "dist",
            },
        },
        params="?skipAutoDetectionConfirmation=1",
    )
    dep_id = dep["id"]
    url = dep.get("url")
    print(f"deployment {dep_id}, url: {url}", flush=True)

    for _ in range(60):
        time.sleep(10)
        state = api("GET", f"/v13/deployments/{dep_id}")
        rs = state.get("readyState")
        print(f"... {rs}", flush=True)
        if rs == "READY":
            print(f"READY: https://{url}")
            return 0
        if rs in ("ERROR", "CANCELED"):
            print(f"FAILED ({rs}): {state.get('errorMessage')}")
            return 1
    print("timed out waiting for build")
    return 1


if __name__ == "__main__":
    sys.exit(main())
