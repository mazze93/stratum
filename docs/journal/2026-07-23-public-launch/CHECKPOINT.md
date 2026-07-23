# CHECKPOINT — public-launch session
Last updated: 2026-07-23 (Phases 0–E complete; paused for human preview before deploy)

- [x] 0 Bootstrap — worktree, journal, `data/atrium-trace.jsonl` · `71760b7`
- [x] A Landing page + routing · `2615ebb`
- [x] — CLAUDE.md (out-of-plan, /init) · `6356fef`
- [x] — journal checkpoint · `1e34d76`
- [x] C Doc issues — MEMORY_MODEL note, ADR-002 deny-wins, ADR-001 Accepted, TRUST.md · `a2a062f`
- [x] B Circadian surfaced + Plate ground (done after C; scope set by human) · `88187e4`
- [x] D ARBITRATION.md research draft · `607a716`
- [x] E render-decisions multi-trace + 2 new CI gates · `97defdb`
- [x] — Release 0.4.0 · `cd15a76`
- [ ] F Verify → PR → **merge** → **deploy from main** → close trace

## Current state
Local verification is **green**: typecheck, 26/26 vitest, 16/16 Python oracle, all
three traces load clean, `DECISIONS.md` in sync, lockfile regenerated, `/api/health`
reports 0.4.0.

**PAUSED** — dev server running on :8788, awaiting human walkthrough of `/` and
`/atrium/` before anything outward-facing happens. Nothing is deployed or merged yet.

## Decisions taken for Phase F (human, 2026-07-23)
- Human previews locally before deploy.
- **Merge to main first, then deploy from main** — production should correspond to a
  commit on main, and the trace's verification evidence should cite a main SHA.
- **Merge commit**, not squash — the phase commits are part of the record.
- Version bumped to 0.4.0.

## To resume
Worktree `.claude/worktrees/public-launch`, branch `worktree-public-launch`.
Restart dev server: `cd worker && npx wrangler dev --port 8788` (needs `npm ci` in the
worktree first — it has its own node_modules).

Remaining F steps, in order:
1. Apply any preview feedback.
2. Push branch, open PR, confirm CI green (two new gates run for the first time on CI).
3. Merge to main (merge commit).
4. `npm run deploy` from main.
5. Verify production `/`, `/atrium/`, `/atrium` redirect, `/api/health` in browser.
6. Append verification events to `data/atrium-trace.jsonl` closing at-001..at-011 with
   **checked** evidence (test exits, main SHA, production URL checks); regenerate
   DECISIONS.md; commit. Until this step the ledger honestly shows the session's work
   as claimed, not proven.

## Deferred / needs user
- *(none — the earlier wrangler-auth blocker was a false reading; the repo's pinned
  wrangler 4.110.0 is authenticated. Deploy is unblocked.)*
