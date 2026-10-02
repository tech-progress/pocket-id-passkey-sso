# Support boundary

Maintained scope: digest-pinned Pocket ID 2.17.0, single Linux container, Python gate, one SQLite/filesystem volume, exact HTTPS issuer, guarded first-owner setup, operator-managed backups and offline Railway IaC/draft checks.

Not claimed: HA, multiple replicas, PostgreSQL migration, automatic SMTP/recovery, upstream enterprise integrations, seamless issuer-domain changes, a complete OIDC client application, large streaming/WebSocket proxying, independent security audit, live marketplace publication or real passkey/OIDC qualification. This candidate remains blocked on `PUBLISHING.md`'s unrun gates.

## Common symptoms

| Symptom | Action |
| --- | --- |
| Startup refused | Check HTTPS `APP_URL` shape, separate >=32-byte secrets, `GATE_FORCE_LOCK` exact true/false, nonprivileged gateway port, and no static API key. Never paste secret values into a ticket. |
| `/healthz` ready but application 403 | Expected while locked. Use `/_operator` over the final valid HTTPS origin; readiness does not imply activation. |
| Operator form forbidden | Verify exact browser origin/host, correct private token, unexpired Secure cookie and HTTPS. Do not disable Secure/SameSite flags. |
| Activation 409 | Actual enabled administrator must have two stored passkeys. Count alone does not prove independent hardware. Complete enrollment over HTTPS; never inject rows into the real database. |
| Public access stays locked after activation | `GATE_FORCE_LOCK=true` still locks; set false only after checks. Missing/corrupt marker, changed key/origin, disabled owner, removed credentials or SQLite errors also fail closed. |
| Backend 502 / health 503 | Inspect only your deployment's process status, storage capacity and safe redacted errors. App must bind loopback, not the public port. No secrets in logs. |
| Login broke after restore | Stop traffic; compare original issuer, key fingerprint, complete volume and upstream version. Do not regenerate encryption keys, reset accounts or enable downgrade as a guess. |
| Users unexpectedly rate-limited | The gate strips untrusted forwarding headers; Railway edge addresses may group clients. Review verified proxy topology before changing IP policy; never set `TRUST_PROXY=true`. |
| Build cannot resolve exact Alpine Python package | Review current Alpine security update, change the explicit package pin and reverify the complete image; do not silently float dependencies. |

## Report safely

Include template/upstream versions, image digest, redacted source root/branch, status codes, whether lock was expected, and volume attachment/replica count. Exclude encryption keys, operator tokens/cookies, OIDC client secrets, auth codes, full SQLite/volume dumps, one-time links, user PII and authenticator identifiers. The gateway deliberately suppresses access/query logging to avoid logging bootstrap credentials or OIDC codes. The backend retains its own operational/audit behavior; review it before configuring verbose logs.

Report upstream product bugs through [Pocket ID source](https://github.com/pocket-id/pocket-id); use [Pocket ID documentation](https://pocket-id.org) for supported identity configuration. Suspected compromise: lock ingress, preserve encrypted forensic backups, then follow a separately authorized incident plan. A gate token can be rotated to revoke its cookies without changing the stable app encryption key.
