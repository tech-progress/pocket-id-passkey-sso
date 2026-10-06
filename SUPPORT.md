# Support boundary

Recipe `1.0.1` is staged. Maintained scope: digest-pinned Pocket ID 2.17.0 and unchanged exact APK pins, one Linux service/replica, Python gate, one 1000 MB SQLite/filesystem volume, exact HTTPS issuer, locked-default manual first-owner setup, operator-managed backups and offline Railway IaC/draft checks.

The authorized historical [standalone recipe source](https://github.com/tech-progress/pocket-id-passkey-sso) exists at annotated `v1.0.0`, source commit `25c83b6205babb3dc60fc4184751f9b7acaa36db`; it is not the newly qualified 1.0.1 release. Future 1.0.1 source, exact queried Deploy V2, live secret preservation and publicly trusted Railway HTTPS owner/non-admin/OIDC/recovery/soak qualification remain PENDING. Sequential qualification/publication is authorized; this docs change performs neither.

Excluded scope: HA, multiple replicas, PostgreSQL migration, optional SMTP/automatic email recovery, upstream enterprise integrations, seamless issuer-domain changes, a complete OIDC client application and streaming/WebSocket proxying. Virtual authenticator tests do not establish hardware custody. No independent security audit, universal security guarantee or legal certification is claimed.

Distribution is source-only recipe/instructions, not OCI publication. The October 6 finite source-only/default-boundary review in `ARTIFACT_REVIEW.md` and `SECURITY_REVIEW.md` is accepted: no concrete missing grant/required notice or demonstrated default request-reachable unpatched advisory requiring a source-only hold was identified in the reviewed evidence. Required upstream grants/notices remain applicable. This does not certify complete artifact inventory, all transitive vulnerabilities or future binary redistribution. `GATE_FORCE_LOCK=true` is the default; setting it to `false` after activation exposes permitted login/application/OIDC routes to the internet. Review that exposure and upstream privilege boundaries before doing so.

The recorded current October 6 localhost browser run passed native owner/member enrollment and login, one-use invitation rejection, valid non-admin mutation denials and ignored self-promotion, signed owner/member OIDC, enrolled restart, complete hash-checked restore into a distinct empty volume, and operator-locked existing-owner recovery after loss of both authenticators. Consumed recovery-link replay received native `401`; owned-resource cleanup exited 0. These local results use a self-signed test certificate and virtual authenticators; final-source Railway gates and separate canonical/protocol-client checks remain the coordinating maintainer's responsibility.

## Common symptoms

| Symptom | Action |
| --- | --- |
| Startup refused | Check HTTPS `APP_URL` shape, separate >=32-byte secrets, `GATE_FORCE_LOCK` exact true/false, nonprivileged gateway port, and no static API key. Never paste secret values into a ticket. |
| `/healthz` ready but application 403 | Expected while locked. Use `/_operator` over the final valid HTTPS origin; readiness does not imply activation. |
| Operator form forbidden | Verify exact browser origin/host, correct private token, unexpired Secure cookie and HTTPS. Do not disable Secure/SameSite flags. |
| Activation 409 | Actual enabled administrator must have two stored passkeys. Verify each authenticator; count alone is insufficient. Live qualification uses two virtual authenticators and excludes physical custody. Complete enrollment over HTTPS; never inject rows into the real database. |
| Public access stays locked after activation | `GATE_FORCE_LOCK=true` still locks; set false only after checks. Missing/corrupt marker, changed key/origin, disabled owner, removed credentials or SQLite errors also fail closed. |
| Backend 502 / health 503 | Inspect only your deployment's process status, storage capacity and safe redacted errors. App must bind loopback, not the public port. No secrets in logs. |
| Login broke after restore | Stop traffic; compare original issuer, key fingerprint, complete volume and upstream version. Do not regenerate encryption keys, reset accounts or enable downgrade as a guess. |
| Both owner authenticators lost | Set `GATE_FORCE_LOCK=true`; use supported upstream `one-time-access-token` recovery for the existing owner under a private operator session. Enroll and verify replacements, revoke lost credentials and test consumed-link rejection before reopening. See `UPGRADE.md`; this CLI does not create a new owner. |
| Users unexpectedly rate-limited | The gate strips untrusted forwarding headers; Railway edge addresses may group clients. Review verified proxy topology before changing IP policy; never set `TRUST_PROXY=true`. |
| Build cannot resolve exact Alpine Python package | Review current Alpine security update, change the explicit package pin and reverify the complete image; do not silently float dependencies. |

## Report safely

Include template/upstream versions, image digest, redacted source root/branch, status codes, whether lock was expected, and volume attachment/replica count. Exclude encryption keys, operator tokens/cookies, OIDC client secrets, auth codes, full SQLite/volume dumps, one-time links, user PII and authenticator identifiers. The gateway deliberately suppresses access/query logging to avoid logging bootstrap credentials or OIDC codes. The backend retains its own operational/audit behavior; review it before configuring verbose logs.

Report upstream product bugs through [Pocket ID source](https://github.com/pocket-id/pocket-id); use [Pocket ID documentation](https://pocket-id.org) for supported identity configuration. Suspected compromise: lock ingress, preserve encrypted forensic backups, then follow a separately authorized incident plan. A gate token can be rotated to revoke its cookies without changing the stable app encryption key.

The owner accepts qualification cleanup of zero running compute plus standard scoped deletion and retention disclosure. Verify resulting resource states. Platform logs/backups/records may remain and incurred usage or retained storage may still be chargeable; no immediate physical erasure or billing-zero is promised.
