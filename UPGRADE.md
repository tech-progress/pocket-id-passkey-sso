# Upgrade, backup and recovery

## Before changing anything

Record template version, actual running Pocket ID version/digest, final `APP_URL`, original encryption-key fingerprint, replica/volume attachment and the current source commit. Save the **original** `ENCRYPTION_KEY` separately in an encrypted secret manager, and keep `GATE_ADMIN_TOKEN` out of archive manifests. Neither enrollment private keys nor app login/bootstrap secrets belong in ordinary service variables or logs; authenticator private keys remain on the authenticators.

Set `GATE_FORCE_LOCK=true`, confirm outsider denial, schedule downtime, and stop the app before a whole-volume copy. Preserve all of `/app/data`: SQLite database **and sidecars**, uploads, signing/encrypted state, and `gateway-state.json`. Do not copy the live `.db` alone or rely on a shared Railway disk between services.

## Local cold backup helper

For an explicitly owned running local `pocket-id-` prefixed Compose project, with its original variables privately available:

```bash
./scripts/backup-local.sh pocket-id-YOUR_PROJECT /secure/new-pocket-backup --confirm-stop
```

This stops only that named service, cold-copies its volume through `docker cp`, checks SQLite integrity and emits a nonsecret manifest, then restarts it. It does not copy keys from environment or log credential data. The raw archive nevertheless contains sensitive identity/state data: immediately encrypt it and move off-host, not into Git. Save the original encryption key separately. The manifest's key/kv fingerprints help detect mismatches but do **not** prove every encrypted field can be decrypted or that a passkey login succeeds.

Railway production backups/restores require separately authorized platform access. This helper is not a Railway volume export tool, and no cloud backup/recovery operation was tested here.

## Restore procedure

1. Keep the old service stopped and public routing locked. Never let two issuer copies serve the same domain concurrently.
2. Create an empty dedicated volume for the restore target; attach it at `/app/data`. Restore the complete stopped archive before app startup, with ownership UID/GID 1000. The upstream entrypoint repairs ownership when it starts as root.
3. Use the same pinned application version initially, exact canonical HTTPS `APP_URL`, and original `ENCRYPTION_KEY`. Restore the operator token separately or deliberately rotate it to invalidate old gate cookies. Keep `GATE_FORCE_LOCK=true` throughout the drill.
4. Compare key fingerprint, `PRAGMA quick_check`, upstream persisted state, users/credentials and complete uploads. Do not inject a user or fabricated credential to "repair" activation. A missing/bad marker or missing owner credentials must stay locked.
5. At the **same verified HTTPS origin**, test both owner authenticators, an existing real OIDC client grant, invalid callback/PKCE denial and non-admin boundaries. This is mandatory; a DB integrity check cannot prove identity recovery.
6. Re-activate through the operator gate if required, then set `GATE_FORCE_LOCK=false` only after the real tests pass. If keys/origin differ, stop and investigate rather than silently rewriting activation state or re-enrolling every user.

Automated local evidence covers restart and cold restore of an **empty-owner** real instance into a fresh local volume. It does not cover enrolled credentials, browser TLS, client secrets, real OIDC grants or disaster recovery with real users.

## Upgrade and rollback

Check the actual latest release/license/security notes in [Pocket ID source](https://github.com/pocket-id/pocket-id) and [configuration docs](https://pocket-id.org/docs/configuration/environment-variables). Review pinned `usersignup`, WebAuthn table schema, proxy trust, encryption requirements and container entrypoint before bumping: the wrapper activation check is deliberately schema-bound to 2.17.0.

Update the upstream version/digest and Alpine Python package pin together with `VERSION`/`CHANGELOG.md`, then run structure/unit/offline source/draft tests, local build/restart/restore, and the real HTTPS qualification gates. If an upgrade migrates SQLite, rollback means restoring the pre-upgrade archive with its matching image/key—not simply running an older binary against a newer DB. The wrapper forces `ALLOW_DOWNGRADE=false`.

Do not change `APP_URL` casually. Passkeys are scoped to their relying-party domain, and OIDC clients trust the issuer. A new issuer/domain requires an explicitly designed migration, user re-enrollment/client reconfiguration as appropriate, and separate qualification, not an in-place variable edit.
