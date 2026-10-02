# Deploy and Host Pocket ID on Railway

Run [Pocket ID](https://pocket-id.org), a passkey-first OpenID Connect provider, with guarded first-owner setup and persistent SQLite. [Pocket ID source](https://github.com/pocket-id/pocket-id) documents the main upstream product. **This is an unpublished candidate, not a live deploy listing.**

## About Hosting Pocket ID

This template pins Pocket ID 2.17.0 and runs a single service with a dedicated `/app/data` volume. Its public gateway keeps every app route operator-only by default; the actual backend is loopback-only. The real owner must enroll over the final HTTPS issuer origin, register two independent authenticators, and explicitly activate the deployment before normal OIDC traffic is permitted.

## Why Deploy Pocket ID on Railway?

Railway provides an HTTPS edge, service lifecycle and persistent volume. The template adds a fail-closed setup perimeter, separate generated encryption/operator secrets and a documented recovery/restore checklist. A health check does not create an administrator or unlock the identity provider.

This is a single-replica small-team baseline, not an HA architecture. Local security/restart/empty-instance restore tests passed; real HTTPS owner enrollment, OIDC PKCE, second-authenticator recovery and enrolled-instance restore are mandatory unrun publication gates.

## Common Use Cases

- Add passkey-based sign-in to OIDC-capable internal applications.
- Replace application-specific passwords with authenticator-backed login.
- Maintain a small team's self-hosted issuer with guarded owner setup.

## Dependencies for Pocket ID Hosting

- A stable final HTTPS origin and real passkey-capable authenticator, plus an independent recovery authenticator.
- A dedicated Railway volume and secure off-host backups of the full state and original encryption key.
- An existing authorized GitHub source/release channel containing this template. No distribution repository is assumed.
- Operator access to the separately generated `GATE_ADMIN_TOKEN` and Pocket ID's actual administrator session.

### Deployment Dependencies

- [Pocket ID](https://pocket-id.org)
- [Pocket ID source](https://github.com/pocket-id/pocket-id)
- [Pocket ID configuration](https://pocket-id.org/docs/configuration/environment-variables)

Set `APP_URL` before enrolling, keep `GATE_FORCE_LOCK=true` during setup, open `/_operator` using verified HTTPS, and follow the README. Do not expose the backend or use a static API key as bootstrap protection. No SMTP account or hosted dependency is bundled.
