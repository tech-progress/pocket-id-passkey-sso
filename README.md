# Pocket ID passkey SSO

Deploy [Pocket ID](https://pocket-id.org), an open-source passkey-only OpenID Connect identity provider. [Upstream source](https://github.com/pocket-id/pocket-id) is the product authority. This template wraps the actual Pocket ID binary, not a mock identity service.

**Recipe `1.0.1` is staged; final qualification and new release publication are PENDING.** Sequential qualification/publication is authorized. The authorized public standalone [recipe source](https://github.com/tech-progress/pocket-id-passkey-sso) already exists: historical annotated tag `v1.0.0` points to source commit `25c83b6205babb3dc60fc4184751f9b7acaa36db`. That historical release is not the final newly qualified 1.0.1 release. Future 1.0.1 source, exact queried Deploy V2, live secret preservation and publicly trusted Railway HTTPS owner/non-admin/OIDC/recovery/soak checks remain PENDING. Recorded localhost qualification and accepted finite source-only review are described below. No marketplace ID, deployment code or deploy button is claimed here.

Distribution is source-only recipe/instructions, not a published OCI image. The October 6 finite review recorded in `ARTIFACT_REVIEW.md` and `SECURITY_REVIEW.md` found no concrete missing grant or required notice for this authored recipe and its external references, and no demonstrated default request-reachable unpatched advisory requiring a source-only publication hold in the reviewed evidence. It is accepted within that scope. Required upstream grants/notices still apply; this is not complete assembled-image, SBOM, transitive-security or legal clearance. Future binary/image distribution requires its own exact component/obligation review, including supporting GPL components. Virtual authenticators exercise protocols, not physical hardware custody. Optional SMTP, hardware custody, universal security assurances and legal certification are outside this qualification scope.

## Deployment contract

Recipe `1.0.1` pins Pocket ID `2.17.0`, released October 1, 2026. It is deliberately selected, not the latest release: upstream `2.18.0` was released October 4. The official multi-platform image is:

```text
ghcr.io/pocket-id/pocket-id:v2.17.0@sha256:19f556d5852115c8ebbef271f6f7cf610d8803312a1fa63f29e1b342fe9d2939
```

One Dockerfile-built service contains the app and a small standard-library Python operator gateway. The gateway listens on `0.0.0.0:8080`; Pocket ID binds only `127.0.0.1:1411`, and its embedded actor listener is restricted to `127.0.0.1:1414`. Only the gateway receives a Railway HTTPS domain. The app has no public domain, exposed TCP proxy, separate shared disk, or Docker socket. Gateway and app run as UID/GID `1000`; the upstream entrypoint briefly starts as root to repair volume ownership, then drops privileges.

Mount one dedicated 1000 MB Railway volume at `/app/data`. It holds SQLite, its WAL/SHM sidecars while running, uploads and upstream key/state material, plus the signed gateway activation marker. Keep one replica in one service. This is a small-team single-node baseline, **not HA**, and Railway volume ownership/backup/availability remain operator responsibilities.

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

No SMTP or remote database is required by this baseline. SMTP, optional upstream integrations, HA, and arbitrary upstream config overrides are outside this template's supported contract. Do not enable mail recovery or public registration without reviewing Pocket ID's actual policy and threat model.

`apk.lock` pins all 17 newly installed Python/runtime APK packages, including transitive libraries, not just `python3`. Docker consumes that lock and checks the actual installed-package delta against it, refusing unlocked additions or base-package removals. The base image digest and Bun dependency lock are independent pins. APK repository metadata is still downloaded from upstream Alpine repositories; package availability can change, but the resolver cannot silently float a runtime dependency. The lock records exact versions, not a vendored offline APK artifact store.

Direct IaC uses independent `node:crypto.randomBytes(32)` values encoded as 64 hex characters, with native `{value, preserveExisting:true}` variables. SDK 3.6.0's `ctx.randomString` is a deterministic hash of public context/label and is **not suitable for secrets**; it is not used here. The local IaC test checks distinct random values and preservation flags through repeated compilation, without printing secrets. Marketplace defaults separately retain the Railway native `secret(64, ...)` generator expressions. **Live `preserveExisting` qualification is PENDING:** before any real source apply/reapply, verify that an existing encryption key and operator token remain unchanged. Stop if the plan would rotate either key; preserving compiled metadata is not proof of platform preservation.

## Secure first-owner setup on Railway

1. Select the authorized source repository and verify the Railway GitHub App grant, exact release branch/commit and root directory. Historical `v1.0.0` source exists; do not substitute it for the pending 1.0.1 source. Render IaC locally for review before the authorized sequential qualification/publication workflow in `PUBLISHING.md`.
2. Build with `Dockerfile`, start with `sh /opt/pocket-gate/entrypoint.sh python3 /opt/pocket-gate/gateway.py`, attach `/app/data`, and expose only port `8080` using the networking file. Keep `GATE_FORCE_LOCK=true`.
3. Choose the **final HTTPS origin**, set `APP_URL` to it, and verify that TLS is valid with no browser warnings. The gateway relies on Railway's HTTPS edge for TLS; do not expose its raw HTTP socket to the public internet. Health at `/healthz` only proves the processes respond and does not unlock anything.
4. From a trusted browser with a passkey-capable authenticator, open `/_operator` at the final verified HTTPS origin. Retrieve `GATE_ADMIN_TOKEN` privately from Railway variables, enter it into the form, and do not put it into URLs, app logs, support tickets, or an OIDC client secret field. No shared/test credential is checked in.
5. The wrapper issues a 15-minute `__Host-pocket-gate` cookie, scoped to `/`, `Secure`, `HttpOnly`, `SameSite=Strict` and bound to the canonical origin. The backend never receives this cookie or the gate token. The form redirects to the real upstream `/signup/setup` route. Until explicit activation, **every** application/UI/OIDC route is operator-only, not just a guessed setup URL.
6. Complete upstream first-user setup and enroll the owner passkey using HTTPS. Register a second independent authenticator and verify both. Live qualification uses two distinct virtual authenticators and does not certify physical custody; production operators manage their own authenticators. Upstream's real `POST /api/signup/setup` creates the initial admin and temporary app session; a static API key does not protect that unauthenticated endpoint.
7. Return to `/_operator`, authenticate again if needed, and press Activate. The wrapper reads SQLite in read-only mode and requires an enabled, non-synthetic administrator with at least two stored credentials before writing a mode-0600 origin/owner/key-bound signed marker. Credential counts are not a substitute for verifying each authenticator works independently. Activation is still operator-only while `GATE_FORCE_LOCK=true`.
8. Follow the staged HTTPS gates in `PUBLISHING.md`. After proving locked setup and activation, set `GATE_FORCE_LOCK=false` and redeploy for the public-route/non-admin/OIDC tests. This exposes login, discovery and allowed app routes to the internet; the operator perimeter no longer shields them. Setup UI/API remains permanently denied after activation, including normalized encoded/trailing-slash variants. Pocket ID's own authentication and administrator checks still apply. Re-lock if any gate fails.

The gateway token controls the deployment perimeter, not Pocket ID user privileges. A valid operator session with no Pocket ID login must still receive `401`/`403` from `/api/users`. Prove a real non-admin account cannot create/administer users, clients, configuration or recovery tokens before production use. Lock promptly if bootstrap is interrupted. To re-lock, set `GATE_FORCE_LOCK=true` and restart, or use the origin-checked operator Lock form to remove the signed marker.

No supported upstream setup-token environment variable or first-administrator creation CLI was found in the pinned implementation. The actual upstream `one-time-access-token` CLI recovers an **existing** user; it does not create the first owner. See `UPGRADE.md` for operator-locked recovery. This template deliberately does not create a user, bypass WebAuthn, or write enrollment/owner secrets into application variables or service logs. Recovery tokens and application identity state are necessarily persisted by upstream; protect the volume and any one-time link. WebAuthn private keys stay with authenticators.

## Local verification

Requirements: Docker Engine/Compose, Bash, Python 3, OpenSSL, Node and Bun; tests need internet only to fetch upstream images/packages. From this directory:

```bash
bun install --frozen-lockfile
./scripts/verify.sh
./scripts/test-local.sh
```

The local HTTP harness is designed to generate disposable secrets, build the real image, start an isolated uniquely named Compose project on a loopback port in `18400`–`18404`, exercise outsider denial and operator **read-only** access, restart, cold-copy the complete volume, restore it into a fresh volume, and remove only its own containers/network/volumes. It never creates an owner or enrollment token. HTTP requests with an explicitly supplied test cookie only test proxy plumbing; they do not qualify browser Secure cookies or passkey enrollment. These commands were not run for this docs change and do not establish 1.0.1 qualification.

Build/start/run/restart/stop/copy/smoke operations have explicit timeouts, and readiness uses a finite retry budget. Tests use a unique owned image tag and remove it only if unused; cleanup checks only their project-label resources and never prunes global Docker state.

For manual loopback checks, privately populate `.env` from `.env.example`, use a `pocket-id-` prefixed project and `docker compose -p YOUR_PROJECT up --build -d`. Do not confuse the `https://localhost:18400` test issuer string with a real TLS endpoint: Compose exposes plain HTTP and is **not** an owner-enrollment recipe. Do not disable Secure cookies or use `ALLOW_INSECURE_CALLBACK_URLS` to force enrollment.

### Disposable HTTPS browser gate

Install Playwright and its Chromium privately outside the distribution tree, then run:

```bash
POCKET_PLAYWRIGHT_MODULE="$PLAYWRIGHT_MODULE_FILE" \
POCKET_CHROMIUM="$CHROMIUM_EXECUTABLE" \
bash scripts/test-https-browser.sh
```

Set `PLAYWRIGHT_MODULE_FILE` and `CHROMIUM_EXECUTABLE` to your installed tooling files. The harness owns loopback ports 18427 and 18428, creates a fresh localhost certificate and uses isolated browser contexts. The recorded October 6 current extended run completed all protocol/recovery phases and owned-resource cleanup with exit 0. It enrolled a disposable owner through native WebAuthn with two distinct CTAP2 virtual authenticators, verified login with the first unavailable, and checked Secure/HttpOnly/SameSite operator cookies. A separately enrolled member signed in through a one-use native invitation; invitation reuse received native `401`, valid administration mutations received `403`, and a self-profile update ignored attempted administrator promotion. Owner and member completed signed S256 PKCE grants with issuer/audience/nonce/state validation; wrong verifier, unregistered callback and code replay were rejected.

The same run restarted the enrolled issuer, repeated owner/member login and grants, cold-copied the complete volume, verified a distinct independently empty restore volume and matching file hashes before startup, and repeated identity/authorization/OIDC checks with the same issuer and encryption key. After both owner authenticators were removed, it re-locked, recovered the existing owner through upstream's actual `one-time-access-token` CLI, enrolled two replacements, revoked lost credentials and checked replacement login and the unchanged OIDC subject. Replaying the consumed recovery link received native `401` and created no new session. Cleanup targets only the harness's uniquely named resources. Canonical and protocol-client test verification after that run remain the coordinating maintainer's separate checks; they are not inferred from browser success.

This harness exercises upstream protocols, including local non-admin invitation/authorization and recovery, with self-signed localhost TLS and virtual authenticators. It does not establish publicly trusted Railway TLS, live platform secret preservation, exact stored Deploy V2, live soak or a security audit. Final-source live 1.0.1 gates remain PENDING; hardware custody is outside this scope. The browser operator form requires same-origin referrer handling so Chrome sends a non-null Origin; cross-origin management requests remain denied.

Focused documentation checks need only Node and local file reads:

```bash
node scripts/verify-docs.mjs
node --test tests/docs.test.mjs
```

They validate version consistency, marketplace headings, upstream links and absence of private links. They do not build, deploy or qualify the runtime.

## Offline IaC and draft tooling

```bash
SOURCE_REPO=YOUR_OWNER/YOUR_EXISTING_REPO \
SOURCE_BRANCH=release-v1 SOURCE_ROOT_DIR=/pocket-id-passkey-sso \
node scripts/render.mjs > "$RENDER_REVIEW_FILE"
```

Set `RENDER_REVIEW_FILE` to a privately chosen review file outside Git. Rendering performs no cloud calls and substitutes secret-generation expressions into its output instead of logging generated secret values. The typed source preserves `rootDirectory` through SDK `3.6.0`; the renderer asserts the exact value. Read `PUBLISHING.md` for offline exported-draft repair/audit. Historical standalone source exists; future 1.0.1 source and marketplace publication remain PENDING.

The renderer's output is a secret-redacted offline review projection, **not an apply payload**. Native IaC evaluation generates fresh random candidates and requests preservation of existing secrets; the authorized real platform test must prove that preservation behavior.

## Backups and limits

See `UPGRADE.md` for cold backups, restore, key handling and rollback. Keep database, uploads, gateway state, upstream signing/encryption state and the original encryption key together logically, with the key separately protected. Never copy a live SQLite database alone or share one volume across replicas. Keep the issuer stable: changing a passkey relying-party domain is not a supported transparent migration.

The gateway bounds requests/responses at 16 MiB, operator payloads at 8 KiB, active connections at 64, and socket/upstream timeouts; it buffers responses and does not implement WebSocket/streaming proxying. It replaces client-supplied forwarding headers and trusts no edge IP hints, so backend IP-based limits may group clients by the Railway edge address. The finite default-boundary review is accepted within its documented scope; final live gateway qualification remains required before publication. It is not advertised as a general-purpose production reverse proxy.

Qualification cleanup targets zero running compute and standard scoped deletion of the owned test resources. The owner accepts Railway's retention disclosure: logs, backups and platform records may remain under platform policy. Deletion does not promise immediate physical erasure or billing-zero; incurred usage and retained storage may still be chargeable. Cleanup must be checked independently from runtime qualification.

### Upstream references

- [Pocket ID product](https://pocket-id.org)
- [Pocket ID source](https://github.com/pocket-id/pocket-id)
- [Environment variables](https://pocket-id.org/docs/configuration/environment-variables)
- [Pinned release](https://github.com/pocket-id/pocket-id/releases/tag/v2.17.0)
- [BSD-2-Clause license](https://github.com/pocket-id/pocket-id/blob/v2.17.0/LICENSE)
