Prepares **v0.5.0**: the first release distributed as a package (`@stratum-ledger/cli` on npm, with provenance), plus a signed, attested release bundle.

> **Merge with a regular merge commit only.** Merging is a production deploy (Workers Builds). The new health `version` field reports 0.5.0 once deployed.

## What changes
- **Package**: `cli/package.json` → `@stratum-ledger/cli` 0.5.0 (bin `stratum`, files `bin/ lib/ README.md LICENSE`, node ≥20, `publishConfig.provenance`). `stratum --version`.
- **One version everywhere**: `scripts/check-version.mjs` (root, core, worker, cli, landing masthead, CHANGELOG, and the tag on tag pushes), run in CI before `npm ci`.
- **Release pipeline**: `release-attest.yml` → `release.yml`.
  - `verify` runs on every trigger.
  - `rehearse` (workflow_dispatch only): bundle, run the CLI from the bundle, `npm publish --dry-run`.
  - `attest` (tags): sha256, cosign keyless, build-provenance attestation, GitHub Release.
  - `publish` (tags, `npm-publish` environment, maintainer approval, v* only).
- **Fix**: the release bundle now ships `cli/lib/` and `cli/package.json`. Without them, the bundled CLI could not start.
- **Docs**:
  - `CHANGELOG.md` (new);
  - `docs/RELEASING.md` (new);
  - `cli/README.md` (new);
  - `SECURITY.md` provenance corrected (signed commits are *not yet required*; v0.4.0 tag is unsigned; SHA-1 limits stated);
  - README and landing install lines;
  - CLAUDE.md.
- **Ledger**: `data/release-trace.jsonl` (rl-001…rl-005), added to `render-decisions.py`; DECISIONS.md regenerated.

## Evidence
- `check-version` ✓; typecheck ✓; 129/129 tests; reference suites ✓; every trace validates; DECISIONS.md in sync. These were re-run after merging main (#105).
- `npm publish --workspace cli --dry-run` → `+ @stratum-ledger/cli@0.5.0`. The packed tarball, installed into an isolated prefix, reports 0.5.0.
- actionlint 1.7.12 is clean on every workflow.
- Rehearsal evidence from a workflow run on a branch: the first run failed (missing `cli/package.json` in the bundle), which was fixed; the second run was green.

## After merge (maintainer)
1. Actions → **Release** → Run workflow on `main` (rehearsal). Tag only if it is green.
2. `git tag -s v0.5.0 -m v0.5.0 && git tag -v v0.5.0 && git push origin v0.5.0`. The tag is locked by ruleset and can never move.
3. Approve the `npm-publish` deployment.
4. `npm trust github @stratum-ledger/cli --file release.yml --repo mazze93/stratum --env npm-publish --allow-publish`, then revoke the token and delete the `NPM_TOKEN` secret. A follow-up PR removes the `NODE_AUTH_TOKEN` block.
5. Homebrew tap formula with the published tarball's sha256.

Directed and owned by Mazze LeCzzare Frazer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018xHHJT38QWDHdM4Vwow2fx
