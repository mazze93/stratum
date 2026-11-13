# Security Policy

Stratum is an epistemic decision ledger: it stores immutable, append-only events
and derives everything else. Integrity of the record is the whole point, so the
security posture is deliberately explicit.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** — do not open a public issue
for anything exploitable.

- **Preferred:** [GitHub private vulnerability reporting](https://github.com/mazze93/stratum/security/advisories/new)
  (Security tab → *Report a vulnerability*).
- **Email:** mazze.leczzare@protonmail.com — PGP-signed reports welcome; the
  maintainer's public GPG keys are published at <https://github.com/mazze93.gpg>.

Expect an acknowledgement within a few days. There is no bug-bounty program; this
is a personal-scope project, and reports are handled on a best-effort basis.

## Supported versions

The `main` branch and the most recent tagged release receive fixes. Older tags do
not — this is a single-surface project (one deployed Worker, one CLI).

## Provenance — signed, stamped, verifiable

The record's trustworthiness rests on more than prose. Each layer below states
what is true today and how to check it yourself.

1. **Commits are SSH-signed.** The maintainer signs commits with an SSH signing
   key registered on the GitHub account, so authored commits show **Verified**
   in the GitHub UI. To check locally, list the registered signing keys at
   `https://api.github.com/users/mazze93/ssh_signing_keys`, add them to an
   `allowed_signers` file, and run:

   ```sh
   git -c gpg.ssh.allowedSignersFile=allowed_signers log --show-signature -1
   ```

   **Not yet enforced.** `main` does not yet require signed commits in branch
   protection. Some older history, including Dependabot commits from before
   2026-10, is unverified, and the requirement is staged until new Dependabot
   commits arrive verified. Until then, an unsigned commit *can* land through a
   reviewed PR.

2. **Tags are signed from v0.5.0.** Release tags from `v0.5.0` on are
   annotated and SSH-signed, and verify with `git tag -v <tag>` against the same
   `allowed_signers` file. **`v0.4.0` is a lightweight, unsigned tag.** It is
   left as published, because a version tag is never moved. A tag ruleset blocks
   deleting or rewriting any `v*` tag.

3. **Release artifacts are Sigstore-stamped (keyless, transparency-logged).**
   Each tagged release bundles the CLI (`cli/bin/`, `cli/lib/`), the immutable
   traces, and the golden projection. It is signed with
   [cosign](https://github.com/sigstore/cosign) using a short-lived,
   OIDC-bound certificate, and the signing event is recorded in the public
   [Rekor](https://docs.sigstore.dev/logs/overview/) transparency log. A SHA-256
   checksum and a GitHub build-provenance attestation accompany it. See
   `.github/workflows/release.yml`.

   ```sh
   sha256sum -c stratum-<tag>.tar.gz.sha256
   cosign verify-blob \
     --bundle stratum-<tag>.tar.gz.sigstore.json \
     --certificate-identity-regexp 'https://github.com/mazze93/stratum/.*' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
     stratum-<tag>.tar.gz
   gh attestation verify stratum-<tag>.tar.gz --repo mazze93/stratum
   ```

4. **The npm package carries provenance.** `@stratum-ledger/cli` is published
   only from the release workflow, inside a GitHub environment that needs the
   maintainer's approval and accepts only `v*` tags. It is published with npm
   provenance, a Sigstore-signed statement that links the package to this
   repository, the exact commit, and the workflow run. Check it after installing:

   ```sh
   npm audit signatures
   ```

   The first publish bootstraps with a short-lived token held only in that
   environment. After it, publishing moves to npm Trusted Publishing (OIDC) and
   the token is revoked.

**SHA-1, stated plainly.** Git identifies commits and tags by SHA-1, and GitHub
does not host SHA-256 repositories, so commit and tag signatures sign SHA-1 ids.
Git's collision-detecting SHA-1 makes known attacks detectable, but it is not a
modern integrity guarantee on its own. That is why every release artifact also
carries a SHA-256 checksum and a Sigstore signature over the artifact bytes, and
why Stratum's own evidence bindings and storage chain use SHA-256 throughout.

## Automated scanning

- **CodeQL** static analysis (`security-extended`) on every push and PR to `main`,
  plus a weekly scheduled baseline — `actions`, `javascript-typescript`, `python`.
- **Secret scanning** with **push protection** — a committed secret is blocked at
  push time.
- **Dependabot** — security advisories *and* weekly version updates, including the
  GitHub Actions the workflows pin.
- **SHA-pinned Actions** — every third-party action is pinned to a full commit SHA
  (not a mutable tag), and Dependabot keeps the pins current.

## Scope note

Wall-clock `timestamp` fields inside events are **metadata, not evidence** — the
projection ignores them (see `docs/MEMORY_MODEL.md`). Trust in *when* something
happened comes from the signing/transparency layer above, never from a
self-asserted field in the log.
