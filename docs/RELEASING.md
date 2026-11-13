# Releasing Stratum

A release is a signed tag, a cosign-signed and attested bundle on the GitHub
Release, and `@stratum-ledger/cli` on npm with provenance. Version tags (`v*`)
are protected by a ruleset, so **a tag can never be moved or deleted**. Rehearse
before you tag.

## 1. Prepare (in a PR)

- Pick the version: SemVer. While `0.x`, a breaking change bumps the **minor**
  version; mark it **Breaking** in the changelog.
- Set it in the root `package.json`. Then match `core/`, `worker/`, `cli/`
  `package.json` and the landing masthead (`atrium/public/index.html`, `mast-ver`).
- Add `## [x.y.z] — YYYY-MM-DD` to `CHANGELOG.md`.
- `node scripts/check-version.mjs` must pass (CI runs it too).
- Merge with a **merge commit** (the only method allowed; it keeps every bound
  check's pinned commit reachable).

## 2. Rehearse (from `main`, before tagging)

GitHub → Actions → **Release** → *Run workflow* on `main`. The rehearsal:

- verifies the tree (typecheck, tests, oracle, every trace, version);
- builds the bundle exactly as a release would;
- runs the CLI from inside the bundle;
- runs `npm publish --dry-run`.

It signs nothing and publishes nothing. Tag only after it is green.

## 3. Tag (signed, annotated)

```sh
git -C ~/Projects/cognitive/stratum pull --ff-only
git -C ~/Projects/cognitive/stratum tag -s vX.Y.Z -m "vX.Y.Z"
git -C ~/Projects/cognitive/stratum tag -v vX.Y.Z
git -C ~/Projects/cognitive/stratum push origin vX.Y.Z
```

## 4. Approve the publish

The tag push runs `verify → attest → publish`. The `publish` job waits in the
`npm-publish` environment until the maintainer approves it. That environment
holds the only npm credential and accepts only `v*` tags.

## 5. Verify what shipped

```sh
npm view @stratum-ledger/cli@X.Y.Z dist.attestations
npm install -g @stratum-ledger/cli@X.Y.Z && npm audit signatures
gh release download vX.Y.Z --repo mazze93/stratum
sha256sum -c stratum-vX.Y.Z.tar.gz.sha256
gh attestation verify stratum-vX.Y.Z.tar.gz --repo mazze93/stratum
```

The `cosign verify-blob` command is in [SECURITY.md](../SECURITY.md).

## If a tagged run fails

- **Credential or transient failure** (npm 401/403/EOTP, network): fix the
  credential, then **Re-run failed jobs** on the same run. It reuses the same
  tag and commit, so the tag lock does not matter.
- **Code or content failure** (the tree is wrong): fix it in a PR and release
  the next **patch** version. Never move the tag. If the broken version already
  reached npm, `npm deprecate` it; npm never reuses a version number.
- **Last resort (needs the maintainer):** set the `v* tags` ruleset's
  enforcement to *disabled*, fix the tag, and re-enable it. Record why in the
  workspace trace.

## One-time: move npm to Trusted Publishing

The first publish (v0.5.0) bootstraps with the `NPM_TOKEN` environment secret,
because npm can configure trust only on a package that already exists. Afterwards:

```sh
npm trust github @stratum-ledger/cli --file release.yml --repo mazze93/stratum --env npm-publish --allow-publish
```

Then revoke the token on npmjs.com, delete the secret
(`gh secret delete NPM_TOKEN --env npm-publish --repo mazze93/stratum`), and
delete the `NODE_AUTH_TOKEN` env block from `release.yml`. Trusted Publishing is
bound to the workflow **filename**, so renaming `release.yml` breaks publishing.

## Homebrew

`brew install mazze93/tap/stratum` installs from the tap repo
`mazze93/homebrew-tap`. After each npm publish, update the formula's `url` and
`sha256` to the new npm tarball:

```sh
npm view @stratum-ledger/cli@X.Y.Z dist.tarball
curl -sL "$(npm view @stratum-ledger/cli@X.Y.Z dist.tarball)" | shasum -a 256
```
