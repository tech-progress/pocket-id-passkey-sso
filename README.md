# Pocket ID passkey SSO

Deploy [Pocket ID](https://pocket-id.org), an open-source passkey-only OpenID Connect identity provider. [Upstream source](https://github.com/pocket-id/pocket-id) is the product authority. This template wraps the actual Pocket ID binary, not a mock identity service.

**Status: unpublished; Railway qualification remains open.** Local tests include real browser WebAuthn registration/login, S256 authorization-code exchange and enrolled-state recovery behind an isolated HTTPS proxy. They use virtual authenticators and a locally trusted test certificate, not physical-custodian or publicly trusted Railway TLS evidence. No template ID, deployment code, or deploy button is claimed.

## Deployment contract

Template `1.0.0` pins Pocket ID `2.17.0`, released October 1, 2026. The official multi-platform image is:

```text
ghcr.io/pocket-id/pocket-id:v2.17.0@sha256:19f556d5852115c8ebbef271f6f7cf610d8803312a1fa63f29e1b342fe9d2939
```

One Dockerfile-built service contains the app and a small standard-library Python operator gateway. The gateway listens on `0.0.0.0:8080`; Pocket ID binds only `127.0.0.1:1411`, and its embedded actor listener is restricted to `127.0.0.1:1414`. Only the gateway receives a Railway HTTPS domain. The app has no public domain, exposed TCP proxy, separate shared disk, or Docker socket. Gateway and app run as UID/GID `1000`; the upstream entrypoint briefly starts as root to repair volume ownership, then drops privileges.

Mount one dedicated 1 GB Railway volume at `/app/data`. It holds SQLite, its WAL/SHM sidecars while running, uploads and upstream key/state material, plus the signed gateway activation marker. Keep one replica. This is a small-team single-node baseline, **not HA**, and Railway volume ownership/backup/availability remain operator responsibilities.

The wrapper enforces actual upstream settings: `HOST=127.0.0.1`, backend `PORT=1411`, `TRUST_PROXY=127.0.0.1/32`, SQLite at `/app/data/pocket-id.db`, filesystem uploads, embedded actors, `UI_CONFIG_DISABLED=true`, secure callback URLs, rate limiting, no downgrade, and disabled analytics/version polling. It discards external TLS/socket/trusted-platform overrides. `GATE_*` variables belong only to this wrapper; they are not invented Pocket ID authentication settings. `STATIC_API_KEY` and `STATIC_API_KEY_FILE` cause startup rejection.

## Required variables

| Variable | Required / default | Purpose |
| --- | --- | --- |
| `APP_URL` | Required; IaC uses `https://${{Pocket ID.RAILWAY_PUBLIC_DOMAIN}}` | Exact final lowercase HTTPS issuer/passkey origin. No trailing slash, path, query or credentials. Set the final custom domain before enrollment if desired. |
| `ENCRYPTION_KEY` | Required, separate 64-character generated secret | Stable Pocket ID encryption key, at least 32 bytes. Back up separately. Never regenerate during restart, redeploy or restore. |
| `GATE_ADMIN_TOKEN` | Required, independent 64-character generated secret | Wrapper operator credential, at least 32 bytes; must differ from the encryption key. It is not a Pocket ID API key. |
| `GATE_FORCE_LOCK` | `true` | Global operator-only gate. `false` permits public routes only with valid signed activation and an enabled owner with at least two stored credentials. Missing/corrupt state, missing DB, changed key/origin, or removed credentials still locks. |
| `PORT` | `8080` | Gateway listener; Railway domain targets this port. Backend port is fixed internally, not public. |
| `LOCAL_PORT` | Compose only: `18400` | Loopback host port. Automated tests choose only a free port in `18400`–`18404`. |
| `LOCAL_IMAGE` | Compose only: `pocket-id-passkey-sso:local` | Local build tag. Tests use a unique owned tag and remove it only when unused. |
| `SOURCE_REPO` | IaC required; **no default** | Existing authorized `owner/repository` containing this template. An absent/invalid repository fails rendering. |
| `SOURCE_BRANCH` | IaC: `release-v1` | Accessible slash-free release channel. A local render does not prove that the branch exists remotely. |
| `SOURCE_ROOT_DIR` | IaC: `/pocket-id-passkey-sso` | Exact source root for this monorepo; use `/` only for a real sanitized standalone distribution repository. |

No SMTP or remote database is required by this baseline. SMTP, optional upstream integrations, HA, and arbitrary upstream config overrides are outside this template's tested contract. Do not enable mail recovery or public registration without reviewing Pocket ID's actual policy and threat model.

`apk.lock` pins all 17 newly installed Python/runtime APK packages, including transitive libraries, not just `python3`. Docker consumes that lock and checks the actual installed-package delta against it, refusing unlocked additions or base-package removals. The base image digest and Bun dependency lock are independent pins. APK repository metadata is still downloaded from upstream Alpine repositories; package availability can change, but the resolver cannot silently float a runtime dependency. The lock records exact versions, not a vendored offline APK artifact store.

Direct IaC uses independent `node:crypto.randomBytes(32)` values encoded as 64 hex characters, with native `{value, preserveExisting:true}` variables. SDK 3.6.0's `ctx.randomString` is a deterministic hash of public context/label and is **not suitable for secrets**; it is not used here. Repeated local evaluations verify distinct random values and raw preservation flags survive compilation, without printing secrets. Marketplace defaults separately retain the Railway native `secret(64, ...)` generator expressions. **Live `preserveExisting` behavior has not been tested:** before any real source apply/reapply, verify that an existing encryption key and operator token remain unchanged. Stop if the plan would rotate either key; preserving compiled metadata is not proof of platform preservation.

## Secure first-owner setup on Railway

1. Supply a real accessible source repository, authorize the Railway GitHub App, choose its existing release branch, and render the IaC locally. Applying or publishing requires a separate authorized operator action; this implementation does not do either.
2. Build with `Dockerfile`, start with `sh /opt/pocket-gate/entrypoint.sh python3 /opt/pocket-gate/gateway.py`, attach `/app/data`, and expose only port `8080` using the networking file. Keep `GATE_FORCE_LOCK=true`.
3. Choose the **final HTTPS origin**, set `APP_URL` to it, and verify that TLS is valid with no browser warnings. The gateway relies on Railway's HTTPS edge for TLS; do not expose its raw HTTP socket to the public internet. Health at `/healthz` only proves the processes respond and does not unlock anything.
4. From a trusted browser with a real passkey-capable authenticator, visit `https://YOUR_FINAL_ORIGIN/_operator`. Retrieve `GATE_ADMIN_TOKEN` privately from Railway variables, enter it into the form, and do not put it into URLs, app logs, support tickets, or an OIDC client secret field. No shared/test credential is checked in.
5. The wrapper issues a 15-minute `__Host-pocket-gate` cookie, scoped to `/`, `Secure`, `HttpOnly`, `SameSite=Strict` and bound to the canonical origin. The backend never receives this cookie or the gate token. The form redirects to the real upstream `/signup/setup` route. Until explicit activation, **every** application/UI/OIDC route is operator-only, not just a guessed setup URL.
6. Complete upstream first-user setup and enroll the owner passkey using HTTPS. Register a second independent authenticator and verify both. Upstream's real `POST /api/signup/setup` creates the initial admin and temporary app session; a static API key does not protect that unauthenticated endpoint.
7. Return to `/_operator`, authenticate again if needed, and press Activate. The wrapper reads SQLite in read-only mode and requires an enabled, non-synthetic administrator with at least two stored credentials before writing a mode-0600 origin/owner/key-bound signed marker. Credential counts are not a substitute for proving both physical authenticators work. Activation is still operator-only while `GATE_FORCE_LOCK=true`.
8. Run the real HTTPS gates in `PUBLISHING.md`, then set `GATE_FORCE_LOCK=false` and redeploy. Setup UI/API remains permanently denied after activation, including normalized encoded/trailing-slash variants. Public OIDC and user login routes then pass through; Pocket ID's own authentication and administrator checks still apply.

The gateway token controls the deployment perimeter, not Pocket ID user privileges. A valid operator session with no Pocket ID login must still receive `401`/`403` from `/api/users`. Prove a real non-admin account cannot create/administer users, clients, configuration or recovery tokens before production use. Lock promptly if bootstrap is interrupted. To re-lock, set `GATE_FORCE_LOCK=true` and restart, or use the origin-checked operator Lock form to remove the signed marker.

No supported upstream setup-token environment variable or first-administrator creation CLI was found in the pinned implementation. Do not invent one. This template deliberately does not create a user, bypass WebAuthn, or write enrollment/owner secrets into application variables, service logs or volume files. WebAuthn private keys stay with authenticators; the app necessarily stores credential public material and its own encrypted/signing state.

## Local verification without owner claim

Requirements: Docker Engine/Compose, Bash, Python 3, OpenSSL, Node and Bun; tests need internet only to fetch upstream images/packages. From this directory:

```bash
bun install --frozen-lockfile
./scripts/verify.sh
./scripts/test-local.sh
```

The local harness generates disposable secrets, builds the real image, starts an isolated uniquely named Compose project on a loopback port in `18400`–`18404`, exercises outsider denial and operator **read-only** access, performs a real restart, cold-copies the complete volume, restores it into a fresh volume, and removes only its own containers/network/volumes. It never creates an owner or enrollment token. HTTP requests with an explicitly supplied test cookie only test proxy plumbing; they do not qualify browser Secure cookies or passkey enrollment. Private keys, application/session responses and gate tokens are not printed.

Build/start/run/restart/stop/copy/smoke operations have explicit timeouts, and readiness uses a finite retry budget. Tests use a unique owned image tag and remove it only if unused; cleanup checks only their project-label resources and never prunes global Docker state.

For manual loopback checks, privately populate `.env` from `.env.example`, use a `pocket-id-` prefixed project and `docker compose -p YOUR_PROJECT up --build -d`. Do not confuse the `https://localhost:18400` test issuer string with a real TLS endpoint: Compose exposes plain HTTP and is **not** an owner-enrollment recipe. Do not disable Secure cookies or use `ALLOW_INSECURE_CALLBACK_URLS` to force enrollment.

### Disposable HTTPS browser gate

Install Playwright and its Chromium privately outside the distribution tree, then run:

```bash
POCKET_PLAYWRIGHT_MODULE=/absolute/private/tooling/node_modules/playwright/index.mjs \
POCKET_CHROMIUM=/absolute/private/chromium \
bash scripts/test-https-browser.sh
```

The harness owns loopback ports 18427 and 18428, creates a fresh localhost certificate and uses an isolated browser context. It enrolls a disposable owner through upstream setup using native `navigator.credentials.create`, creates a second CTAP2 virtual authenticator, disables the first, and proves native login. It checks Secure/HttpOnly/SameSite operator cookies, signed ID-token issuer/audience/nonce/state, wrong PKCE verifier, callback rejection, code replay denial, and complete enrolled-volume restore followed by login and a new signed grant. Private keys and test secrets are not printed. Cleanup removes only the harness's uniquely named resources.

This is genuine upstream protocol/browser exercise, but not hardware custody, non-admin invitation qualification, an external security audit, or a real Railway deployment. Those gates remain mandatory before publication. The browser operator form requires same-origin referrer handling so Chrome sends a non-null Origin; cross-origin management requests remain denied.

## Offline IaC and draft tooling

```bash
SOURCE_REPO=YOUR_OWNER/YOUR_EXISTING_REPO \
SOURCE_BRANCH=release-v1 SOURCE_ROOT_DIR=/pocket-id-passkey-sso \
node scripts/render.mjs > /tmp/pocket-id-render.json
```

Rendering performs no cloud calls and substitutes secret-generation expressions into its output instead of logging generated secret values. The typed source preserves `rootDirectory` through SDK `3.6.0`; the renderer asserts the exact value. Read `PUBLISHING.md` for offline exported-draft repair/audit. There is no fabricated standalone source or claimed marketplace code.

The renderer's output is a secret-redacted offline review projection, **not an apply payload**. Native IaC evaluation generates fresh random candidates and requests preservation of existing secrets; only a separately authorized real platform test can prove that preservation behavior.

## Backups and limits

See `UPGRADE.md` for cold backups, restore, key handling and rollback. Keep database, uploads, gateway state, upstream signing/encryption state and the original encryption key together logically, with the key separately protected. Never copy a live SQLite database alone or share one volume across replicas. Keep the issuer stable: changing a passkey relying-party domain is not a supported transparent migration.

The gateway bounds requests/responses at 16 MiB, operator payloads at 8 KiB, active connections at 64, and socket/upstream timeouts; it buffers responses and does not implement WebSocket/streaming proxying. It replaces client-supplied forwarding headers and trusts no edge IP hints, so backend IP-based limits may group clients by the Railway edge address. This narrow custom security boundary needs operator security review before publication; it is not advertised as a general-purpose production reverse proxy.

### Upstream references

- [Pocket ID product](https://pocket-id.org)
- [Pocket ID source](https://github.com/pocket-id/pocket-id)
- [Environment variables](https://pocket-id.org/docs/configuration/environment-variables)
- [Pinned release](https://github.com/pocket-id/pocket-id/releases/tag/v2.17.0)
- [BSD-2-Clause license](https://github.com/pocket-id/pocket-id/blob/v2.17.0/LICENSE)
