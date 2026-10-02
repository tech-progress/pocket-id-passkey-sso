#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="${1:?Usage: backup-local.sh OWN_COMPOSE_PROJECT NEW_BACKUP_DIRECTORY --confirm-stop}"
destination="${2:?New backup directory required}"
[[ "${3:-}" == --confirm-stop ]] || { echo "Cold backup stops this explicitly named stack; --confirm-stop required" >&2; exit 1; }
[[ "$project" =~ ^pocket-id-[a-z0-9-]+$ ]] || { echo "Expected a pocket-id- prefixed operator-owned Compose project" >&2; exit 1; }
[[ ! -e "$destination" ]] || { echo "Destination already exists; refuse overwrite" >&2; exit 1; }
umask 077
compose=(docker compose -p "$project" -f "$root/compose.yaml")
container="$("${compose[@]}" ps -q pocket-id)"
[[ -n "$container" ]]
[[ "$(docker inspect "$container" --format '{{index .Config.Labels "com.docker.compose.project"}}')" == "$project" ]]
timeout 90 "${compose[@]}" stop pocket-id
trap 'timeout 90 "${compose[@]}" start pocket-id >/dev/null' EXIT
mkdir "$destination"
timeout 120 docker cp "$container:/app/data/." "$destination/data"
python3 "$root/scripts/audit-backup.py" "$destination/data" >"$destination/manifest.json"
echo "Cold backup created. Encrypt and move off-host; original key and gate token must be saved separately in a secret manager."
