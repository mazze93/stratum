# Session decisions — append-only

> Authoritative record: `data/atrium-trace.jsonl` (this file is narrative gloss; the trace wins).

- 2026-07-23 · Journal lives in-repo on the branch, not the workspace container · session is a background job in an isolated worktree; container journal risks parallel-job conflicts; decision telemetry in-repo matches project ethos · reverse: move dir to ~/Projects/docs/journal/.
- 2026-07-23 · Landing at `/`, Atrium moves to `/atrium/` (at-001) · one-file move, all refs root-absolute (touchstone-verified) · reverse: git mv back.
- 2026-07-23 · Hero = static SVG + live enhance (at-002) · user choice · reverse: drop landing.js.
- 2026-07-23 · Atrium gets circadian auto theme, override wins (at-003) · user mandate · reverse: default back to vellum.
- 2026-07-23 · Landing pinned dark, does NOT follow circadian (at-004, foreclosure) · my call within user's delegation — poster impact beats cohesion · reverse: wire landing to theme.js.
- 2026-07-23 · Figure baked into HTML between markers by a script, sharing `strata-draw.js` with the browser · one drawing implementation, no build step, static plate is real data and loads instantly · reverse: inline the SVG by hand, or go live-only.
- 2026-07-23 · `landing.js` refuses to replace the baked plate with an empty live projection · first dev-server load drew a blank figure at epoch −1 (empty local DO) — a "live" blank is not an upgrade over real static data · reverse: drop the `n === 0` guard in landing.js.
- 2026-07-23 · Lens pinch-out moved into layer stacking, not draw-time · draw-time pinching left a black void where the next layer should have deposited over it · reverse: see strata-draw.js history at 2615ebb.
- 2026-07-23 · Per-layer deterministic tint (`:tint` seed) · 9 consecutive NARRATIVE beds read as one flat slab; real columns alternate · reverse: remove the brightness filter in strata-draw.js.
- 2026-07-23 · CLAUDE.md written now, out of plan (user ran /init) · not in the phase list; recorded so the extra commit isn't a mystery later · reverse: delete the file.
- 2026-07-23 · CLAUDE.md documents ADR numbering as *resolved* (new ADRs start at ADR-003) · MEMORY_MODEL's header still says "renumber before these enter the record", but genesis `sb-009` resolved it — propagating the stale note into fresh guidance would have entrenched it · note: Phase C must fix the MEMORY_MODEL header to match.
