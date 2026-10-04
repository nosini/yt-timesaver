#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="$SCRIPT_DIR/yt-timesaver.pem"
CRX_OUT="$SCRIPT_DIR/../yt-timesaver.crx"

# ── Find Brave binary ─────────────────────────────────────────────────────────
BRAVE=""
for candidate in brave brave-browser /usr/bin/brave /usr/bin/brave-browser; do
  if command -v "$candidate" &>/dev/null; then
    BRAVE="$candidate"
    break
  fi
done

if [[ -z "$BRAVE" ]]; then
  echo "Error: Could not find Brave. Is it installed?"
  exit 1
fi

# ── Generate key if needed ────────────────────────────────────────────────────
if [[ ! -f "$KEY_FILE" ]]; then
  echo "==> Generating signing key: $KEY_FILE"
  openssl genrsa -out "$KEY_FILE" 2048 2>/dev/null
  echo "    Keep this file — it determines the extension ID."
fi

# ── Pack ──────────────────────────────────────────────────────────────────────
echo "==> Packing extension..."

"$BRAVE" \
  --pack-extension="$SCRIPT_DIR" \
  --pack-extension-key="$KEY_FILE" \
  --no-message-box 2>/dev/null || true

BRAVE_CRX="$(dirname "$SCRIPT_DIR")/$(basename "$SCRIPT_DIR").crx"

if [[ -f "$BRAVE_CRX" ]]; then
  mv "$BRAVE_CRX" "$CRX_OUT"
  echo "==> Done: $CRX_OUT"
else
  echo "Error: Expected $BRAVE_CRX was not created."
  exit 1
fi

echo ""
echo "To install:"
echo "  1. Go to brave://extensions"
echo "  2. Enable Developer mode"
echo "  3. Drag and drop $(basename "$CRX_OUT") onto the page"
