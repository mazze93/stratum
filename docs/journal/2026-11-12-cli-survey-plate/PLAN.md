# PLAN — CLI survey plate (2026-11-12)

## The ask (restated)

Give the `stratum` CLI a visual and interaction layer that matches the website's
geological-survey look (the landing "plate"):

- a distinct **title card** shown when you open it;
- **decisions that are easy to read**: tier, evidence state and chain at a glance, never shown by color alone;
- **help that is accessible and informative**;
- **at-a-glance workflows built for ADHD**: the next step is always shown, with
  the strongest visual emphasis, and never buried.

Already-approved follow-ups that go into the same journal:

- fast-forward the local mirror (done before the scaffold);
- a `wt-NNN` decision and verification for the CLAUDE.md refresh (PR #104);
- triage the Dependabot alerts.

## Files in scope

| Repo / path | Change |
|---|---|
| `cli/lib/survey.mjs` (new) | zero-dep render module: palette, title card, panels, next-step |
| `cli/lib/survey.d.mts` (new) | types, mirroring `ingress.d.mts` |
| `cli/bin/stratum.mjs` | bare `stratum` → title card + next step; help; tessera/status/log rendering; next-step line after every write |
| `cli/test/survey.test.ts` (new) | plain-mode snapshots, NO_COLOR / non-TTY / width behavior, next-step selection |
| `data/cli-trace.jsonl` (new) + `scripts/render-decisions.py` + `docs/DECISIONS.md` | dogfooded design decisions and foreclosures |
| `docs/journal/2026-11-12-cli-survey-plate/` | this journal |
| `docs/journal/INTENTS.md` (new in this repo) | intent row |
| `CLAUDE.md` | CLI paragraph, if the surface changes |
| PR #104 branch: `data/workspace-trace.jsonl`, `docs/DECISIONS.md` | wt entry for the CLAUDE.md refresh |
| separate branch: `package-lock.json` (+ `overrides`) | Dependabot fixes (undici ≥7.30.1, vite ≥8.3.3, dev-only) |

## Constraints

- **Zero dependencies** (CLI contract). No `ink` or `blessed`; raw ANSI only.
- The installed CLI runs from the main checkout, so nothing reaches users until a PR merges, and **a merge is a production deploy**.
- Machine paths stay untouched: `--json`, `export`, `emit` and `outbox` keep their output and exit codes byte-for-byte, and stdout stays pipe-clean.
- Accessibility:
  - `NO_COLOR` is honored, and a non-TTY gets plain text;
  - every color is paired with a glyph and a word;
  - the banner can be suppressed, and screen-reader users get no box art in plain mode;
  - output stays readable at 80 columns.
- The site palette (`landing.css`, `strata-draw.js`) is the source of truth. Truecolor when `COLORTERM` says so, otherwise a 256/16-color fallback.

## Phases

1. **Scaffold + intent.** Journal, INTENTS row, commit.
2. **Follow-ups.**
   - 2a: wt entry on PR #104.
   - 2b: Dependabot branch and PR.
3. **Design spike.**
   - Write `survey.mjs`: palette, capability detection, title card, panel primitives.
   - Render samples to `docs/journal/…/samples/` for review. **Stop for the visual verdict.**
4. **Wire it in.**
   - Bare `stratum` shows the plate + next step.
   - New help.
   - tessera/status/log use legible strata rendering.
   - Every write ends with a `→ next:` line.
5. **Tests + dogfood.**
   - `survey.test.ts`.
   - `cli-trace.jsonl` decisions/foreclosures, validated; DECISIONS.md regenerated.
6. **Ship.** Check, test, reference, all traces; then CLAUDE.md; then the PR. Merging needs mazze.

## Scope expansion (2026-11-12, mazze: "approved and accepted on all")

New asks: semver best practice and current tags; docs and site that reflect the real development; no stranded worktrees anywhere on the machine; and a real signed, verified package for outside adopters.

7. **Worktree audit** (system-wide). Report: `~/Projects/inbox/2026-11-12/wt.json`.
   - 7 hold loss risk (dirty or unpushed), 2 have broken registrations, and 4 directories in `tools/worktrees` are claimed by no repo.
   - Rescue first; remove only what is merged, clean and pushed.
8. **Truth pass on docs** (branch `release/v0.5.0`).
   - `SECURITY.md` claims GPG-signed tags and required signed commits. Neither is true: signing is SSH, `v0.4.0` is a lightweight unsigned tag, and `required_signatures` is off.
   - The README says "22 tests" (actually 129), and install is `npm link` only.
   - There is no CHANGELOG.
9. **Release pipeline.**
   - `release-attest.yml` bundles `cli/bin/stratum.mjs` without `cli/lib/ingress.mjs`, so the next tagged bundle would crash on start.
   - Add npm publish with provenance via trusted publishing (OIDC; no token) and GitHub build-provenance attestations, alongside the cosign bundle.
10. **Versioning.**
    - 41 commits since v0.4.0 (2026-09-09), including breaking changes: event schema v2, no default log. That makes this v0.5.0 under 0.x rules.
    - Single-source the version (four package.json files, the worker `/api/health`, and the landing masthead are all hardcoded). A CI check keeps them equal.
    - Tags are annotated and SSH-signed from now on.
11. **Communicate.** The landing masthead version and changelog link. A post on the spine (mazzeleczzare.com) when the package ships.

New release-related decisions go in a new `data/release-trace.jsonl` (`rl-*`) so they can't collide with the open `wt-*` numbering.
