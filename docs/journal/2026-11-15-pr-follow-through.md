# PR follow-through — 2026-11-15

Scope: Stratum #108–111 and the spec dependency blog #225. Mazze authorized completing the outstanding work and merging to deploy.

## Verified before this patch
- All four original Stratum heads passed CI and CodeQL. No inline review threads were open.
- Several Bugbot attempts hit usage limits; those attempts provide no review evidence.
- Blog #225's spec sha256 matches ig-006: 48a96097f30a856e055341dbd4e6d387e62f72d0c62f275e7582c6d766865187.
- #108 gained a regression check for a fully truncated log; the original early empty-log return skipped its witness.
- #111 and #108 merged; blog #225 merged with the repository-required squash method.

## Evidence limits and failures
- Shell Git fetch could not resolve github.com. GitKraken fetch worked.
- Local typecheck and Vitest could not run in the prescribed worktree: dependencies absent; installation refused by filesystem permissions. Python contract suites passed. CI is the executable validation gate for this patch.
- GitHub refused a stale-check merge and auto-merge is disabled. Branches are updated and required checks must pass; protection is not weakened.
- A terminal prompt prevents accidental noninteractive ratification, not a synthetic PTY. A bearer holder can still submit v1 authority events directly. R4 remains necessary.
- New tp-039 is pending evidence until checks pass at a pinned commit.

## Remaining operations
- R2: provision a scoped Checkmate Access service token on Stratum; observe a real anchored tick and check the hub digest before marking R2 complete.
- npm: do not retry v0.5.0. Prepare a corrected version and a working publishing identity; verify actual registry availability and executable before claiming distribution.
- Homebrew: do not advertise until an unauthenticated installation succeeds.
- Authority: R4, narrower automated-write credentials, contract-per-row migration and the broader architecture decisions remain explicit future work.

## Validation at 78554798498cb37f0b896967b6c22e22f0cac4fa
- CI run 43755988980 passed typecheck, tests, renderer checks, publish dry-run, reference suites, every trace and DECISIONS sync.
- CodeQL run 43755988974 and binding re-check run 43755989087 passed.
- Original PRs #108, #109, #110 and #111 are merged. Blog #225 is merged.
- tp-040 binds the maintenance checks; tp-041 binds R2 implementation tests and does not claim operational provisioning.
- Cloudflare browser connection timed out twice; no service token was created and no credentials were changed.
