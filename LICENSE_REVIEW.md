# License review — October 6, 2026

## Current finite source-only disposition

Independent selected-artifact/source review identifies no concrete missing grant or required notice for distributing this authored recipe/configuration/external lock references. It does not approve distribution of an assembled OCI image, dependency bundle or vendor artwork. Exact upstream BSD notice and scoped authored MIT grant are retained. The selected image/source/lock and seventeen APK pins were reviewed; Python PSF and supporting GPL-3.0-or-later gdbm/readline obligations remain separate for future binary distribution. See [ARTIFACT_REVIEW.md](ARTIFACT_REVIEW.md) for provenance and corresponding-source limits, and [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for finite default-exposure observations. Historical component observations below remain evidence, not blanket clearance. Final source/runtime/live/publication qualification is separately required.


## Owner-approved recipe license

On October 2, 2026, the code owner explicitly approved MIT for newly authored recipe, wrapper, application and test code. `LICENSE` records that narrow scope. Upstream components are not relicensed: all original notices, corresponding-source/network-use obligations, enterprise exceptions and artwork/trademark terms remain applicable. This approval resolves the authored-code license hold only; it does not close the artifact or behavioral publication gates.

## Pocket ID artifact

- Product/source: [Pocket ID](https://pocket-id.org), [repository](https://github.com/pocket-id/pocket-id).
- Primary license reviewed at the **actual selected tag**: [v2.17.0 LICENSE](https://github.com/pocket-id/pocket-id/blob/v2.17.0/LICENSE), BSD-2-Clause, copyright 2024 Elias Schneider.
- Actual upstream release API reported `v2.17.0`, published `2026-10-01T19:56:25Z`: [GitHub latest release API](https://api.github.com/repos/pocket-id/pocket-id/releases/latest).
- Pulled official `ghcr.io/pocket-id/pocket-id:v2.17.0` image; OCI labels report license `BSD-2-Clause`, version `2.17.0`, source repository and revision `1abc0186fcbf0a31b51d90adb24f9b4c9cea1be6`.
- Index digest: `sha256:19f556d5852115c8ebbef271f6f7cf610d8803312a1fa63f29e1b342fe9d2939`; Linux amd64 manifest: `sha256:9e9836d31c94aa9613c1022ec63b16fa20922b32cb721890fbe0b359ce305b68`.

BSD-2-Clause permits use/modification/redistribution, including binary redistribution, subject to retaining copyright, conditions and disclaimer. The unmodified tagged notice is included in `licenses/pocket-id-BSD-2-Clause.txt` and copied into the wrapper image under `/usr/share/doc/pocket-gate/licenses`. This is not permission to remove third-party component notices or imply Pocket ID endorsement.

## Supporting components

The upstream image's tagged Dockerfile uses Alpine 3.24.1 and includes `su-exec`. This wrapper adds Alpine `python3=3.14.8-r0` and standard-library-only authored Python code. Python's own terms and included historical notices are available from the [official Python license](https://docs.python.org/3/license.html); Alpine packages/dependencies have their respective terms, not one blanket upstream BSD license.

The locally installed Railway authoring SDK `railway@3.6.0` identifies itself as MIT in its package metadata; it is a development-only dependency and is not copied into the runtime image. [Railway SDK source](https://github.com/railwayapp/railway-ts-sdk) is the source of its package terms.

No extra license for repository-authored wrapper code is invented here. Before public distribution, maintainers must confirm repository distribution terms, preserve all shipped upstream notices/SBOMs, and review transitive/image licenses and vulnerability status. This limited review is not a full dependency legal audit or security scan. No proprietary/commercial Pocket ID feature, hosted control plane, vendor account or remote entitlement is bundled.

All 17 newly added APK packages (Python, pyc and transitive libraries) are exact-version pinned in committed `apk.lock`, consumed by `RUN apk add`, with an installed-delta check rejecting resolver-added unpinned packages. Upstream repository indexes/signing infrastructure remain external availability/trust dependencies, not a claim of hermetic offline reproducibility or a fully audited dependency SBOM.
