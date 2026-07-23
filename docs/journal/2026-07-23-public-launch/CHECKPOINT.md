# CHECKPOINT — public-launch session
Last updated: 2026-07-23 (Phase A complete, Phase B in progress)

- [x] 0 Bootstrap — worktree, journal, `data/atrium-trace.jsonl` (at-000..at-004), validates clean · `71760b7`
- [x] A Landing page + routing · `2615ebb`
  - Atrium moved to `atrium/public/atrium/index.html`; new plate at `/`
  - `strata-draw.js` (shared drawing module) + `scripts/render-strata-svg.mjs` (bakes figure between markers)
  - `landing.css`, `landing.js`, `favicon.svg`; README demo links → `/atrium/`
  - Browser-verified on `wrangler dev :8788`: `/` 200, `/atrium/` 200, `/atrium` 307, `/api/health` ok, console clean on both pages
- [x] — CLAUDE.md added (out-of-plan, user-requested via /init) · `6356fef`
- [ ] B Circadian engine — **IN PROGRESS**, nothing written yet
- [ ] C Doc issues (MEMORY_MODEL stale note, ADR-002 deny-wins, ADR-001 → Accepted, docs/TRUST.md)
- [ ] D docs/ARBITRATION.md research draft
- [ ] E render-decisions.py multi-trace + CI validates all traces
- [ ] F Verify → PR → deploy → merge → close trace

## To resume
Worktree `.claude/worktrees/public-launch`, branch `worktree-public-launch`. Read PLAN.md → this file → DECISIONS.md; continue at Phase B.

Dev server: `cd worker && npx wrangler dev --port 8788` (deps installed via `npm ci` in the worktree — required, the worktree has its own node_modules).

**Phase B state:** `atrium/public/theme.js` already implements the circadian mechanism — `circadianTone(date)` maps hour → 0–100 tone, `applyTokens` interpolates day↔night per theme, `s.toneAuto` defaults **true**, and a 5-min timer re-renders. What remains is the *user-facing* part: the settings UI exposes tone/auto but there is no "auto" affordance in the theme radio group (`atrium/public/atrium/index.html:190-193`), and defaults pick nocturne/vellum off `prefers-color-scheme` once rather than tracking it. Decide whether B is (a) mostly-done → document + small UX polish, or (b) a real light→dark *theme* progression across the cycle, not just tone. Record whichever as an event before implementing.

After any trace append: `python3 scripts/validate-trace.py data/atrium-trace.jsonl`.

## Deferred / needs user
- **wrangler auth** — deploy blocked until `! npx wrangler login` or `CLOUDFLARE_API_TOKEN` is provided (Phase F step 5). Everything else proceeds without it.
