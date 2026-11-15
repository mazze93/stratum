# Survey, heading, and perimeter: 2026-11-14

> **Authority: narrative.** This page reads the traces and adds no events to them.
> Every item cites the event or source line that leaves it open. Findings marked
> **probe** were run, and the command and result are given. Nothing is settled
> until it lands in a log.
>
> Read at `main` = `77297cb` (tag `v0.5.0`). Live: `GET /api/health` →
> `{"version":"0.5.0"}`.

## 1. Where it stands

**Gates on `main`: all green, re-run for this survey.** `npm run check` ok · vitest
129/129 · oracle 16/16 invariants, 5/5 canonical bytes, 10/10 v2 binding rules,
9/9 re-checker · all 7 traces validate · `DECISIONS.md` in sync ·
`check-version` consistent at 0.5.0.

| Trace | Verified | Axiomatic | Pending evidence | Asserted | Foreclosed |
|---|---:|---:|---:|---:|---:|
| Genesis `sb-` | 3 | 1 | 0 | 9 | 4 |
| Stele `st-` | 1 | 1 | 0 | 0 | 0 |
| Public launch `at-` | 20 | 1 | 3 | 0 | 2 |
| Workspace `wt-` | 6 | 1 | 7 | 0 | 3 |
| Trust primitives `tp-` | 9 | 2 | 7 | 1 (+1 rejected) | 4 |
| Ingress `ig-` | 1 | 0 | 1 | 1 | 2 |
| Releases `rl-` | 0 | 0 | 1 | 1 | 3 |
| **Total (78 decisions)** | **40** | **6** | **19** | **12 (+1)** | **18** |

**What shipped since v0.4.0:**
- **Bound evidence.** Schema v2, ADR-003 phases 1, 1b and 2.
- **Content addressing.** Hash-chained storage with a head digest.
- **A strict parser.**
- **`stratum verify --run` binds by default.**
- **No default log** (tp-031).
- **One ingress door for automated writers.** `stratum emit`, with docs/API.md as its wire contract (ig-000, ig-001).
- **A re-checker** in CI (tp-023).
- **A release pipeline** (rl-001, rl-004).

## 2. Where it is heading

The record holds one ordered plan and one held one:

- **`tp-019` (approved by mazze):**
  - R1: land the PR stack (**done**, tp-024–tp-030).
  - R2: anchor the log head off-system.
  - R3: re-checker (**built**).
  - R4: the authority registry, quorum fixed per log at genesis.
  - R5: Temenos on v2 as the first external writer.
- **ct-reshape** (`docs/journal/2026-11-11-ct-reshape-t1/REBASELINE.md`): T1 ingress is
  **done**. T2–T5 are **held** behind four questions for mazze. Is spec 0.6.0 draft or
  ratified? Where does the plugin source live? Ratify or drop ig-004? Does Temenos
  (already live in production) reorder T2 against R5?

Destination, from the same record: a ledger that other systems write into through
one door, where evidence is re-derived rather than trusted, authority is signed rather
than claimed, and the head is witnessed outside the system. Read as a plain status
line, that is the thesis at the top of `README.md`, made true end to end.

## 3. Perimeter probes (touchstone)

The green gates above are a snapshot. Each probe targets a claim the project makes
about itself, at a boundary those gates don't reach.

| # | Claim | Boundary | Verdict |
|---|---|---|---|
| P1 | TS and Python project identically | CI pins **genesis only**; v2 traces unpinned | **Held** on all 7 traces; probe failed on a mutated oracle file |
| P2 | Every recorded binding reproduces | Pinned commits, clean worktrees, full history | **Held** 11/11 |
| P3 | `DECISIONS.md` is a faithful projection | Renderer vs v2 evidence | **Did not hold** |
| P4 | Ratification needs a human gesture | The sibling `ratify` command; an agent-allocated pty | **Did not hold** |
| P5 | Trace file and seeded DO share one content address | Live production | **Held**; one unexplained 500 |
| P6 | v0.5.0 is on npm with provenance; brew installs it | The real registry, not the rehearsal | **Did not hold** |

