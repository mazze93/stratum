# Public-launch session — 2026-07-23

Full plan: `/Users/daedalus/.claude/plans/this-is-going-to-majestic-goblet.md` (approved, touchstone-verified).

## Phases
- **0 Bootstrap** — worktree `worktree-public-launch`, journal scaffold, `data/atrium-trace.jsonl` (trust root at-000 + session decisions), validate.
- **A Landing** — move Atrium to `/atrium/`, new survey-poster landing at `/` (static SVG genesis cross-section + live enhance), README link updates.
- **B Circadian** — theme.js "auto" mode: time-keyed light→dark for Atrium, override persists; landing pinned dark.
- **C Doc issues** — MEMORY_MODEL stale collision note; ADR-002 deny-wins; ADR-001 → Accepted (item 4 deferred); docs/TRUST.md skeleton.
- **D Research** — docs/ARBITRATION.md (precedent decay).
- **E Render+CI** — render-decisions.py multi-trace; CI validates all traces.
- **F Verify→ship** — full test suite; wrangler dev + Chrome DevTools walkthrough; verification events into trace; push, PR, CI green; deploy (needs wrangler auth — see CHECKPOINT deferred); merge; production check; close trace.

## Constraints
- MAX posture: no secrets, deploy only after live verification (user approved for this session).
- Dogfooding is live: decisions enter the trace when made (pending_evidence); verifications appended with checked evidence when landed.
- docs/DECISIONS.md is generated — never hand-edit.
- Golden file untouched unless render changes are deliberate + recorded.
