# CHECKPOINT — CLI survey plate

Last updated: 2026-11-12 (phase 3 spike pushed; worktree sweep done; next: release/v0.5.0)

- [x] 0. Pre-flight. Mirror fast-forwarded to 3553a6c; assumption checked (DECISIONS.md)
- [x] 1. Scaffold + intent committed and pushed
- [x] 2a. wt entry for the CLAUDE.md refresh on PR #104
- [x] 2b. Dependabot: undici + vite (dev-only) PR
- [~] 3. Design spike: `cli/lib/survey.mjs` + samples pushed (7feb581). **Awaiting visual verdict from mazze**
- [ ] 4. Wire into `stratum.mjs`
- [ ] 5. Tests + `data/cli-trace.jsonl`
- [ ] 6. Verify all gates, then CLAUDE.md, then PR (ships as v0.6.0)
- [x] 7. Worktree sweep (DECISIONS: "Worktree sweep: results")
- [ ] 8–10. `release/v0.5.0`: docs truth pass, single-source version, CHANGELOG, release pipeline (npm `@stratum-ledger/cli`, provenance, cosign, signed tag)
- [ ] 11. Communicate: landing version and changelog; spine post

## To resume

1. Worktree: `~/Projects/tools/worktrees/stratum-cli-survey-plate`, branch `cli/survey-plate`.
2. Read this file, then PLAN.md, then DECISIONS.md.
3. Continue at the first unchecked box.

## Deferred / needs mazze

- ~~Go-ahead~~ given 2026-11-12: line-mode first.
- Visual verdict at phase 3.
- Merging any PR is a production deploy. **#104, then #105: the auto-mode classifier blocked Claude's merge, so mazze merges them.**
- npm: create org `stratum-ledger`, then add a Trusted Publisher (repo `mazze93/stratum`, workflow `release.yml`).
- stele bundle in the inbox: decide where it lives (offsite-backup?).
- palimpsest main: fast-forward to origin (identical tree) once the staged AGENTS.md is resolved.
