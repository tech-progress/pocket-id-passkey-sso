# Deploy and Host Pocket ID on Railway

Run [Pocket ID](https://pocket-id.org), a passkey-only OpenID Connect provider, with guarded first-owner setup and persistent SQLite. [Pocket ID source](https://github.com/pocket-id/pocket-id) is the main upstream product. **Recipe `1.0.1` is staged; final qualification and marketplace publication are PENDING.** The authorized historical [standalone recipe source](https://github.com/tech-progress/pocket-id-passkey-sso) exists at `v1.0.0`; it is not the newly qualified 1.0.1 release.

## About Hosting Pocket ID

This recipe pins Pocket ID 2.17.0 and exact runtime APKs, with one service, one replica and one dedicated 1000 MB volume at `/app/data`. Its public gateway keeps application routes operator-only by default with `GATE_FORCE_LOCK=true`; the backend and actor listeners stay loopback-only. Owner setup is manual over the final verified HTTPS issuer, requires two separately verified credentials and explicit activation. Setting the force lock to `false` after activation exposes permitted login/application/OIDC routes; upstream authorization then enforces user privileges.

Marketplace description: **Passkey OIDC identity with guarded setup and persistent SQLite.**

Product icon: [Pocket ID logo](https://raw.githubusercontent.com/pocket-id/pocket-id/v2.17.0/frontend/static/img/static-logo.svg). This description, product icon and upstream links match the template metadata.

## Why Deploy Pocket ID on Railway?

Railway supplies an HTTPS edge, service lifecycle and a persistent volume. The recipe adds a locked setup perimeter, independent encryption/operator secrets and recovery/restore instructions. A health check does not create an administrator or unlock the identity provider.

This is a small-team single-node baseline with no HA claim. Future 1.0.1 public source, exact queried Deploy V2, live secret preservation and publicly trusted Railway HTTPS owner/non-admin/OIDC/recovery/soak qualification are PENDING. The recorded October 6 current localhost browser run passed native owner/member identity, non-admin authorization, signed OIDC, enrolled restart, full hash-checked empty-volume restore and existing-owner CLI recovery after loss of both authenticators, with owned-resource cleanup exit 0. Its self-signed TLS does not qualify the live Railway endpoint. Protocol checks with virtual authenticators do not establish physical hardware custody.

Distribution is source-only recipe/instructions, not an OCI image publication. The finite October 6 review in `ARTIFACT_REVIEW.md` and `SECURITY_REVIEW.md` is accepted for the reviewed source recipe and default boundary: no concrete missing grant/notice or demonstrated default request-reachable unpatched advisory requiring a source-only hold was identified. Applicable upstream grants/notices remain required; complete artifact/transitive clearance and future binary distribution approval are not claimed. Optional SMTP, hardware custody, universal security guarantees and legal certification are outside this scope.

## Common Use Cases

- Add passkey sign-in to OIDC-capable internal applications.
- Replace application-specific passwords with authenticator-backed login.
- Maintain a small team's self-hosted issuer with guarded owner setup.

## Dependencies for Pocket ID Hosting

- A stable final HTTPS origin and two independently usable owner credentials; operators manage their production authenticators.
- One dedicated Railway volume, complete off-host backups and separately protected original encryption key.
- Authorized GitHub source/release channel and a verified Railway GitHub App grant. Historical source exists; future 1.0.1 source is PENDING.
- Private operator access to `GATE_ADMIN_TOKEN` and a separate Pocket ID administrator session.
- Completion of the publishing checklist and required license notices, with the accepted finite source-only review confirmed against the frozen release candidate.

### Deployment Dependencies

- [Pocket ID](https://pocket-id.org)
- [Pocket ID source](https://github.com/pocket-id/pocket-id)
- [Pocket ID configuration](https://pocket-id.org/docs/configuration/environment-variables)

Follow `README.md` and `PUBLISHING.md`: set `APP_URL` before enrollment, keep the default lock during setup, and use `/_operator` at verified HTTPS. Do not expose the backend or substitute a static API key for setup protection. No SMTP account or remote database is required.

Qualification cleanup aims for zero running compute and standard scoped deletion, with the owner's accepted retention disclosure. Platform logs/backups/records may remain; cleanup does not promise immediate physical erasure or billing-zero.
