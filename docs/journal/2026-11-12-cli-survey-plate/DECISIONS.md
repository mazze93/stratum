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

## 2026-11-12 · GitHub settings hardening (mazze approved all four groups)

**Decision.** Apply the following:

- merge commits only, with title and body taken from the PR;
- protection enforced for admins;
- head branches deleted after merge;
- a `v*` tag ruleset;
- wiki and Projects off;
- secret-scanning validity checks and non-provider patterns on.

Signed-commit enforcement is **staged**, not applied: 8 of the last 40 `main` commits are unverified (older; 4 of them Dependabot).

**Why.**
- Bindings pin branch SHAs, so squash or rebase merges orphan them.
- An admin push to `main` is a production deploy that skips CI.
- Version tags trigger cosign signing.

**Pre-change state (for rollback):**
- `allow_merge_commit`, `allow_squash_merge` and `allow_rebase_merge` were all `true`.
- `merge_commit_title=MERGE_MESSAGE`, `merge_commit_message=PR_TITLE`.
- `delete_branch_on_merge=false`.
- `has_wiki=true` (no wiki repo had ever been created) and `has_projects=true` (v2 projects could not be listed; the token lacks `read:project`).
- Secret-scanning validity checks and non-provider patterns were `disabled`.
- `enforce_admins=false`. No rulesets existed.

**How to reverse.**
- `gh api -X PATCH repos/mazze93/stratum` with the values above.
- `gh api -X DELETE repos/mazze93/stratum/branches/main/protection/enforce_admins`.
- Delete the `v* tags` ruleset by its id.

**Applied and read back from the API (2026-11-12):**

- ✓ Merge commits only. Squash and rebase are off.
- ✓ Merge commit title is the PR title and the message is the PR body.
- ✓ Head branches are deleted on merge.
- ✓ Wiki and Projects are off.
- ✓ `enforce_admins=true`.
- ✓ Ruleset `v* tags` (id 27174967) blocks deletion, update and non-fast-forward on `refs/tags/v*`. There are no bypass actors. Creating a tag is still allowed.
- × Secret-scanning validity checks and non-provider patterns: the API accepts the PATCH but leaves both `disabled`. These are almost certainly paid Secret Protection features this personal account lacks. Not retried; not applicable.

**Side effect to expect.** With auto-delete on, merging #104 deletes `docs/claude-md-refresh`, and GitHub then retargets the stacked #105 to `main`, which is what starts its CI.

**Note.** A mistaken `v*` tag can no longer be moved or deleted, even by an admin. To fix one, set the ruleset's enforcement to `disabled`, fix the tag, then re-enable it.
