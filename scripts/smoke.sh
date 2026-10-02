#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$root/scripts/smoke.py" "${1:?Usage: ./scripts/smoke.sh BASE_URL (locked instance only)}"
