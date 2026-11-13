# DECISIONS — CLI survey plate

Append-only. `date · decision · why · how to reverse`.

## 2026-11-12 · Pre-flight: does a TUI or title card already exist?

**Load-bearing assumption.** There is no existing TUI, banner or next-step surface, so this is new work and not a rework of something already built.

**Checked against disk (`main` @ 3553a6c):**

- `cli/bin/stratum.mjs` (487 lines) is a plain dispatcher. Bare `stratum` prints `HELP`, a flat string with bold section labels.
- Color support is a 16-color ANSI wrapper. It honors `NO_COLOR` and stdout `isTTY`.
- Tier colors (gold, green, blue, dim) are **not** the site palette (`#8C3B2E`, `#2E5D4B`, `#B08A2E`, `#3E5A72`, `#8E4A6B`).
- There is no banner, no next-step logic, no width handling and no interactive mode.
- `cli/lib/` contains only `ingress.mjs`, so there is no render module to reuse.
- The site's design language lives in `atrium/public/landing.css` (tokens) and `atrium/public/strata-draw.js` (tier palette + labels). The title plate reads "STRATUM / EPISTEMIC DECISION LEDGER" inside a framed sheet with registration marks.
- **Result:** the assumption holds; nothing to dedupe against.

**Second assumption, flagged as a design question rather than verified.** "TUI" could mean a full-screen interactive app (raw mode, keybindings) or an enhanced line-mode CLI (title card + panels on bare `stratum`).

- Recommendation: line-mode first. Full-screen raw mode fights screen readers, breaks scrollback, and adds a state machine to a zero-dependency single door.
- An interactive picker can come later as a separate phase.
- Waiting for mazze's go-ahead.
