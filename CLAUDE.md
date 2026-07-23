# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run check              # typecheck every workspace (tsc --noEmit)
npm test                   # vitest: core/test, worker/test, cli/test
npm run test:reference     # Python oracle's own 16 invariant tests
npm run validate:trace     # load + project data/genesis-trace.jsonl through the oracle
npm run dev                # wrangler dev (worker + static assets, local)
npm run deploy             # wrangler deploy — outward-facing; never without explicit approval

npx vitest run core/test/invariants.test.ts              # one test file
npx vitest run -t "port boundary"                        # one describe/test by name
python3 scripts/validate-trace.py data/stele-trace.jsonl  # validate any trace
python3 scripts/validate-trace.py data/genesis-trace.jsonl --json  # projection JSON (golden-file format)
```

CI (`.github/workflows/ci.yml`, Node 24) runs check → test → test:reference → validate:trace.

## What this is

An **epistemic decision ledger**. The thesis: agentic systems conflate *generation* with *authority* — whatever an LLM writes down becomes "true" by persistence. Stratum stores only immutable append-only events and **derives** everything else.

Two rules govern nearly every design question here:

1. **Evidence and claim never merge.** `evidence[]` is checkable (file hash, test exit, diff SHA, signed approval, policy-authority signature); `claim` is prose and is never authoritative. `evidence.checked_at == null` means *cited, not checked* — and only checked evidence counts, everywhere, including quorum.
2. **Status is a fold over the log, never a stored field.** `status_at(event, epoch)` folds transition markers (verification, supersession, contradiction, ratification, rejection, dispute, trust_root_revoked) ordered by logical `seq`. Wall-clock `timestamp` is metadata and is ignored by every projection path. Projection is a pure function of the log at an epoch.

Authority tiers: `authoritative_verified` (evidence checked) · `authoritative_axiomatic` (authority-declared — trust roots, ratifications, which carry no evidence by nature) · `authoritative_provisional` (pending/under review) · `narrative` (prose gloss). Keeping axiomatic distinct from verified was a real defect fix — do not collapse them.

`docs/MEMORY_MODEL.md` is the normative contract (rev 3). Read it before changing anything in `core/` or `reference/`.

## Architecture

Dual implementation, one semantics:

- **`reference/tessera_projection.py`** — the Python oracle. Executable spec. 16 invariants in `test_tessera_projection.py`.
- **`core/`** (`@stratum/core`, TypeScript) — the runtime source of truth for Worker and CLI. `contract.ts` (event types + guards), `log.ts` (EpisodicLog), `projection.ts` (Tessera projection, authority, revision chains), `serialize.ts` (wire records).
- **`core/test/cross-validation.test.ts`** — the two implementations must project the genesis trace **byte-identically** to `data/genesis-projection.golden.json`. This test is simultaneously the port check and the empirical ontology validation MEMORY_MODEL §8 names as the open risk. If you change projection semantics, regenerate the golden file deliberately (`npm run validate:trace -- --json > data/genesis-projection.golden.json`) and say why.

Deployment surface:

- **`worker/`** — Hono adapter (`index.ts`) that stays thin; the Durable Objects own correctness. `StratumLogDO` (one per log) is the single-writer gate: appends serialize in its single-threaded scope and every contract guard runs there, at one door, before anything persists. `PlaygroundGateDO` rate-limits sandbox creation. `auth.ts` sets visibility: `demo` = public read / authed write, `playground-*` = public read+write, everything else = authed both ways. Guard violation → HTTP 409, parse → 400, unauthorized → 401.
- **`atrium/public/`** — static assets served by the same Worker (`assets.directory` in `worker/wrangler.jsonc`, with `run_worker_first: ["/api/*"]`). Vanilla ES modules, self-hosted fonts, **no build step**. `/` is the public landing plate (`index.html` + `landing.css` + `landing.js`); `/atrium/index.html` is the control room (`app.js`, `api.js`, `theme.js`, `styles.css`). All asset references are **root-absolute** (`/app.js`, `/fonts/…`) — keep them that way, it is what makes the pages relocatable.
- **`cli/bin/stratum.mjs`** — zero-dependency single-file Node CLI, the primary daily capture surface. Config at `~/.config/stratum/config.json`. Exit codes: 0 ok · 1 error · **2 reserved for guard refusals** (contract violation / HTTP 409). Refuses to send a bearer token over plaintext http.

## Conventions

- **Generated files — never hand-edit.** `docs/DECISIONS.md` comes from `scripts/render-decisions.py`. The landing page's stratigraphic figure is baked between the `GENERATED STRATA` markers in `atrium/public/index.html` by `scripts/render-strata-svg.mjs` (piped a projection JSON); it shares its drawing module `atrium/public/strata-draw.js` with the browser's live enhancement, so there is one source of truth for the figure. `data/genesis-projection.golden.json` is generated by the oracle.
- **This project dogfoods itself.** Real decisions are recorded as events in `data/*-trace.jsonl` (genesis = this repo's own construction; stele = cross-project use; per-session traces for significant work). Write the decision when it is made with `birth_status: pending_evidence`, then append a `verification` event with **checked** evidence once it actually lands. Persisted events omit `seq` — reload reassigns it. Every trace must pass `scripts/validate-trace.py`.
- **Foreclosures are first-class.** Roads not taken get `foreclosure` events with `ghost_edges` in the shadow, and a reopen condition. The record is expected to show where you didn't sail.
- **ADR numbering:** the MEMORY_MODEL/ADR-002 collision is resolved (genesis event `sb-009`) — the contract keeps its MEMORY_MODEL identity, ADR-001/002 keep their numbers, new ADRs start at **ADR-003**.
- **Posture: MAX.** Deploying publishes to stratum.mazzeleczzare.com. Confirm before any outward-facing action; never print tokens.
