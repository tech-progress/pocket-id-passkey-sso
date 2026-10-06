# Pocket ID artifact review — October 6, 2026

This is a finite source-only evaluation of the authored recipe, configuration, package references and retained notice. It is not a complete assembled-image redistribution, SBOM, legal or security certification. No combined OCI image is published by this repository.

## Selected immutable inputs

- Pocket ID `v2.17.0`, source `1abc0186fcbf0a31b51d90adb24f9b4c9cea1be6`: [selected source](https://github.com/pocket-id/pocket-id/tree/v2.17.0), [tagged BSD-2-Clause grant](https://github.com/pocket-id/pocket-id/blob/v2.17.0/LICENSE).
- Official OCI index `sha256:19f556d5852115c8ebbef271f6f7cf610d8803312a1fa63f29e1b342fe9d2939`; amd64 manifest `sha256:9e9836d31c94aa9613c1022ec63b16fa20922b32cb721890fbe0b359ce305b68`. The Dockerfile selects this index, not a mutable latest tag. Registry metadata and selected source/lock provenance were reviewed independently; that does not attest every historical running container.
- `apk.lock` pins all seventeen added Python/runtime packages; `scripts/audit-apk-lock.py` rejects an unlocked resolver delta. Alpine repository signing/availability remain external inputs. No vendored APK or reproducible/hermetic binary-build claim follows.

## Grants and distribution boundary

Authored wrapper/test/configuration code has the scoped [MIT grant](LICENSE). The tagged Pocket ID BSD notice is retained at `licenses/pocket-id-BSD-2-Clause.txt` and copied into the wrapper image. No concrete missing permission or required notice was identified for publishing this authored source recipe and its external artifact references.

The added Python packages have PSF terms; supporting packages have independent licenses, including GPL-3.0-or-later for the exact gdbm/readline pins. Referencing these external packages in build instructions is not distribution of their compiled implementations. Future OCI/binary/dependency-bundle distribution needs an exact full component notice/obligation review, including applicable corresponding-source, license texts and source-offer arrangements. Source-only acceptance does not waive that review, relicense upstream components or imply vendor endorsement.

The finite independent review did not pull image layers, scan a new image, run containers or modify public sources. The coordinator's separately recorded current build/start/native identity/restore evidence is distinct from the primary-source permission assessment. Runtime inventory completeness, fonts/assets/trademark rights and universal native/transitive exposure are not certified here.

See [license scope](LICENSE_REVIEW.md), [security limitations](SECURITY_REVIEW.md), [supported deployment](README.md) and [publication gates](PUBLISHING.md).
