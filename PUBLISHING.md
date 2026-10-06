# Publishing Pocket ID passkey SSO

**Recipe `1.0.1` is staged; final qualification/publication is PENDING.** Sequential qualification and publication of Pocket ID next is authorized. This documentation pass makes no public commits, tags, pushes, cloud deployments or marketplace changes. The coordinating maintainer owns runtime/harness changes, release freeze, artifact/license review, root metadata and verifier integration.

## Source and release identity

The authorized public standalone [recipe source](https://github.com/tech-progress/pocket-id-passkey-sso) exists historically. Its annotated `v1.0.0` tag points to source commit `25c83b6205babb3dc60fc4184751f9b7acaa36db`. That is historical source, not a final newly qualified 1.0.1 release. Publication of the future 1.0.1 source is PENDING; do not fabricate its commit, tag link, marketplace ID, deployment code or deploy button.

Set `SOURCE_REPO` to the authorized accessible `owner/repository`, `SOURCE_BRANCH` to the exact existing slash-free release channel, and `SOURCE_ROOT_DIR` to `/` for the standalone recipe or `/pocket-id-passkey-sso` for this monorepo. The local default branch is `release-v1`; its existence and exact commit must be checked remotely for the selected source. Verify the Railway GitHub App grant for that source. Historical source availability is not proof of current grant access or future 1.0.1 contents.

The SDK is locked at Railway `3.6.0`. Source is typed as `{type:"github", repo, branch, rootDirectory}` so the nested root directory survives compilation. `scripts/render.mjs` asserts the exact nonempty root and prints secret-generation expressions instead of generated values. Its secret-redacted output is an offline review projection, not an apply payload. Offline rendering cannot establish a live deployment, source grant or stored template contract.

## Distribution and accepted finite review

Release distribution is source-only recipe/instructions, not an OCI image publication. Railway builds the Dockerfile using the exact Pocket ID `v2.17.0` image digest and the existing 17-package `apk.lock`. This docs stage changes neither pin set nor the runtime topology.

The October 6 finite source-only review in `ARTIFACT_REVIEW.md` and `SECURITY_REVIEW.md` is accepted for the reviewed recipe/configuration/external references. It identified no concrete missing grant or required notice, and no demonstrated default request-reachable unpatched advisory requiring a source-only publication hold in the reviewed evidence. It does not certify a complete assembled image, SBOM or universal native/transitive exposure. Preserve the scoped authored MIT grant and exact upstream BSD notice, and confirm the disposition still applies to the frozen source. Any future OCI/binary/dependency-bundle distribution requires a separate exact component/obligation review, including applicable GPL corresponding-source and notice arrangements. No blanket license clearance, legal certification, external security certification or universal security guarantee is claimed.

Review default exposure explicitly: only the gateway port `8080` has a public HTTPS domain; the backend and actor listeners stay loopback-only with no TCP proxy. `GATE_FORCE_LOCK=true` is the template default. After verified activation, setting it to `false` makes permitted application/login/OIDC routes public. Upstream authentication and authorization must then enforce user privileges. A healthy process or operator cookie is not permission to skip this review.

## Offline draft restore and audit

Keep an actual exported draft privately outside Git. The scripts accept raw `serializedConfig`, `{serializedConfig:...}` or `{data:{template:{serializedConfig:...}}}`. Set the source variables above, then supply your privately chosen filenames through shell variables:

```bash
./scripts/restore-template-draft.sh "$EXPORTED_DRAFT_FILE" "$REPAIRED_DRAFT_FILE"
./scripts/audit-template.sh "$REPAIRED_DRAFT_FILE"
```

These scripts make no network calls or submissions. Repair requires exactly one named `Pocket ID` service and one existing volume binding, retains their real binding keys and IDs, enforces `/app/data` at 1000 MB, and removes backend/TCP exposure. It refuses missing/extra services or volumes and existing output files; new output is mode 0600. Supported service containers are a list, a mapping keyed by an actual service ID with `name: "Pocket ID"`, or a mapping keyed by `"Pocket ID"`. An unlabeled mapping cannot identify the intended service safely and is rejected.

Offline fixture checks do not prove the live schema or stored draft. Query and audit the exact saved Deploy V2 representation after platform changes, and query it again before final publication. A separate source deployment or similarly configured project cannot substitute for this check.

## Sequential qualification gates

All live gates below are **PENDING** for recipe 1.0.1. The recorded October 6 current extended localhost browser run completed all five protocol/recovery phases and owned-resource cleanup with exit 0: native owner passkeys, one-use member invitation/login and authorization, signed owner/member OIDC, enrolled restart/full-volume restore, and operator-locked native recovery after loss of both authenticators. See `README.md` for the verified scope. Its self-signed localhost certificate and virtual authenticators do not prove publicly trusted Railway TLS, live secret preservation, exact Deploy V2 or live soak. Canonical and protocol-client tests after the browser run are separate coordinating-maintainer checks. Record final-source results privately and requalify if the frozen candidate changes.

1. Freeze and review the exact candidate. Verify authorized source/grant, commit/channel/root, Pocket ID 2.17.0 image digest, all unchanged APK pins, Dockerfile/build/start/health commands, one service/one replica and one dedicated 1000 MB volume mounted at `/app/data`. Prove it builds and starts with Railway's commands. Query the exact stored Deploy V2 contract: locked default, gate-only domain/port, no backend/actor/TCP ingress, variables/descriptions and correct volume binding. Reject any mismatch.
2. Verify fresh independent encryption/operator secrets for each new instantiation. Direct IaC uses cryptographic random candidates with raw `preserveExisting:true`; compiled metadata is not live preservation. Through actual reapply/redeploy, verify existing keys remain byte-identical without printing them. Stop if a plan would rotate either secret. Confirm no secrets, local environment files, private test reports or operational identifiers enter the public recipe.
3. Verify publicly trusted HTTPS at the final canonical `APP_URL`, without certificate-error bypass. From an unrelated unauthenticated client/browser, require denial of first-claim/UI/API/OIDC routes while locked. Reject wrong-origin operator POSTs, bad tokens and forged cookies. Prove only the gateway is reachable.
4. Use the operator form over that HTTPS origin and actual upstream setup to enroll an enabled owner with **two distinct virtual authenticators**. Verify each native WebAuthn credential separately, including login while the other authenticator is unavailable. Exercise interrupted setup, session expiry and re-entry. Activate explicitly; never insert synthetic credentials into SQLite. Virtual authenticators do not establish hardware custody, which is excluded from this qualification.
5. After locked setup/activation checks pass, set `GATE_FORCE_LOCK=false` and redeploy for public-route checks. Require setup UI/API to stay denied, and application admin APIs to deny a valid operator cookie with no Pocket ID login. Enroll a real non-admin account through a one-use native invitation; require successful login and native rejection of invitation reuse. Require `403` for valid administration mutations to users/groups, clients, configuration, signup tokens and recovery; verify attempted self-profile promotion is ignored and protected state stays unchanged. Re-lock on failure.
6. Register a real OIDC client with exact HTTPS callbacks. Complete authorization-code/S256 PKCE for both owner and member and verify issuer, audience, signature, nonce and state at the client. Reject wrong callbacks/verifiers, missing or mismatched state and reused codes. Keep secrets and authorization codes out of logs. Discovery advertising S256 is not a completed grant.
7. Recover with the second virtual authenticator while the first is unavailable. Restart the enrolled service and repeat login and the existing client grant with the same issuer/key state. Cold-back up complete volume state and protect the original encryption key separately; restore to a distinct independently empty volume, verify complete file hashes before startup, and repeat owner/member passkey, authorization and signed OIDC checks with the same origin/key. Never serve two restored issuer copies concurrently. For loss of both owner authenticators, re-lock and exercise upstream's actual `one-time-access-token` CLI for the existing owner: private operator-session link use, preserved owner identity, replacement enrollment, lost-key revocation, consumed-link `401` with no new session, and replacement login/OIDC. This recovery CLI does not create the first owner; no owner-creation CLI or automatic email-reset flow is supplied.
8. Complete the bounded live soak defined by the coordinating maintainer's harness. Record its actual duration, request budget and result; no duration or successful soak is asserted here. Include lock behavior, restart/readiness, payload limits, safe logging, dependency status and the custom gateway security review. Optional SMTP and physical authenticator custody are excluded; no universal security or legal certification follows from these checks.
9. Complete cleanup separately: zero running compute, standard scoped deletion of the qualification resources, and read-back of their resulting states. The owner accepts the retention disclosure below. Keep the source/distribution release separate from disposable test-resource deletion. Cleanup must not erase the qualification record or affect unrelated resources.
10. Confirm the accepted finite source-only review still covers the frozen candidate, retain required notices and close every remaining qualification gate before final release. Publish the reviewed standalone 1.0.1 source and verify its exact public contents and tag/commit, then re-query the exact saved Deploy V2/source/default exposure. Do not call the historical `v1.0.0` tag the new release or publish a candidate whose source differs from what was qualified.

A changed release source needs renewed qualification against that exact source. Any failed or unresolved gate blocks final publication; source availability and healthy local processes cannot waive it.

## Cleanup and retention disclosure

The owner accepts zero running compute plus standard scoped deletion of owned qualification resources. Verify compute has stopped and the intended resources were deleted; do not infer cleanup from a shell command's exit code. Inspect remaining owned volumes/deployments/domains according to platform behavior, and disclose any retained resources or failed deletion.

Standard deletion is not a promise of immediate physical erasure or billing-zero. Railway may retain logs, backups and platform records under its policies; accrued compute, retained storage and other incurred usage may remain billable. Report those limits and any observed residuals without promising a retention period that was not verified. Never delete unrelated resources to improve a cleanup result.

## Marketplace metadata and release handoff

Keep `marketplace-metadata.json` and the marketplace text aligned: description **Passkey OIDC identity with guarded setup and persistent SQLite.**, Pocket ID product icon, and both main upstream links below. The icon is the pinned Pocket ID frontend asset, not a vendor/dependency avatar. The coordinating maintainer owns the root entry in `railway-template-metadata.json`, actual publication identity and shared sync/audit.

For final publication, run repository-wide `scripts/sync-template-marketplace.sh` and require `scripts/audit-template-marketplace.sh` to pass. Preserve the upstream links in this README and the standalone GitHub README. Exclude private findings, qualification reports, local tooling paths, secrets and live resource identifiers from public docs/artifacts.

Once qualified, follow repository-wide versioning: template-scoped monorepo tag `pocket-id-passkey-sso-v1.0.1`, standalone annotated `v1.0.1`, and a verified slash-free release channel. These are intended future names, not tags created by this change. Record real public identities only after publication supplies them.

- [Pocket ID product](https://pocket-id.org)
- [Pocket ID source](https://github.com/pocket-id/pocket-id)
- [Pinned upstream release](https://github.com/pocket-id/pocket-id/releases/tag/v2.17.0)
