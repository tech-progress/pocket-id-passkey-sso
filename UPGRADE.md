# Upgrade, backup and recovery

Recipe `1.0.1` is staged with unchanged Pocket ID 2.17.0 image/APK pins and the same one-service/one-replica/1000 MB volume contract. The authorized historical [standalone recipe source](https://github.com/tech-progress/pocket-id-passkey-sso) at annotated `v1.0.0` is not the newly qualified 1.0.1 release. Future 1.0.1 source and live qualification remain PENDING. Sequential qualification/publication is authorized; no cloud backup, new release tag or deployment is claimed by this docs change.

## Before changing anything

Record template version, actual running Pocket ID version/digest, final `APP_URL`, original encryption-key fingerprint, replica/volume attachment and the current source commit. Save the **original** `ENCRYPTION_KEY` separately in an encrypted secret manager, and keep `GATE_ADMIN_TOKEN` out of archive manifests. Neither enrollment private keys nor app login/bootstrap secrets belong in ordinary service variables or logs; authenticator private keys remain on the authenticators.

Set `GATE_FORCE_LOCK=true`, confirm outsider denial, schedule downtime, and stop the app before a whole-volume copy. Preserve all of `/app/data`: SQLite database **and sidecars**, uploads, signing/encrypted state, and `gateway-state.json`. Do not copy the live `.db` alone or rely on a shared Railway disk between services.

## Local cold backup helper

For an explicitly owned running local `pocket-id-` prefixed Compose project, with its original variables privately available:

```bash
./scripts/backup-local.sh "$OWNED_COMPOSE_PROJECT" "$NEW_BACKUP_DIRECTORY" --confirm-stop
```

Set these shell variables to your owned `pocket-id-` prefixed Compose project and a new private backup directory outside Git. This stops only that named service, cold-copies its volume through `docker cp`, checks SQLite integrity and emits a nonsecret manifest, then restarts it. It does not copy keys from environment or log credential data. The raw archive nevertheless contains sensitive identity/state data: immediately encrypt it and move off-host, not into Git. Save the original encryption key separately. The manifest's key/kv fingerprints help detect mismatches but do **not** prove every encrypted field can be decrypted or that a passkey login succeeds.

Use authorized platform access for Railway backups/restores. This helper is not a Railway volume export tool; live 1.0.1 recovery remains PENDING.

## Restore procedure

1. Keep the old service stopped and public routing locked. Never let two issuer copies serve the same domain concurrently.
2. Create an empty dedicated volume for the restore target; attach it at `/app/data`. Restore the complete stopped archive before app startup, with ownership UID/GID 1000. The upstream entrypoint repairs ownership when it starts as root.
3. Use the same pinned application version initially, exact canonical HTTPS `APP_URL`, and original `ENCRYPTION_KEY`. Restore the operator token separately or deliberately rotate it to invalidate old gate cookies. Keep `GATE_FORCE_LOCK=true` throughout the drill.
4. Compare key fingerprint, `PRAGMA quick_check`, upstream persisted state, users/credentials and complete uploads. Do not inject a user or fabricated credential to "repair" activation. A missing/bad marker or missing owner credentials must stay locked.
5. At the **same verified HTTPS origin**, test both owner authenticators, an existing real OIDC client grant, invalid callback/PKCE denial and non-admin boundaries. This is mandatory; a DB integrity check cannot prove identity recovery.
6. Re-activate through the operator gate if required, then set `GATE_FORCE_LOCK=false` only after the real tests pass. If keys/origin differ, stop and investigate rather than silently rewriting activation state or re-enrolling every user.

The HTTP harness checks empty-owner persistence separately. The recorded October 6 current extended HTTPS browser run passed enrolled owner/member restart, complete cold backup, a distinct independently empty restore volume with matching full file hashes before startup, and owner/member login, authorization and signed PKCE grants after restore using the original issuer/key. It also passed loss-of-both-authenticators recovery as described below and owned-resource cleanup with exit 0. These local checks use virtual authenticators and a self-signed localhost certificate. Publicly trusted Railway TLS, exact queried Deploy V2, live secret preservation, final-source live recovery and soak remain PENDING; physical hardware custody and optional SMTP are excluded. Separate canonical/protocol-client test checks remain parent-owned.

## Loss of both owner authenticators

Re-lock public ingress with `GATE_FORCE_LOCK=true` and preserve the existing owner, volume, issuer and encryption key. Establish a private operator browser session at the canonical HTTPS origin. The pinned upstream binary supports `one-time-access-token <existing-username>` for an existing user. Run it through authorized private service access with the original database and runtime environment; it is recovery, not a first-administrator creation CLI. Treat its same-origin `/lc/` link as a login secret: capture it privately, use it only in the operator session and never paste it into logs, variables or tickets.

After consuming the link, confirm the original owner identity, enroll two replacement authenticators and verify them, then revoke the lost credentials. Re-activate if needed while keeping the force lock set. Log out and require replay of the consumed link to receive native `401` without creating a new application session; verify replacement passkey login and the unchanged OIDC subject before restoring public access. The recorded localhost run passed existing-owner recovery, two replacement enrollments, lost-key revocation, consumed-link rejection and replacement login/OIDC. It does not establish live Railway recovery or physical custody. An unavailable or corrupt database/key still requires a complete backup restore; the recovery CLI cannot replace those inputs.

## Upgrade and rollback

Check the actual latest release/license/security notes in [Pocket ID source](https://github.com/pocket-id/pocket-id) and [configuration docs](https://pocket-id.org/docs/configuration/environment-variables). Review pinned `usersignup`, WebAuthn table schema, proxy trust, encryption requirements and container entrypoint before bumping: the wrapper activation check is deliberately schema-bound to 2.17.0.

Update the upstream version/digest and Alpine Python package pin together with `VERSION`/`CHANGELOG.md`, then run structure/unit/offline source/draft tests, local build/restart/restore, and the real HTTPS qualification gates. If an upgrade migrates SQLite, rollback means restoring the pre-upgrade archive with its matching image/key—not simply running an older binary against a newer DB. The wrapper forces `ALLOW_DOWNGRADE=false`.

Recipe 1.0.1 is a recipe revision, not an upstream version bump: keep the current image digest and all 17 exact APK pins for this release. Any later upstream change needs the complete lock reviewed and qualified; do not float dependencies to make a build pass. Distribution is source-only recipe/instructions, not OCI publication. The finite October 6 source-only/default-boundary review in `ARTIFACT_REVIEW.md` and `SECURITY_REVIEW.md` is accepted for the reviewed candidate, with no concrete missing grant/notice or demonstrated default request-reachable unpatched advisory requiring a source-only hold identified. Required notices and final-source live qualification still apply; later source/dependency changes require renewed review, and future binary/image distribution needs a separate exact component/obligation assessment. No universal security guarantee or legal certification is offered.

Do not change `APP_URL` casually. Passkeys are scoped to their relying-party domain, and OIDC clients trust the issuer. A new issuer/domain requires an explicitly designed migration, user re-enrollment/client reconfiguration as appropriate, and separate qualification, not an in-place variable edit.

Re-lock on any failed drill. After successful activation, setting `GATE_FORCE_LOCK=false` exposes permitted login/application/OIDC routes, so repeat the non-admin checks before restoring traffic. Maintain one issuer and one volume; this recipe supplies no HA or automatic failover.

The owner accepts zero running compute and standard scoped deletion of disposable qualification resources with retention disclosure. Keep intended encrypted recovery backups separate from those disposable resources. Platform logs/backups/records may remain, and incurred usage or retained storage may be chargeable; cleanup does not promise physical erasure or billing-zero.

Main upstream: [Pocket ID](https://pocket-id.org) and [Pocket ID source](https://github.com/pocket-id/pocket-id).
