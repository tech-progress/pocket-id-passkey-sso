#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$root/scripts/template-draft.py" audit "${1:?Usage: audit-template.sh EXPORTED_DRAFT_JSON}"
