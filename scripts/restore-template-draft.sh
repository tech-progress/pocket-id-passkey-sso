#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$root/scripts/template-draft.py" restore "${1:?Usage: restore-template-draft.sh EXPORTED_DRAFT_JSON NEW_OUTPUT_JSON}" "${2:?Output file required}"
