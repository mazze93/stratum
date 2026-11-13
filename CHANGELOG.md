# Changelog

All notable changes to Stratum. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is
`0.x`, a **minor** bump may break things, and breaking changes are marked
**Breaking**.

The decision record behind each change lives in the traces (`data/*-trace.jsonl`),
projected to [docs/DECISIONS.md](docs/DECISIONS.md). Ids in brackets point there.

## [0.5.0] — 2026-11-13

The first release distributed as a package: `@stratum-ledger/cli` on npm, with
provenance, plus a signed, attested release bundle.

### Breaking

- **CLI: there is no default log.** Every command that touches a log needs
  `--log`, `STRATUM_LOG`, or a configured log, and refuses otherwise. A silent
  fallback is how decisions landed in the wrong log. [tp-031, tp-032]
- **Evidence is bound (event schema v2).** `stratum verify --run` runs the check
  and binds its exit code (and optional input and output digests) to the pinned
  commit. A typed `checked_at` timestamp is no longer evidence of a check.
  `--ref` still writes legacy v1 evidence, labelled *unbound*. [ADR-003, tp-*]

### Added

- `@stratum-ledger/cli` on npm, published from CI with provenance; `stratum --version`.
- `stratum emit` and `stratum outbox`: one ingress door for automated writers
  (hooks, plugins, scripts). Checks run locally, ids are deterministic, and
  ratification needs a human at a terminal. Wire contract: [docs/API.md](docs/API.md).
- Trust primitives (ADR-003):
  - RFC 8785 canonical bytes and SHA-256 in both implementations;
  - hash-chained storage with a head digest;
  - atomic Durable Object persistence.
- `scripts/recheck-bindings.py` and a scheduled workflow that re-run every
  recorded check at its pinned commit.
- Atrium: a private-ledger overview page (`/home/`).
- Release pipeline (`.github/workflows/release.yml`):
  - version gate;
  - cosign keyless signature and GitHub build-provenance attestation over the bundle;
  - npm publish from an approval-gated environment;
  - a no-publish rehearsal mode.
- `scripts/check-version.mjs`: one version everywhere it is stated, checked in CI.

### Fixed

- The release bundle now includes `cli/lib/` and `cli/package.json`. Without them,
  the CLI shipped in a bundle could not start.
- Outbox locking can no longer lose a queued record or remove another process's lock.
- A caller-supplied `--repo` can no longer carry credentials into a binding.
- Worker: load errors are legible and fail closed. [tp-021]

### Security

- Cleared 11 dev-scope Dependabot advisories (undici, vite) by moving to
  wrangler ^4.161.0 and vite 8.3.8. [wt-021, wt-022]
- `sharp` overridden to ^0.35.5 (librsvg advisory).
- `SECURITY.md` corrected: commits are SSH-signed, and signed commits are not
  yet *required*. Tags are signed from v0.5.0; v0.4.0 is not. It also states the
  SHA-1 limitation and how to verify each layer.

## [0.4.0] — 2026-09-09

Public launch: the survey-plate landing page, the decision-audit panel, and the
live Atrium, with the Event Epistemic Contract (rev 3) behind a live gate.
Released as a cosign-signed bundle. The `v0.4.0` tag is lightweight and unsigned.

[0.5.0]: https://github.com/mazze93/stratum/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/mazze93/stratum/releases/tag/v0.4.0
