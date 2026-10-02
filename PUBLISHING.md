# Publishing Pocket ID passkey SSO

**Draft only. No publication, source repository creation, cloud deployment or paid infrastructure was authorized or performed.** Template version `1.0.0`; root metadata registration/sync/audit is deferred to the coordinating maintainer because this implementation writes only this directory.

## Real source, never a fabricated distribution

Set `SOURCE_REPO` to an existing accessible `owner/repository` and `SOURCE_BRANCH` to an existing slash-free `release-v1` channel. Use `/pocket-id-passkey-sso` for this monorepo, or `/` only for a real, authorized sanitized standalone mirror. Give the Railway GitHub App access before a source deploy. Local syntax/render checks cannot prove remote source existence or App authorization; both remain unrun gates.

The SDK is locked at Railway `3.6.0`. Source is explicitly `{type:"github", repo, branch, rootDirectory}`: untyped source objects silently lose nested rootDirectory in this SDK. `scripts/render.mjs` evaluates locally and asserts a nonempty exact root. It prints secret expressions, not generated values. No `config plan/apply`, project create, GitHub API mutation or template publish occurs in the offline tooling.

## Offline draft restore and audit

Obtain an actual exported draft through a separately authorized read-only workflow and save the JSON privately. The scripts accept either raw `serializedConfig`, `{serializedConfig:...}`, or the existing GraphQL response shape `{data:{template:{serializedConfig:...}}}`. No invented IDs are included in shipped metadata.

```bash
export SOURCE_REPO=YOUR_OWNER/YOUR_EXISTING_REPO
export SOURCE_BRANCH=release-v1
export SOURCE_ROOT_DIR=/pocket-id-passkey-sso
./scripts/restore-template-draft.sh /secure/exported-draft.json /secure/repaired-draft.json
./scripts/audit-template.sh /secure/repaired-draft.json
```

Both scripts are **offline**, make zero network calls, and never submit repaired JSON. Restoration requires exactly one named `Pocket ID` service and exactly one existing volume binding. It retains actual service and volume IDs, replaces source/build/start/health/replica settings with the local rendered contract, restores all generated/default variables and descriptions, sets the mount to `/app/data`/1000 MB, and removes stale backend/TCP exposure. It refuses missing or extra services/volumes instead of inventing bindings; the output must be a new file and is mode 0600. The audit rejects unexpected source fields, unsafe added variables, wrong roots, wrong volumes, incorrect starts and non-gate networking. Review the actual platform serialization after any future API/schema change.

## Mandatory gates before publication

The local HTTPS browser harness now proves native owner registration, second-authenticator login, complete S256 grants with signature/issuer/audience/nonce/state checks and enrolled fresh-volume restore. Its self-signed localhost TLS and virtual authenticators do not close the publicly trusted Railway HTTPS, independent hardware custody, non-admin invitation, exact stored deployment or soak gates. Do not treat the old HTTP plumbing harness as equivalent evidence.

The `services` container may be a list of named service objects, a mapping keyed by the actual service ID with `name: "Pocket ID"`, or a mapping keyed by `"Pocket ID"`. Its original shape and binding keys are retained and all three shapes have local fixture tests. An unlabeled UUID mapping cannot safely identify the intended service and is rejected. These are offline fixture tests, **not a completed cloud audit**; an actual exported/stored draft still needs its live-schema/real deployment gate.

1. Verify accessible source, exact release channel and root directory, Dockerfile image digest, one replica, one dedicated volume, gate-only domain on port 8080, fresh independent secrets for each new template instantiation, preservation of existing secrets on reapply/redeploy, and locked-by-default actual stored draft. Direct IaC uses cryptographic random candidates with raw `preserveExisting:true`; compiled flags were tested locally, **live platform preservation was not**. Verify original encryption key/operator token remain byte-identical through an authorized real reapply before trusting this route. Never apply a plan that unexpectedly rotates them. Deploying a source tree does not prove the stored draft.
2. Confirm valid HTTPS at the final issuer and canonical `APP_URL`. From an unrelated unauthenticated browser/client, verify all first-claim/UI/API paths return 403 before operator setup. Verify wrong-origin management POSTs, bad tokens and forged cookies are denied and the backend has no public/private-service ingress.
3. Use an operator cookie over real HTTPS, enroll the first owner through actual upstream setup and verify two independent passkeys. Test interrupted setup/session expiry and re-entry without public exposure. Never create synthetic credentials in the real volume to satisfy activation.
4. With the gate unlocked but no application login, deny admin APIs. Enroll a real non-admin user by the intended invitation flow and prove they cannot administer users, groups, OIDC clients, configuration, signup tokens or recovery. A static API key is not acceptable evidence.
5. Create a real OIDC client with exact HTTPS callback allowlist. Complete authorization-code with S256 PKCE; validate issuer, audience, state, nonce and signature at the client; reject wrong callback, mismatched verifier, missing/incorrect state and reused code without leaking authorization codes in logs. Metadata advertising S256 is not a completed grant.
6. Lose access to the first authenticator and recover using the independently tested second authenticator. Document an upstream-reviewed loss-of-all-authenticators process; do not invent a create-owner CLI or email reset flow.
7. Stop and restart the enrolled real service; re-login, use the original issuer and verify prior OIDC client/key state. Cold-back up complete state plus separately saved original encryption key, restore onto a new isolated volume with the **same** origin, and repeat passkey login and a real OIDC grant. Never run two restored issuers concurrently under one domain.
8. Review the custom Python perimeter, supported payload limits, logging, DoS/rate-limit behavior and dependency/vulnerability status. This is a new authentication boundary, not a mature general-purpose reverse proxy. No external vulnerability audit is claimed.
9. Only after authorization, add the directory metadata entry to root `railway-template-metadata.json`, using the Pocket ID product icon and both main-product upstream links. Run root `scripts/sync-template-marketplace.sh` then require `scripts/audit-template-marketplace.sh` to pass. Preserve upstream links in any standalone README and exclude monorepo-private `FINDINGS.md`/test evidence from public mirrors.
10. Follow `TEMPLATE_VERSIONING.md`: template-scoped monorepo tag `pocket-id-passkey-sso-v1.0.0`, standalone `v1.0.0` only if such a repo exists, and a slash-free release channel. Actual commits/tags/publication require explicit permission and were not performed here.

No candidate ID/code/deploy URL or root catalog mutation should be added until real publication supplies it. Gate failures block publication rather than being waived by a healthy local process.
