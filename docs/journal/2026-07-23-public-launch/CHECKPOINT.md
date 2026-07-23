# CHECKPOINT — public-launch session
Last updated: 2026-07-23 (Phase 0)

- [ ] 0 Bootstrap (worktree ✓, journal ✓, trace + validate pending)
- [ ] A Landing page + routing
- [ ] B Circadian engine
- [ ] C Doc issues (MEMORY_MODEL note, ADR-001/002, TRUST.md)
- [ ] D ARBITRATION.md research draft
- [ ] E render-decisions multi-trace + CI
- [ ] F Verify → PR → deploy → merge → close trace

## To resume
Worktree: `.claude/worktrees/public-launch` branch `worktree-public-launch`. Read PLAN.md → this file → DECISIONS.md; continue at first unchecked phase. Validate trace after any append: `python3 scripts/validate-trace.py data/atrium-trace.jsonl`.

## Deferred / needs user
- **wrangler auth** — deploy blocked until user runs `! npx wrangler login` or provides CLOUDFLARE_API_TOKEN (Phase F step 5). All other phases proceed.
