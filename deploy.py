#!/usr/bin/env python3
"""Deploy diginotes to Vercel using the stored connector token (surrogate)."""
import os
import subprocess
import sys

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
import dynamic_credentials as dc

entry = dc.dynamic_credential_entry("custom.vercel")
surrogate = str(entry["surrogate"]).strip()

env = dict(os.environ)
env["VERCEL_TELEMETRY_DISABLED"] = "1"

cmd = ["vercel", "deploy", "--prod", "--token", surrogate, "--yes"]
print("running:", " ".join(c if not c.startswith("hsurr:") else "<surrogate>" for c in cmd), flush=True)
proc = subprocess.run(cmd, cwd=os.path.dirname(os.path.abspath(__file__)), env=env)
sys.exit(proc.returncode)