### P3 — the generated record contradicts itself on v2 evidence

`scripts/render-decisions.py:128` builds the checked-evidence ledger from
`evidence.checked_at` only. Under v2, `checked_at` is metadata no guard reads, and a
`binding` is what makes evidence checked (tp-002). So the **Trust primitives** section
lists nine `● VERIFIED` decisions and then says *"No checked evidence yet — every
decision above is provisional or axiomatic."* **Ingress** does the same over `ig-000`.
**Workspace** silently drops the v2 rows for wt-020 and wt-022.

- **Effect:** the human-readable record understates what was checked, in the
  direction of the newest, strongest evidence.
- **Fix:** render v2 rows from the binding. For `reproducible_check`, show command @
  commit and expect_exit. For `signed_attestation`, show the subject digest and
  key_id. Then regenerate; the sync gate covers the rest.

### P4 — ratification is gated on one door of two, and the default agent is mazze

Run against a local recorder stub (`127.0.0.1:8787`, logs requests and forwards
nothing). Production was never touched.

| Case | Command | Result |
|---|---|---|
| A | `stratum ratify dec-x` with no TTY and `STRATUM_AGENT` unset | **exit 0.** The stub received `ratification`, `agent_id: "mazze"` |
| B | `emit` a ratification with no TTY | exit 4, refused. The message says *"Run it yourself: stratum ratify dec-x"*, which is case A |
| C | `emit` a ratification under `pty.fork()` that types the id back | **exit 0.** Recorded with `agent_id: claude-probe` |

- **Cause of A:** `confirmHumanGesture` (`cli/lib/ingress.mjs:460`) guards only `emit`.
  `stratum ratify` (`cli/bin/stratum.mjs:292`) appends with no gate.
- **Second cause of A:** `settings()` (`stratum.mjs:66`) defaults `agent` to `"mazze"`.
  An agent's shell that holds the token mints an axiomatic act attributed to the human.
  tp-031's shadow named that default as an open item (`inc_aJvG5BbagJ9NG__n`). This
  probe shows what it costs. It is generation becoming authority, the exact
  conflation the project exists to stop.
