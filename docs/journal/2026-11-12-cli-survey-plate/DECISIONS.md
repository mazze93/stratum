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

## 2026-11-12 · Line-mode first (mazze's choice)

**Decision.** Bare `stratum` prints a framed title card, then the ledger at a glance, then one emphasized next step, and exits. There is no raw mode.

**Why:**
- scrollback stays intact;
- screen readers can follow it;
- it adds no new state machine at the CLI's single door.

**Foreclosed.** A full-screen interactive TUI. **Reopen condition:** the line-mode plate ships and the next step still needs more than one command to act on.

**How to reverse.** Add a `stratum survey` subcommand in raw mode. The render primitives in `cli/lib/survey.mjs` are shared, so nothing here gets thrown away.

## 2026-11-12 · Follow-ups shipped as PRs; merge commits only

**Decision.** Two PRs:

- #104 carries `wt-019`/`wt-020` for the CLAUDE.md refresh.
- #105 carries the dev-advisory fix (`wrangler ^4.161.0`, vite 8.3.8) with `wt-021`/`wt-022`. It is stacked on #104 so the `wt` numbering cannot collide.

Both PR bodies require a **regular merge commit**: the bindings pin branch SHAs, and squash or rebase would orphan them (a side agent flagged it; recorded in auto-memory `binding-merge-method`).

**Mistake on record.** `9c14494` (#105) says it adds `wt-022` but only regenerated DECISIONS.md. The check's stdout was mixed into the dry-run JSON, the parse failed, and the commit went out anyway. The next commit fixed it and says so. History was not rewritten.

**Found a CLI defect, now in scope for phase 4.** `stratum verify --run … --dry-run` runs the check with `stdio: inherit`, so the check's stdout lands on the same stream as the record JSON. Dry-run output can't be piped as advertised. The fix is to send the check's stdout to stderr whenever `--dry-run` is set.
