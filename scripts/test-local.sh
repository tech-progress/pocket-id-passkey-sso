#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
export ENCRYPTION_KEY="$(openssl rand -hex 32)" GATE_ADMIN_TOKEN="$(openssl rand -hex 32)" GATE_FORCE_LOCK=true
export LOCAL_PORT="$(python3 - <<'PY'
import socket
for port in range(18400, 18405):
    with socket.socket() as listener:
        try:
            listener.bind(('127.0.0.1', port))
        except OSError:
            continue
        print(port)
        break
else:
    raise SystemExit('No free approved loopback port 18400–18404')
PY
)"
export APP_URL="https://localhost:${LOCAL_PORT}"
project="pocket-id-test-$(date +%s)-$$"
export LOCAL_IMAGE="pocket-id-passkey-sso-test:${project}"
scratch="$(mktemp -d)"
compose=(docker compose -p "$project" -f "$root/compose.yaml")
cleanup() {
  timeout 90 "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || echo "WARNING: project cleanup timed out: $project" >&2
  containers="$(docker ps -aq --filter "label=pocket-id-test=$project")"
  if [[ -n "$containers" ]]; then timeout 30 docker rm -f $containers >/dev/null; fi
  if [[ -z "$(docker ps -aq --filter "ancestor=$LOCAL_IMAGE")" ]]; then
    timeout 30 docker image rm "$LOCAL_IMAGE" >/dev/null 2>&1 || echo "WARNING: own test tag cleanup failed: $LOCAL_IMAGE" >&2
  fi
  rm -rf "$scratch"
  if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$project")$(docker volume ls -q --filter "label=com.docker.compose.project=$project")$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ]]; then
    echo "ERROR: own Compose resources remain: $project" >&2
    return 1
  fi
}
trap cleanup EXIT
echo "Isolated local target: 127.0.0.1:${LOCAL_PORT}; project $project; unique own test image $LOCAL_IMAGE"
wait_ready() {
  for attempt in $(seq 1 90); do
    if curl -fsS --max-time 2 "http://127.0.0.1:${LOCAL_PORT}/healthz" >/dev/null 2>&1; then return; fi
    sleep 2
  done
  echo "Readiness timeout; inspect only this project's service" >&2
  "${compose[@]}" ps >&2
  return 1
}
timeout 600 "${compose[@]}" build
timeout 60 docker run --rm --label "pocket-id-test=$project" --entrypoint sh "$LOCAL_IMAGE" -ec 'cd /opt/pocket-gate; PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=. python3 -m unittest discover -s tests -v'
for mode in missing-key missing-token insecure-origin static-admin; do
  case "$mode" in
    missing-key) rejected=(-e ENCRYPTION_KEY=);;
    missing-token) rejected=(-e GATE_ADMIN_TOKEN=);;
    insecure-origin) rejected=(-e APP_URL=http://localhost);;
    static-admin) rejected=(-e STATIC_API_KEY=forbidden);;
  esac
  if timeout 12 docker run --rm --label "pocket-id-test=$project" -e APP_URL -e ENCRYPTION_KEY -e GATE_ADMIN_TOKEN "${rejected[@]}" "$LOCAL_IMAGE" >"$scratch/startup.log" 2>&1; then
    echo "Unsafe startup accepted: $mode" >&2; exit 1
  fi
  rg -q 'Startup refused' "$scratch/startup.log"
done
timeout 120 "${compose[@]}" up -d
wait_ready
container="$("${compose[@]}" ps -q pocket-id)"
docker inspect "$container" | jq -e '.[0].HostConfig.PortBindings["8080/tcp"]|length==1 and .[0].HostIp=="127.0.0.1"' >/dev/null
"${compose[@]}" exec -T --user 1000 pocket-id python3 -c 'import os,socket,pathlib; assert os.getuid()==1000; status=pathlib.Path("/proc/1/status").read_text(); assert "Uid:\t1000\t1000\t1000\t1000" in status; socket.socket().connect(("127.0.0.1",1411)); address=socket.gethostbyname(socket.gethostname()); probe=socket.socket(); probe.settimeout(2); assert probe.connect_ex((address,1411)) != 0'
timeout 90 ./scripts/smoke.sh "http://127.0.0.1:${LOCAL_PORT}"
snapshot='import json,sqlite3,hashlib,pathlib; root=pathlib.Path("/app/data"); db=sqlite3.connect("file:/app/data/pocket-id.db?mode=ro",uri=True); assert db.execute("PRAGMA quick_check").fetchone()[0]=="ok"; assert db.execute("SELECT count(*) FROM users WHERE id != ?",("00000000-0000-0000-0000-000000000000",)).fetchone()[0]==0; rows=db.execute("SELECT * FROM kv ORDER BY key").fetchall(); print(json.dumps({"kv_sha256":hashlib.sha256(repr(rows).encode()).hexdigest(),"files":{str(path.relative_to(root)):hashlib.sha256(path.read_bytes()).hexdigest() for path in root.rglob("*") if path.is_file() and path.suffix not in {".db",".db-wal",".db-shm"} and not path.name.startswith("pocket-id.db")}},sort_keys=True))'
"${compose[@]}" exec -T pocket-id python3 -c "$snapshot" >"$scratch/before.json"
before="$(docker inspect "$container" --format '{{.State.StartedAt}}')"
timeout 90 "${compose[@]}" restart
wait_ready
after="$(docker inspect "$container" --format '{{.State.StartedAt}}')"
[[ "$before" != "$after" ]]
"${compose[@]}" exec -T pocket-id python3 -c "$snapshot" >"$scratch/after.json"
cmp "$scratch/before.json" "$scratch/after.json"
timeout 90 ./scripts/smoke.sh "http://127.0.0.1:${LOCAL_PORT}"
echo "PASS: real restart, empty-user SQLite/kv/key persistence; no first-owner mutation"
timeout 90 "${compose[@]}" stop
timeout 60 docker cp "$container:/app/data/." "$scratch/backup"
python3 - "$scratch/backup" <<'PY'
import pathlib,sqlite3,sys
backup=pathlib.Path(sys.argv[1])
with sqlite3.connect(f'file:{backup}/pocket-id.db?mode=ro',uri=True) as database:
    assert database.execute('PRAGMA quick_check').fetchone()[0]=='ok'
PY
timeout 90 "${compose[@]}" down --volumes
timeout 120 "${compose[@]}" create
container="$("${compose[@]}" ps -aq pocket-id)"
timeout 60 docker cp "$scratch/backup/." "$container:/app/data"
timeout 90 "${compose[@]}" start
wait_ready
"${compose[@]}" exec -T pocket-id python3 -c "$snapshot" >"$scratch/restored.json"
cmp "$scratch/before.json" "$scratch/restored.json"
timeout 90 ./scripts/smoke.sh "http://127.0.0.1:${LOCAL_PORT}"
echo "PASS: cold backup restored to new volume, same issuer/encryption key, real upstream state unchanged"
timeout 20 docker stats --no-stream --format 'Local resource snapshot: {{.MemUsage}} memory; {{.CPUPerc}} CPU' "$container"
"${compose[@]}" exec -T pocket-id python3 --version
"${compose[@]}" exec -T pocket-id /app/pocket-id version
echo "Local evidence complete; cleanup removes only $project containers/network/volume and unused own test image tag."
