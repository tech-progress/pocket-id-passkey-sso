# Changelog

## 1.0.1 — 2026-10-06 (staged; qualification PENDING)

- Stage recipe 1.0.1 for sequential qualification and publication; no new public commit, tag, push or cloud operation is claimed by this docs change.
- Correct source history: the authorized public standalone [recipe source](https://github.com/tech-progress/pocket-id-passkey-sso) has historical annotated tag `v1.0.0` at source commit `25c83b6205babb3dc60fc4184751f9b7acaa36db`. It is not the newly qualified 1.0.1 release.
- Keep [Pocket ID](https://pocket-id.org) [upstream source](https://github.com/pocket-id/pocket-id) at 2.17.0 with the same exact image/APK pins, one service and one 1000 MB volume, manual operator setup, locked default and no HA claim.
- Keep future 1.0.1 public source, exact queried Deploy V2, live secret preservation and publicly trusted Railway HTTPS owner/non-admin/OIDC/recovery/soak qualification PENDING.
- Record accepted October 6 finite source-only/default-boundary review: no concrete missing grant/notice or demonstrated default request-reachable unpatched advisory requiring a source-only hold identified; no complete image/SBOM/transitive or legal certification.
- Serialize activation-marker writes and operator locking; flush and fsync marker contents, atomically replace the mode-0600 marker and fsync its parent directory after activation or removal.
- Add protocol-client negative tests for absent/wrong/reused callback state, callback path/origin mismatch, forged signature and incorrect issuer/audience/nonce/expiry. Their verification remains separate from browser qualification.
- Extend native browser qualification to a one-use invited member, valid non-admin mutation `403` checks and ignored self-promotion, signed owner/member OIDC, enrolled restart, and complete hash-checked restore into a distinct independently empty volume with the same issuer/key.
- Extend operator-locked loss-of-both-authenticators recovery through actual upstream `one-time-access-token` for the existing owner: two replacements, lost-key revocation, consumed-link native `401` with no new session, and replacement login/unchanged OIDC subject. The recorded current October 6 localhost run passed all five phases and owned-resource cleanup exit 0; virtual authenticators and self-signed TLS do not establish live Railway qualification.
- Clarify source-only recipe/instructions distribution, required license grants/notices, public default exposure and accepted zero-compute/scoped-deletion/retention limits.
- Add bounded Node assert docs checks and negative mutation tests; these check documentation, not runtime qualification.

## 1.0.0 — 2026-10-02

- Initial single-replica Pocket ID 2.17.0 recipe; historical standalone `v1.0.0` source is public, while final live qualification remains incomplete.
- Digest-pinned upstream, loopback-only backend, fail-closed operator gate and persistent SQLite.
- Exact-version lock for all 17 added runtime APKs with build-time dependency-delta enforcement.
- Cryptographic direct-IaC secrets with native preservation metadata; deterministic SDK helper prohibited.
- Local build, security, restart and cold-backup/restore harness; historical source publication does not complete real HTTPS/passkey/OIDC qualification.
- Native browser WebAuthn/PKCE/enrolled-volume recovery test behind isolated localhost TLS; virtual authenticators do not establish physical custody or public Railway TLS.
- Keep same-origin referrers for origin-checked operator forms while withholding cross-origin referrers.
