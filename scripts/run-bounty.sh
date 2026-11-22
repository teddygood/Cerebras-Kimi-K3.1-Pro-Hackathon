#!/usr/bin/env bash
set -euo pipefail

# Single-command runner for Santa's Speedy Shopper on official patched OpenClaw.
# Usage:
#   OPENCLAW_BIN=./oc ./scripts/run-bounty.sh prompts/dream5-terse.prompt [session-label]

PROMPT_FILE="${1:-prompts/dream5-terse.prompt}"
LABEL="${2:-speed-bounty-$(date +%Y%m%d-%H%M%S)}"
OPENCLAW_BIN="${OPENCLAW_BIN:-openclaw}"
OUT_DIR="${OUT_DIR:-./run-output}"

mkdir -p "$OUT_DIR"

echo "Running session agent:main:${LABEL} with ${PROMPT_FILE}..."
"$OPENCLAW_BIN" agent \
  --session-key "agent:main:${LABEL}" \
  --message "$(cat "$PROMPT_FILE")" \
  --thinking low \
  --timeout 300 \
  --json > "${OUT_DIR}/${LABEL}.json"

echo "Extracting answer and verifying all 5 live product URLs..."
python3 - "${OUT_DIR}/${LABEL}.json" <<'PY' | python3 scripts/verify-products.py | tee "${OUT_DIR}/${LABEL}.verified.json"
import json, sys
data = json.load(open(sys.argv[1]))
for payload in data.get("result", {}).get("payloads", []):
    if payload.get("text"):
        print(payload["text"])
PY

echo "Done. Open the patched OpenClaw Web UI to inspect the official speed readout for session agent:main:${LABEL}."
