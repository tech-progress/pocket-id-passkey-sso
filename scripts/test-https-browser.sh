#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
python3 - <<'PY'
import socket
for port in (18427, 18428):
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(('127.0.0.1', port))
PY
project="pocket-id-browser-$(date +%s)-$$"
export LOCAL_IMAGE="pocket-id-passkey-sso-test:${project}"
export LOCAL_PORT=18427 APP_URL=https://localhost:18428 GATE_FORCE_LOCK=true
export ENCRYPTION_KEY="$(openssl rand -hex 32)" GATE_ADMIN_TOKEN="$(openssl rand -hex 32)"
mkdir -p evidence
work="$(mktemp -d "$root/evidence/browser.XXXXXXXX")"
export POCKET_BROWSER_WORK="$work" POCKET_BROWSER_PROJECT="$project"
compose=(docker compose -p "$project" -f "$root/compose.yaml")
restore_compose=(docker compose -p "$project-restore" -f "$root/compose.yaml")
cleanup() {
    status=$?
    trap - EXIT
    if (( status != 0 )); then
        for phase in build start; do
            if [[ -f "$work/$phase.log" ]]; then cp "$work/$phase.log" "$root/evidence/$project-$phase.log"; fi
        done
    fi
    timeout 90 "${compose[@]}" down --volumes --remove-orphans --timeout 15 >/dev/null 2>&1 || status=1
    timeout 90 "${restore_compose[@]}" down --volumes --remove-orphans --timeout 15 >/dev/null 2>&1 || status=1
    if docker image inspect "$LOCAL_IMAGE" >/dev/null 2>&1; then timeout 30 docker image rm "$LOCAL_IMAGE" >/dev/null 2>&1 || status=1; fi
    rm -rf "$work"
    if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$project")$(docker volume ls -q --filter "label=com.docker.compose.project=$project")$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ]]; then status=1; fi
    if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$project-restore")$(docker volume ls -q --filter "label=com.docker.compose.project=$project-restore")$(docker network ls -q --filter "label=com.docker.compose.project=$project-restore")" ]]; then status=1; fi
    echo "Owned browser project $project cleanup exit $status"
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$work/key.pem" -out "$work/cert.pem" -days 1 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost' >/dev/null 2>&1
timeout 600 "${compose[@]}" build > "$work/build.log" 2>&1
timeout 150 "${compose[@]}" up -d --wait --wait-timeout 120 > "$work/start.log" 2>&1
timeout 360 node scripts/test-https-browser.mjs