- **Case B:** the refusal message routes the caller straight to the ungated door.
- **Case C:** this is the inherent perimeter of a client-side TTY check. Attribution
  holds, but presence doesn't. The server cannot tell either way: a v1 ratification
  carries no authorization (tp-003's shadow), so the bearer token is the whole gate.
- **Real data:** every ratified record in the repo's traces is a mazze trust root.
  None is a `ratification` event. The private production logs were **not checked**,
  because there is no token in this session.
- **Fix, in order:**
  1. Remove the `"mazze"` default. Refuse without an agent, as `emit` already does.
  2. Put `confirmHumanGesture` on `stratum ratify`.
  3. Change B's message so it doesn't route to an ungated command.
  4. Only R4, with `sk-` keys and the user-presence flag (tp-010), closes C.

### P5 — the live digest holds; one 500 is unexplained

`GET /api/logs/demo/head` → `head_digest 67f7689b…bbc0`, equal to the oracle's
`log_digest` of `data/genesis-trace.jsonl` and to `canonical.golden.json`. The **first**
call of the session returned `{"error":"internal error","kind":"internal"}`, and three
retries returned 200. That error isn't the legible `load_failure` that tp-021 built.
Worth one `wrangler tail` on a cold demo DO.

### P6 — v0.5.0 is not on npm, and the package that would ship has no command

- **The registry.** `npm view @stratum-ledger/cli` → **404**. As a control, `hono`
  resolved through the same path.
- **The release run.** Run 43475163595 (tag `v0.5.0`, attempt 2) passed version, bundle,
  sign and attest, then failed in *Publish with provenance* with **`EOTP`**. The token
  in `npm-publish` requires a one-time password. The provenance statement had already
  gone to Sigstore (logIndex 3867158126), so a public transparency entry exists for a
  version that doesn't.
- **The bin, a second defect hidden behind the first.** In the same log, npm 11
  reported `"bin[stratum]" script name bin/stratum.mjs was invalid and removed`.
  Reproduced locally: `npm@11.21.2 publish --dry-run` in `cli/` strips `./bin/stratum.mjs`.
  A successful publish would ship a package **with no `stratum` command**.
- **Why rehearsal missed it.** It was green because `npm pack` keeps the bin, and
  rl-001's own evidence was *"a global install of the packed tarball"*. The rehearsal's
  `npm publish --dry-run` (`release.yml:83`) prints the warning and exits 0.
- **Fix, tested in a scratch copy:** `npm pkg fix` rewrites the bin to
  `"bin/stratum.mjs"`. The dry-run is then clean, and the packed tarball installs
  `stratum --version` → `0.5.0`.
- **Brew.** `mazze93/homebrew-tap` is not reachable anonymously (git asks for
  credentials). rl-005 says the formula is pinned to the npm tarball, which doesn't
  exist. So `brew install mazze93/tap/stratum` can't work for a public user either.
- **The ledger was right and the prose was wrong.** `rl-001` is still
  `pending_evidence`, which is accurate. `README.md:109-115`, `cli/README.md:15` and
  `CHANGELOG.md` ("on npm") assert a distribution that doesn't exist. The record
  held; prose went true by persistence, which is the failure mode in the README's first
  paragraph.

## 4. The path, step by step

Each step has a done-criterion that could fail. The order follows dependencies.

### Stage A — make the public claims true (blocking; small)

1. **Correct the docs now.** Until a publish lands, README, cli/README and CHANGELOG say
   "install from the signed GitHub release bundle". Point to the `v0.5.0` release
   and keep the npm and brew lines out.
   *Done when:* no doc names an install path that 404s.
2. **Fix the bin and harden the rehearsal.** Change `cli/package.json` to
   `"bin": {"stratum": "bin/stratum.mjs"}`. Make the rehearsal fail on any
   `auto-corrected` warning, and install from `npm publish --dry-run`'s own normalization,
   not from `npm pack`.
   *Done when:* the rehearsal fails on the current `./bin` and passes on the fix.
3. **Ship v0.5.1, and don't re-run v0.5.0's failed job.** The bin is a code fault, so
   per `docs/RELEASING.md` it needs a new patch version. Tags are immutable. Re-running
   the job with a working token would publish a package with no command. Fix the token
   by using an automation or granular token that can publish from CI, then cut 0.5.1.
   Afterwards, move to Trusted Publishing and revoke the token, as rl-001 planned.
   *Done when:* `npm view @stratum-ledger/cli@0.5.1 bin` shows `stratum`,
   `npm audit signatures` passes in a clean project, and **then** rl-001 gets its
   verification.
4. **Make the tap public, or drop it from the docs.**
   *Done when:* `brew install mazze93/tap/stratum` works on a machine with no credentials.

### Stage B — close the authority hole (the thesis, at the client)

5. **P4 fixes 1–3:** no default agent, gate `ratify`, fix the refusal message. Record
   it as a `tp-` decision. Born `pending_evidence`, verified by a bound test that runs
   case A and expects refusal.
   *Done when:* case A exits non-zero with nothing sent.
6. **Fix the P3 renderer.**
   *Done when:* the Trust primitives and Ingress sections list their v2 rows, and no
   section says "no checked evidence" above a `● VERIFIED` entry.
7. **Pin parity for every trace in CI.** Generate a golden projection per trace, or
   diff the oracle against TS for every trace, as P1 did.
   *Done when:* a one-character change to any trace's projection fails CI.

### Stage C — owed evidence and the ratification queue

8. **Verify what already landed.**
   - `wt-007`: Workers Builds is observed in tp-032's shadow.
   - `tp-023`: the re-checker reproduced 11/11 in this survey; bind a CI run.
   - `at-038` and `at-039`: main runs TypeScript 7 and vitest 5, green.
   - `ig-001`: API.md exists. Before verifying it, fix line 41, which still shows
     `"version":"0.4.0"`. Also add `docs/API.md` to `check-version.mjs`, since rl-004
     says "one version everywhere".
9. **Mazze's queue, in this order:**
   1. `tp-022`: contract-per-row. Before R4 tightens the parser again. tp-021 showed a
      tighter parser strands stored history.
   2. `ig-004`: a narrower write-only token. After P4, the shared `STRATUM_TOKEN` is
      the entire authority boundary.
   3. The four REBASELINE questions, which unblock T2–T5.
   4. The genesis eight (`sb-009`…`sb-019`). Several of these (`sb-013`, `sb-016`,
      `sb-018`) can be **verified** rather than ratified. Either way the genesis golden
      file and Fig. 1 change, so do them as one deliberate commit.
   5. `at-033`: require signed commits. That waits on every commit source landing
      verified, per CLAUDE.md.

### Stage D — the tp-019 sequence

10. **R2, an off-system anchor.** tp-012 established that a dropped tail is a valid
    chain, and tp-013 that storage access can recompute the chain. ADR-003 §8 names the
    witness: claude-stamp's forward-only anchor into checkmate's hub. This needs a
    deploy decision event first.
    *Done when:* truncating a DO's tail is detected by comparing against the anchor.
11. **R4, the authority registry** (tp-003, tp-004, tp-010), with quorum fixed per log
    at genesis (tp-019). Choose the TS Ed25519 verifier against a real workerd run;
    tp-012 found workerd has no `nodejs_compat`. This closes P4 case C, and it lifts
    tp-014's refusal of v2 authority acts.
    *Done when:* a v2 ratification without a user-present `sk-` signature is refused
    **server-side**.
12. **ADR-003 phase 5.** MEMORY_MODEL rev 4 and TRUST.md catch up to bound evidence and
    the registry.
13. **R5 and T2, the first external writers.** Temenos on v2 (tp-011 shaped `inputs` for
    it), then cognitive-topology through `stratum emit`. This is where `at-007`'s
    capability-ontology sample becomes possible, and where `sb-004` and `sb-008` start
    to reopen.

### Reopen conditions to record either way

- **`sb-014`** (no in-process Worker tests): "when the Worker grows logic of its own."
  `worker/src/persist.ts` now owns transactions and the chain, and it is tested against
  a store that *simulates* `transactionSync`. tp-013's own touchstone pass found two
  persistence defects after the suite was green (52/52), and it confirmed the fix with
  a real workerd run. That workerd step is not in CI. Record a decision.
- **`wt-011`** (sharp override): delete it once miniflare pins sharp ≥ 0.35.5.

## 5. What this pass did not check

- **Private production logs** (`workspace`, `temenos`, `macos-vuln-pipeline`): no token
  in this session. Whether any existing ratification there came through case A is
  **unknown**.
- **The Homebrew formula itself:** the tap was unreachable.
- **No writes to production.** The P4 cases ran against a local stub only. The playground
  was not forked, because forking is a write.
- **Semantic adequacy of evidence.** P2 shows that bindings *reproduce*, not that they
  test their claim. Example: tp-034 verifies "the local checkout mirrors production"
  with `grep` over CLAUDE.md's wording, which proves the doc says it, not that any
  checkout is at `main`. This is the README's stated perimeter. Here it is visible on
  a live record.
- **Not probed:** idempotency of `emit` under concurrent retries (33 ingress tests
  cover it); `/home/` and the Atrium UI; CodeQL coverage; the cosign bundle's signature
  verification by a third party.
