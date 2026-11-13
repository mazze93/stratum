# Intents — stated vs. outcome

Phase 0 of `/session-journal` records the session's restated ask here,
**append-only**. At session close, fill `outcome`:

- `as-stated` — delivered what was asked, roughly as specified
- `diverged` — delivered something, but not what was originally specified
  (say what, in the last column)
- `abandoned` — stopped without delivering (rate limit, blocked, dropped)

A row left `outcome: —` is a session that ended without closing out — which is
itself the record. `~/Projects/scripts/ops/intent_divergence.py` (workspace container) reports the rate; a
standing `—` older than a few days is a `ws abandoned` candidate.

The point (mazze, 2026-08-31): "nearly every instance of my giving a direction
at the invocation of session-journal just about never turns out how I
originally specified." This file measures that instead of forgetting it.

| date | intent (restated ask) | load-bearing assumption | outcome | → what actually happened |
|------|-----------------------|-------------------------|---------|--------------------------|
| 2026-11-12 | stratum CLI survey plate: geological-survey title card matching the site, legible decisions, accessible help, ADHD-first next-step emphasis; plus wt entry for the CLAUDE.md refresh and Dependabot triage | no TUI or title card exists yet, and "TUI" can be done line-mode, not full-screen | — | |
