#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
required=(Dockerfile apk.lock gateway.py compose.yaml .dockerignore .gitignore .env.example .railway/railway.ts package.json bun.lock VERSION CHANGELOG.md README.md MARKETPLACE.md PUBLISHING.md SUPPORT.md UPGRADE.md LICENSE_REVIEW.md FINDINGS.md marketplace-metadata.json template-defaults.json template-descriptions.json template-networking.json template-volumes.json scripts/smoke.sh scripts/test-local.sh scripts/restore-template-draft.sh scripts/audit-template.sh scripts/audit-apk-lock.py)
for file in "${required[@]}"; do [[ -s "$file" ]] || { echo "Missing $file" >&2; exit 1; }; done
version="$(cat VERSION)"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
rg -q "^## ${version} —" CHANGELOG.md
for file in *.json; do jq empty "$file"; done
for file in scripts/*.sh; do bash -n "$file"; done
sh -n scripts/entrypoint.sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=. python3 -m unittest discover -s tests -v
jq -e '.description|length>=45 and length<=75' marketplace-metadata.json >/dev/null
jq -e 'has("id")|not' marketplace-metadata.json >/dev/null
jq -e 'has("code")|not' marketplace-metadata.json >/dev/null
for url in $(jq -r '.origins[].url' marketplace-metadata.json); do
  for file in README.md MARKETPLACE.md; do rg -Fq "$url" "$file"; done
done
[[ "$(jq -r '.devDependencies.railway' package.json)" == 3.6.0 ]]
[[ "$(wc -l < apk.lock)" == 17 ]]
rg -q '^python3=3\.14\.8-r0$' apk.lock
rg -q 'xargs apk add --no-cache < /opt/pocket-gate/apk.lock' Dockerfile
if rg -q 'ctx\.randomString|context\.randomString' .railway/railway.ts; then echo "Deterministic SDK secret helper forbidden" >&2; exit 1; fi
SOURCE_REPO=offline/render-fixture SOURCE_BRANCH=release-v1 SOURCE_ROOT_DIR=/pocket-id-passkey-sso node scripts/test-iac-secrets.mjs
pin=19f556d5852115c8ebbef271f6f7cf610d8803312a1fa63f29e1b342fe9d2939
rg -q "v2.17.0@sha256:${pin}" Dockerfile
compose="$(APP_URL=https://localhost:18400 ENCRYPTION_KEY=verify-encryption-key-not-a-deployment-secret GATE_ADMIN_TOKEN=verify-operator-token-not-a-deployment-secret docker compose config --format json)"
jq -e '.services["pocket-id"].ports|length==1 and .[0].host_ip=="127.0.0.1" and .[0].target==8080' <<<"$compose" >/dev/null
if env -u SOURCE_REPO node scripts/render.mjs >/dev/null 2>&1; then echo "Missing source repository did not fail" >&2; exit 1; fi
render="$(SOURCE_REPO=offline/render-fixture SOURCE_BRANCH=release-v1 SOURCE_ROOT_DIR=/pocket-id-passkey-sso node scripts/render.mjs)"
jq -e '.configuration.services["Pocket ID"].source == {repo:"offline/render-fixture",branch:"release-v1",rootDirectory:"/pocket-id-passkey-sso"} and .configuration.services["Pocket ID"].deploy.numReplicas==1 and .configuration.services["Pocket ID"].volumeMounts["Pocket ID Data"].mountPath=="/app/data" and ([.graph.resources[]|select(.type=="volume")|.config.sizeMB]==[1000])' <<<"$render" >/dev/null
jq -e '.configuration.services["Pocket ID"].variables.ENCRYPTION_KEY.preserveExisting==true and .configuration.services["Pocket ID"].variables.GATE_ADMIN_TOKEN.preserveExisting==true' <<<"$render" >/dev/null
[[ "$(jq -r '.services["pocket-id"].command|join(" ")' <<<"$compose")" == "$(jq -r '.configuration.services["Pocket ID"].deploy.startCommand' <<<"$render")" ]]
SOURCE_REPO=offline/render-fixture SOURCE_BRANCH=release-v1 SOURCE_ROOT_DIR=/ node scripts/render.mjs | jq -e '.configuration.services["Pocket ID"].source.rootDirectory=="/"' >/dev/null
if find . -path ./node_modules -prune -o -type f \( -name .env -o \( -name '.env.*' ! -name .env.example \) -o -name '*.local' -o -name '*.pem' -o -name '*.key' \) -print | rg -q .; then echo "Secret/local file found" >&2; exit 1; fi
echo "Structure, gate unit tests, digest, defaults, loopback networking and exact offline IaC source passed."
