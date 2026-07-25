# Security Policy

Stratum is an epistemic decision ledger: it stores immutable, append-only events
and derives everything else. Integrity of the record is the whole point, so the
security posture is deliberately explicit.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** — do not open a public issue
for anything exploitable.

- **Preferred:** [GitHub private vulnerability reporting](https://github.com/mazze93/stratum/security/advisories/new)
  (Security tab → *Report a vulnerability*).
- **Email:** mazze.leczzare@protonmail.com — PGP-signed reports welcome; the signing
  key fingerprint is published on the account (see *Provenance* below).

Expect an acknowledgement within a few days. There is no bug-bounty program; this
is a personal-scope project, and reports are handled on a best-effort basis.

## Supported versions

The `main` branch and the most recent tagged release receive fixes. Older tags do
not — this is a single-surface project (one deployed Worker, one CLI).

## Provenance — signed, stamped, verifiable

The record's trustworthiness rests on more than prose. Two independent layers:

1. **Commits and tags are GPG-signed.** Every authored commit and tag on `main`
   carries a cryptographic signature. Verify against the maintainer's public key,
   which is registered on the GitHub account (commits show **Verified** in the UI):

   ```sh
   git log --show-signature -1
   git verify-tag <tag>            # tags are signed too
   ```

   `main` enforces **required signed commits** via branch protection — an unsigned
   or unverifiable commit cannot land.

2. **Releases are Sigstore-stamped (keyless, transparency-logged).** Tagged
   releases are signed with [cosign](https://github.com/sigstore/cosign) using
   short-lived, OIDC-bound certificates whose signing event is recorded in the
   public [Rekor](https://docs.sigstore.dev/logs/overview/) transparency log — so
   the signature is independently verifiable and timestamped without trusting any
   long-lived private key. See `.github/workflows/release-attest.yml`.

   ```sh
   cosign verify-blob \
     --certificate <artifact>.crt --signature <artifact>.sig \
     --certificate-identity-regexp 'https://github.com/mazze93/stratum/.*' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
     <artifact>
   ```

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
