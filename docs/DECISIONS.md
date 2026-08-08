# Decisions — projected from the traces

> **Do not hand-edit.** Regenerate with `python3 scripts/render-decisions.py > docs/DECISIONS.md`.
>
> Each entry has two faces: the clean record as the projection renders it, and the *shadow trace* — what the clean record buried, tagged `TRACE` when sourced from surfaced deliberation or `RECON` when reconstructed, with a certainty weight. Ghost edges are roads deliberately not taken.
>
> Traces are projected **independently**. Each carries its own trust root, so they are separate trust scopes; a merged projection would imply a shared lineage that exists in no log.

---

# Genesis

*The recorded decisions of this repository's own construction.*

> `data/genesis-trace.jsonl` · epoch 19 · 20 events · 13 decisions · 4 foreclosures

## Decisions

### sb-000 — ◆ AXIOMATIC · ratified

**mazze** · 2026-07-10T01:55:00-04:00 · **trust root**

Launch Stratum as a working prototype: full frontend and backend, production-quality Atrium, public deployment at stratum.mazzeleczzare.com, usable for daily decision capture. Build recorded in the system's own event format.

> **Shadow [TRACE · certainty 1.0]** — Human mandate, given out-of-band (session instruction, 2026-07-10). This is the genesis authority for the build: every subsequent event descends from it.

### sb-001 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-10T02:05:00-04:00

The TypeScript port in core/ is the single runtime source of truth for Worker, CLI, and Atrium. The Python reference remains the semantics oracle; divergence is decided by the Python.

> **Shadow [TRACE · certainty 0.85]** — Considered running the Python directly in production (Workers Python runtime, or containerized). Rejected: doubles the deployment surface, and MEMORY_MODEL section 10 already directs the port ('the Python is a semantics check; port the rules into the runtime'). Validation pending: cross-implementation fingerprint test.

### sb-003 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-10T02:07:00-04:00

One Durable Object per log is the single-writer gate: appends serialize in a single-threaded scope and every guard runs at one door. Infrastructure expression of ADR-002's single-synchronous-gate principle.

> **Shadow [TRACE · certainty 0.9]** — Considered D1-only (simpler, queryable) and Workers KV (wrong shape entirely). D1 alone cannot guarantee seq assignment under concurrent writers without locking gymnastics; the DO's execution model gives ordering for free and colocates the contract guards with the append. Validation pending: live append/projection round-trip on the deployed Worker.

### sb-005 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-10T02:09:00-04:00

Public GitHub repository from genesis: clean signed-or-marked history, no secrets in code, event data lives in Durable Object storage rather than git.

> **Shadow [TRACE · certainty 0.7]** — Considered private-first, public at polish. Rejected: the meridian precedent (mazze93/meridian public), the Fellows portfolio needs public work, and the recursive build story is itself the exhibit. Reversible by flipping visibility.

### sb-007 — ○ narrative · asserted

**claude-opus-4.8** · 2026-07-10T02:11:00-04:00

Workflow event data lives on Cloudflare (Durable Object storage), bearer-gated. The sovereignty escape hatch is the contract itself: the export endpoint is serialize_log, and invariant I4 proves the full round-trip. Portability is a tested invariant, not a promise.

> **Shadow [TRACE · certainty 0.65]** — Tension with the local-first ethos of the wider Praxis stack was considered and is real. Chosen anyway because the mandate explicitly asks for a public deployed instance collecting workflow data, and I4 replay keeps exit costs near zero. Awaits human ratification as a strategic call.

### sb-009 — ○ narrative · asserted

**claude-opus-4.8** · 2026-07-10T02:13:00-04:00

The numbering collision flagged in MEMORY_MODEL's header is resolved: the Event Epistemic Contract keeps its MEMORY_MODEL identity (it is a contract, not an ADR); ADR-001 and ADR-002 in the architecture evaluation keep their numbers; new ADRs from this build begin at ADR-003.

> **Shadow [TRACE · certainty 0.85]** — Alternative: renumber the contract to ADR-003. Rejected because the document functions as a specification with an executable reference, not a point-in-time decision record.

### sb-010 — ○ narrative · asserted

**claude-opus-4.8** · 2026-07-10T02:14:00-04:00

Flat npm workspaces (core, worker, cli, plus static atrium) rather than the packages/runtime path MEMORY_MODEL's carry-forward sketch used. Same intent, shallower tree.

> **Shadow [RECON · certainty 0.7]** — Deviation from the doc's literal phrasing, recorded so the doc and repo do not silently disagree. packages/* nesting buys nothing at three workspaces.

### sb-012 — ○ narrative · asserted

**claude-opus-4.8** · 2026-07-10T03:10:00-04:00

API surface v1: POST events (guarded append), GET projection at any epoch, GET events (export = serialize_log), GET event detail. Contract violations map to HTTP 409, parse failures to 400 — the wire mirrors the guards.

> **Shadow [TRACE · certainty 0.8]** — Considered GraphQL and a generic query endpoint; both rejected as surface area without a consumer. The projection IS the query language.

### sb-013 — ○ narrative · asserted

**claude-opus-4.8** · 2026-07-10T03:11:00-04:00

Visitors get per-session playground logs cloned from the curated demo seed: write-open but capped, isolated per Durable Object, disposable. The canonical demo log stays read-only to the public.

> **Shadow [TRACE · certainty 0.85]** — Alternative was a single shared writable demo (vandalism magnet) or read-only-everything (kills the interactive arbitration demo). Per-visitor sandbox preserves both safety and the wow moment.

### sb-015 — ○ narrative · asserted

**claude-opus-4.8** · 2026-07-10T04:05:00-04:00

Atrium arbitration actions are derived from the transition system at the event's current folded status — the UI can only offer what the guards would accept, and a 409 is shown verbatim as the gate speaking. All rendered text is escaped (playground narratives are untrusted input). The epoch scrubber exposes deterministic replay as a first-class UI feature.

> **Shadow [TRACE · certainty 0.9]** — Alternative was hardcoding action menus per view, which is how the prototype's verified/axiomatic collapse happened in the first place: a UI asserting statuses the contract never granted. Deriving from TRANSITIONS makes that class of defect unrepresentable.

### sb-016 — ○ narrative · asserted

**claude-opus-4.8** · 2026-07-10T04:25:00-04:00

The CLI is the primary daily capture surface: zero-dependency single file, one command per contract motion, config in ~/.config/stratum, exit code 2 reserved for guard refusals so scripts can distinguish contract violations from transport errors. Supersession is one command performing the two-event motion (new decision + marker).

> **Shadow [TRACE · certainty 0.85]** — Considered an interactive TUI and a menu-driven flow; both rejected — ADHD-accessible means one command is one complete action, no navigation state to hold. The Atrium is the browse surface; the CLI is the write surface.

### sb-018 — ○ narrative · asserted

**claude-opus-4.8** · 2026-07-10T04:46:00-04:00

Stratum v0.3.0 is public: stratum.mazzeleczzare.com serves the Atrium over the deployed Worker; the demo log is seeded with this genesis trace — the system's first dataset is the record of its own construction; the workspace log is live for daily capture.

- evidence · `url_check` · https://stratum.mazzeleczzare.com — Atrium HTML served, custom domain bound · **checked 2026-07-10T04:46:00-04:00**

> **Shadow [TRACE · certainty 0.9]** — The recursive seed was the launch thesis from the first planning pass: it closes MEMORY_MODEL section 8's named empirical risk with real data and gives the funding demo its opening line.

### sb-019 — ○ narrative · asserted

**claude-opus-4.8** · 2026-07-10T05:05:00-04:00

The human-readable decision record (docs/DECISIONS.md) is a projection of this trace — generated, never hand-edited, drift-guarded in CI alongside the golden projection and both implementations' invariants. MIT license. The repo's own decision hygiene is enforced by the machinery it ships.

> **Shadow [TRACE · certainty 0.9]** — A hand-maintained DECISIONS.md was the obvious default and is how every other repo does it — rejected precisely because hand-maintained decision docs are the drift this system exists to end.

## Foreclosures — ghost edges

### sb-002 — standing

No frontend framework for Atrium v1. Hand-authored ES modules served as static assets; zero build step.

*Ghost edges:* ~~`react-19-frontend`~~ · ~~`astro-frontend`~~

> **Shadow [TRACE · certainty 0.8]** — Ghost edges: React 19 (the praxis-stack default), Astro. Both rejected for v1: the state-machine prototype is already 90 percent of the target UI in vanilla JS, a build chain adds failure modes to the demo path, and funding reviewers see the artifact not the toolchain. Reopen when Atrium needs client routing or shared component state across views.

### sb-004 — standing

The simulated agent roster and mock telemetry are cut from Atrium v1. Everything rendered is a projection of a real log.

*Ghost edges:* ~~`simulated-agent-roster`~~ · ~~`mock-telemetry-feed`~~

> **Shadow [TRACE · certainty 0.75]** — The prototype's roster looks alive and demos well, but a funding audience discovering simulated dashboards costs more trust than the panel earns. One sentence must hold everywhere: everything on screen is a projection of the real log. Reopen when the agent runtime exists and the roster can render real topology.

### sb-008 — standing

Cloudflare Access as the v1 auth layer is foreclosed; a single bearer token (wrangler secret) gates writes and private reads.

*Ghost edges:* ~~`cloudflare-access-auth`~~

> **Shadow [TRACE · certainty 0.8]** — Access is the cleaner zero-trust story and the eventual answer for multi-user, but it drags zone-level IdP configuration into the critical path of a single-user prototype. Reopen at multi-user or org deployment.

### sb-014 — standing

In-process Worker unit tests (vitest-pool-workers) are deferred for v1; the deployed API is verified by a live end-to-end smoke suite instead.

*Ghost edges:* ~~`vitest-pool-workers-v1`~~

> **Shadow [TRACE · certainty 0.7]** — Pool-workers config is real setup cost mid-sprint; the core carries the correctness weight (22 tests) and the Worker is a thin adapter. Reopen when the Worker grows logic of its own.

## Checked-evidence ledger

| verification | target | what was checked | when |
|---|---|---|---|
| `sb-006` | `sb-005` | https://github.com/mazze93/stratum @ c7962f8 | 2026-07-10T02:10:00-04:00 |
| `sb-011` | `sb-001` | vitest cross-validation + invariants @ efed324 | 2026-07-10T03:03:00-04:00 |
| `sb-017` | `sb-003` | https://stratum.mazzeleczzare.com/api/health @ v0a0e3539 — 200, TLS valid, guard refusal 409 observed | 2026-07-10T04:45:00-04:00 |

---

# Stele

*Cross-project use: STELE decisions routed through Stratum.*

> `data/stele-trace.jsonl` · epoch 2 · 3 events · 2 decisions · 0 foreclosures

## Decisions

### st-000 — ◆ AXIOMATIC · ratified

**mazze** · 2026-07-16T20:05:00-04:00 · **trust root**

All STELE decisions route through Stratum. Case reports for stele (app + stele-core) are collected as this trace: data/stele-trace.jsonl. Generation and authority stay separated — a decision is not authoritative until its evidence is checked.

> **Shadow [TRACE · certainty 1.0]** — Human mandate, given 2026-07-16 in-session ('all decisions for stele route through stratum'). Alternative was continuing to log stele decisions in projects-workspace docs/journal/DECISIONS.md — rejected as narrative-only memory: exactly the conflation Stratum exists to prevent.

### st-001 — ● VERIFIED · validated

**claude-fable-5** · 2026-07-16T20:08:00-04:00

Unblock stele delivery by adding a CodeQL workflow (codeql.yml, javascript-typescript) to the repo, satisfying the branch ruleset's required Code Scanning results. The ruleset currently requires scanning results while no scanner is configured, so NO pull request can merge (observed: PR #29, all checks green, merge blocked even with --admin via API).

> **Shadow [TRACE · certainty 0.9]** — Ghost edges: (1) delete the code-scanning requirement from the ruleset — rejected: weakens the hardening posture github-hardening-skills deliberately applied; the rule is right, the missing scanner is the bug. (2) per-PR admin bypass — rejected: failed via API, and unreproducible process even where it works. Validation: PR #29 merges cleanly once CodeQL has run on the PR/base.

## Foreclosures — ghost edges

*None recorded.*

## Checked-evidence ledger

| verification | target | what was checked | when |
|---|---|---|---|
| `st-002` | `st-001` | https://github.com/mazze93/stele/pull/29 merged @ 949148f | 2026-07-16T20:41:00-04:00 |
| `st-002` | `st-001` | https://github.com/mazze93/stele/actions/runs/29544712319 — both matrix jobs pass | 2026-07-16T20:41:00-04:00 |

---

# Public launch

*The public landing surface — this session's own decisions, recorded live.*

> `data/atrium-trace.jsonl` · epoch 40 · 41 events · 22 decisions · 2 foreclosures

## Decisions

### at-000 — ◆ AXIOMATIC · ratified

**mazze** · 2026-07-23T14:10:00-04:00 · **trust root**

Public-launch working session decisions route through this trace: data/atrium-trace.jsonl. Mandate: by session end, a shipped, merged product — a public landing page at stratum.mazzeleczzare.com — with clear decision telemetry including foreclosed options, on a green branch.

> **Shadow [TRACE · certainty 1.0]** — Human mandate, given 2026-07-23 in-session during plan review. Alternative was folding session decisions into the existing stele-trace or journal-only narrative — rejected: this session's decisions concern Stratum's own public surface, a distinct trust scope, and journal-only memory is the conflation Stratum exists to prevent.

### at-001 — ● VERIFIED · validated

**claude-fable-5** · 2026-07-23T14:20:00-04:00

The public landing page takes over `/`; the Atrium control room moves to `/atrium/`. Implementation is a single `git mv` of atrium/public/index.html to atrium/public/atrium/index.html — every reference in the Atrium bundle is root-absolute (/styles.css, /app.js, /api.js, /theme.js, /fonts/*), app.js touches only location.search, and wrangler's default html_handling serves /atrium/ and redirects /atrium.

> **Shadow [TRACE · certainty 0.9]** — Ghost edges: separate subdomain or repo for the landing (rejected: splits deploy surface, wrangler already serves static assets from atrium/public); landing section stacked above the control room in one page (rejected: control room is an instrument panel, not a pitch — mixing registers weakens both). Path-safety claim verified by touchstone probe before approval, not assumed.

### at-002 — ● VERIFIED · validated

**claude-fable-5** · 2026-07-23T14:22:00-04:00

The landing hero is a stratigraphic cross-section of the real genesis trace — 20 events rendered as deposited layers colored by authority tier, epochs as labeled eras, foreclosures as fault lines — shipped as a deterministic static inline SVG, with progressive enhancement that re-renders from GET /api/logs/demo/projection when the API is reachable.

> **Shadow [TRACE · certainty 0.95]** — User selected static-plus-live-enhance from three options. Ghost edges: live-rendered only (truest to everything-is-a-projection, but blank on API failure or JS off — a landing page cannot fail closed); static only (never reflects the live log). The figure uses real trace data either way; a decorative fake stratum diagram was never on the table — sb-004 forecloses simulated dashboards.

### at-003 — ● VERIFIED · validated

**claude-fable-5** · 2026-07-23T14:25:00-04:00

Atrium gains a circadian theme mode: an accessible light-to-dark progression keyed to local time, the default for visitors with no stored preference. Explicit theme choice persists in localStorage and always wins. The existing four named themes remain selectable.

> **Shadow [TRACE · certainty 0.85]** — User mandate ('accessible light to dark gradient on a circadian engine, with user override for atrium'). Design latitude retained on mechanism: banded interpolation across dawn/dusk windows vs continuous interpolation — resolved at implementation toward whichever keeps WCAG-AA contrast provable at every point in the cycle.

### at-005 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T16:40:00-04:00

Intra-tier policy contradictions resolve deny-wins, stated normatively in ARCHITECTURE-EVALUATION.md ADR-002 and TRUST.md §2. Closes ADR-002 action item 1, open since 2026-06-20.

> **Shadow [TRACE · certainty 0.9]** — The rule was already inferable from fail-closed, which is why it sat unstated for a month. Stating it anyway: fail-closed describes behaviour under error, whereas this describes behaviour under a well-formed disagreement between two valid rules — a different case, and one that otherwise resolves by authoring order, i.e. by accident. Ghost edge: allow-wins-with-audit-log, rejected because it makes adding a rule capable of widening a grant, breaking composition with the cross-tier intersection semantics.

### at-006 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T16:45:00-04:00

ADR-001 (Tessera fidelity) moves Proposed → Accepted-implemented, with action items 1-3 checked against verified code evidence and item 4 (Chronicle role re-scope) recorded as deferred, NOT checked. The 2026-06-20 body of the evaluation is left standing; a dated §0 addendum records the supersession.

> **Shadow [TRACE · certainty 0.95]** — Items 1-3 were verified before checking, not assumed: schema split at tessera_projection.py:348 and core/src/projection.ts; MEMORY_MODEL rev 3 §§2/5/8 is the projection spec; the trace-check has BOTH positive and negative tests in both implementations and runs in CI. Item 4 could have been quietly checked to make the ADR look closed — the Chronicle role contract lives in the paper and v0.2.0 SPEC, neither committed here, so there is nothing in this repo to re-scope. Marking it deferred is the honest state and is itself the interesting datum: the projection design landed, the role's self-description never followed. Ghost edge: rewriting §1/§2 in place to read as resolved — rejected as mutating a dated review; supersede, don't mutate, matching the contract this document evaluates.

### at-008 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T17:10:00-04:00

Supersedes at-003's open mechanism question: the circadian work is SURFACING the engine theme.js already implements, not building a new one. Scope is (a) make prefers-color-scheme tracking live rather than read-once, gated on the user not having chosen explicitly, and (b) add a fifth ground, Plate, matching the landing page's black posterboard palette, so opening the Atrium from / is a continuous move rather than a jump between two unrelated rooms.

> **Shadow [TRACE · certainty 0.9]** — Investigation found theme.js ALREADY had the circadian engine: circadianTone() maps hour to a 0-100 tone, applyTokens interpolates day-to-night per ground, toneAuto defaults true, a 5-minute timer re-renders. The plan's 'extend theme.js with a new auto mode' was written before reading the file and would have rebuilt what existed. Human chose surfacing over a ground-to-ground progression across the day, trading that scope for the Plate bridge. Ghost edges: full vellum-through-nocturne progression across the cycle (deferred, not rejected — reopen if the tone range within one ground proves too narrow to read as circadian); pinning the Atrium to Plate on arrival from the landing via referrer sniffing (rejected as fragile and as overriding a returning visitor's room). Requires a real fix: render() persists state on first paint, so a defaulted theme is indistinguishable from a chosen one — live tracking needs an explicit themeExplicit flag or it would override deliberate choices.

### at-009 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T17:40:00-04:00

docs/ARBITRATION.md drafted as a RESEARCH-posture exploration of precedent decay (research agenda #2). It leans toward re-ratification-on-invocation (decay produces events, not decaying numbers), uses context distance as a trigger rather than a continuous weight, and rejects time-based half-life as the primary mechanism. Confidence recorded as low-to-moderate.

> **Shadow [RECON · certainty 0.55]** — Key reasoning: the contract's existing correction markers (supersession, invalidation) are AUTHOR-triggered, but precedent fails READER-triggered — it is consulted without being visited, so nothing prompts an author to correct it. That mismatch is the real gap and is why 'just use supersession' fails. Time-based half-life rejected because the contract deliberately ignores wall-clock in every projection path (MEMORY_MODEL §2); making decay trust a clock would be the single place the system does so. Distance-as-trigger rather than weight because a trigger's worst case is 'asked a human unnecessarily' while a weight's worst case is 'silently deferred to stale authority' — and the metric is likely stochastic, which is tolerable only in the first position. Ghost edges: continuous embedding-similarity weight (rejected — makes an authority boundary depend on a stochastic model in a system whose thesis is mechanical checkability); pure time half-life (rejected as primary, retained as possible backstop since its failure mode is also escalation). Open dependency surfaced: precedent reconciliation of two priors is a diamond, and multi-parent lineage is rejected at write time in v1 — nobody had drawn that dependency.

### at-010 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T18:05:00-04:00

render-decisions.py renders every trace (genesis, stele, atrium) into docs/DECISIONS.md, projecting each INDEPENDENTLY rather than merging them. CI gains two gates: every data/*-trace.jsonl must load through the reference guards, and docs/DECISIONS.md must match a fresh render.

> **Shadow [TRACE · certainty 0.9]** — Independent projection, not a merged log: each trace carries its own trust root, so they are separate trust scopes — a merged projection would imply a shared lineage existing in no log, and would also have to invent an ordering across three independent seq spaces. Ghost edge: one combined chronological projection, rejected on both counts. The DECISIONS.md sync gate was negative-tested before being trusted — drift was deliberately introduced and the diff caught it — because a gate nobody has watched fail is an assumption, not a gate. That is the same discipline the contract applies to its own IncompleteProjection test.

### at-011 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T18:30:00-04:00

Release version bumps 0.3.0 -> 0.4.0 across root, core, worker, cli, the lockfile, and the /api/health payload. The event contract is NOT versioned by this: no schema, projection, or guard semantics changed this session, and the README provenance line now states both facts explicitly.

> **Shadow [TRACE · certainty 0.9]** — Human chose the bump over staying at 0.3.0; the counter-argument (version tracks the contract, and the contract did not move) was correct on its merits, so it is preserved in the README wording rather than discarded — 'v0.4.0, carrying the same event contract (unchanged since rev 3)'. Historical v0.3.0 strings in docs/DECISIONS.md and the golden file were deliberately NOT touched: they are sb-018's immutable event narrative, not status text, and rewriting log content to match a current version is precisely the mutation this system exists to prevent. package-lock.json regenerated because CI runs npm ci, which fails on a lock that disagrees with package.json — caught locally rather than in a red build.

### at-012 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T19:15:00-04:00

The landing gains a decoding layer above the fold and a per-layer audit panel: selecting any stratum opens its full record — claim, evidence with checked-vs-cited state, actor identity, timestamps, every later event that acted on it (with that event's own evidence), roads not taken, and the buried shadow. Event records are baked inline alongside the figure so the panel works with no network.

> **Shadow [TRACE · certainty 0.9]** — Human feedback: the plate read as a beautiful thesis statement rather than a credible decision-audit product, and named the missing piece exactly — selecting sb-014 should reveal claim, evidence, invalidating event, timestamps, actor identity, and reason. Two of the four requested tier definitions were corrected rather than shipped as given: 'narrative = provisional interpretation' conflates two distinct tiers (authoritative_provisional is separate and is now its own PENDING row), and 'foreclosed = invalidated by later evidence' describes invalidation, a different event type — a foreclosure is a deliberate choice with a reopen condition, not a refutation. Shipping either would have misdescribed the contract on the public surface. Records baked inline rather than fetched: the record behind a layer is part of the plate, not an enhancement, and the panel must not depend on an API that may be unreachable. Layers made focusable with role=button and Enter/Space handling; the right-register label is a second hit target because a 1-2px lens is not a realistic click target.

### at-013 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T20:05:00-04:00

Revises at-002: the landing no longer swaps its figure for a live projection. It reconciles against the live log and reports agreement or divergence instead. The static-SVG half of at-002 stands unchanged.

*Revision chain:* `at-002 → at-013`

> **Shadow [TRACE · certainty 0.9]** — The epoch scrubber made at-002's live-enhance clause incoherent: the scrubber's frames are oracle projections baked at render time, so replacing the figure with a live projection would leave the scrubber driving a figure it no longer describes — two surfaces silently disagreeing about the log, which is the exact failure this project exists to prevent. FIRST ATTEMPT WAS A supersession EVENT AND THE GUARD REFUSED IT: 'illegal transition pending_evidence -> superseded on at-002'. The contract was right and I was wrong — you cannot supersede a decision that was never established; at-002 is still awaiting its own evidence. Recorded instead as a revision with at-002 as lineage parent. The deeper lesson is that at-002 was written too coarsely: it bundled two independent choices (how to draw the figure statically, and whether to swap for live data), one of which shipped and one of which was replaced. A well-formed ledger would have recorded them as separate decisions.

### at-014 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T20:10:00-04:00

The landing answers the 15-second developer question: masthead nav (Docs, Contract, Decisions, Atrium, Author, version badge, GitHub), a terminal transcript of real CLI usage beside the wordmark, a copyable clone-and-run command, and FORK A LIVE LOG as the zero-install path. The Atrium gains navigation out — wordmark and Plate link home, plus GitHub and Author — so it is a destination, not a dead end. The landing scrubber hands its position to the Atrium via ?epoch=N.

> **Shadow [TRACE · certainty 0.9]** — Human compared the plate against mise-en-place and named what was missing: nav, version badge, source links, an install command, a terminal showing real usage. Correctly identified that moving the Atrium to /atrium/ (at-001) had created a trap with no way back — a journey break introduced three phases earlier and unnoticed until a human walked it. Two things deliberately NOT copied: a fabricated GitHub star count (no honest number is available at build time) and a docs search box (there are no hosted docs to search; links point at GitHub, which has search). The install command is git clone, NOT npm install: @stratum/cli is private:true and unpublished, and shipping a command that does not run would be precisely the generated-truth failure this project exists to prevent. Two layout defects were found by measuring rather than eyeballing: the h1's min-content width overran its hero column and slid under the terminal, and flex/grid children defaulting to min-width:auto let the 700px figure force 745px of horizontal scroll on a 390px viewport — mobile had never been checked until the human asked.

### at-015 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T20:15:00-04:00

Deterministic replay moves to the front page: an epoch scrubber under the figure redraws the section at any epoch, so a visitor watches verified decisions lose their evidence and foreclosed roads reopen. Every position is a projection computed by the Python oracle at render time (scripts/render-epoch-frames.py), not a browser reimplementation of the fold.

> **Shadow [TRACE · certainty 0.95]** — Answering 'what is the unforgettable moment': not the poster, not the audit panel, but the thing no other tool does — watching status un-derive. The page already CLAIMED 'drag the past back and watch decisions un-verify' while only asserting it, one click away in the Atrium. Ghost edge: implementing the fold in JS — rejected outright, since a third implementation could drift from the contract and the golden-file discipline exists to prevent exactly that. Baking 20 oracle-computed frames costs 17KB and keeps the page's claim literally true. Measured proof the moment lands: 3 green verification seams at epoch 19, 2 at epoch 12, 0 at epoch 5.

### at-016 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T20:45:00-04:00

Comprehension before admiration: a one-line legend sits directly under the figure, the hero closes with the operational consequence stated rather than implied ('Every later decision inherits prior unchecked claims — unless the ledger says otherwise'), and every audit record links through to the Atrium as the canonical proof surface via /atrium/?log=demo&event=ID, which deep-links the inspector to that exact record.

> **Shadow [TRACE · certainty 0.9]** — Human direction: sell the system through one impeccable record view rather than more abstract explanation, and compress comprehension so a first-time visitor understands the model before admiring it. One word changed from the requested legend copy: 'Foreclosed = closed by later decision' became 'a road deliberately closed' — a foreclosure IS the closing decision, not something closed by a subsequent one, and the shorter phrasing is no longer while staying accurate. Required a small Atrium change: ?event=ID opens the inspector on load, one-shot so Refresh does not reopen it.

### at-017 — ● VERIFIED · validated

**claude-opus-4.8** · 2026-07-23T21:20:00-04:00

Hero polish: centered title band spans the full sheet (STRATUM scales to clamp(72px,17vw,232px)) with description-left / terminal-right below it; the two-column hero holds down to 640px before stacking. The two hero CTAs get per-button tier color (Fork = blue, Atrium = yellow) and an art-deco frame — double rule plus four corner registration ticks — echoing the survey plate rather than the terminal box. The three source-register entries dropped their pill boxes for a tier-colored underline that fills upward on hover.

> **Shadow [TRACE · certainty 0.9]** — Human directed each step live over several rounds. The apparent 'stacking' regression was diagnosed by measuring geometry, not eyeballing: the viewport was 885px, under the original 900px hero breakpoint, so it had correctly collapsed to mobile — the human confirmed and stood corrected, and the breakpoint dropped to 640px so two columns hold at desktop-ish widths. CTA deco built from the plate's own vocabulary: border + inset ::before rule (the outline-offset echo) + ::after eight-gradient corner ticks (the reg-marks echo), --deco flipping dark on hover-fill. Blue #5aa9d6 and yellow #d0b25c chosen as distinct tier colors that read on black and take dark ink when filled. Ghost edge: keeping the uniform green pill boxes — rejected, they were too close to the terminal box and gave the three registers no individual identity.

### at-033 — ◐ PROVISIONAL · pending_evidence

**claude-opus-4.8** · 2026-07-24T12:00:00-04:00

Harden the public repo's supply chain and provenance. Code scanning: advanced CodeQL workflow (security-extended) over actions + javascript-typescript + python, on push/PR to main plus a weekly baseline. Dependabot: weekly npm and github-actions version updates (security updates already on). Third-party Actions SHA-pinned in ci.yml and the new workflows, with Dependabot keeping the pins current. SECURITY.md publishes a disclosure policy and a provenance contract. Branch protection on main: PR required (0 approvals, solo-safe), CI required, force-push and deletion blocked. Provenance is two independent layers: commits/tags stay GPG-signed (GitHub Verified once the key is registered) and required-signed-commits gates main; releases are Sigstore/cosign keyless-signed and Rekor-logged via release-attest.yml.

> **Shadow [TRACE · certainty 0.9]** — Audit finding that motivated this: commits ARE gpg-signed and verify Good locally (ed25519 C641A68647D8A0FA), but GitHub reports every authored commit verified=false/unknown_key — the signing public key was never registered on the account (consistent with the 2026-07-15 fresh-machine rebuild). Signed, but not publicly verifiable. Ordering traps, same family as stele st-001 (a required code-scanning check with no scanner blocked all merges): CodeQL is added as a required status check only AFTER its first green run on main, and required-signed-commits is turned on only AFTER the gpg key is uploaded (GitHub treats unknown_key as unverified and would block the maintainer's own PRs). Both staged as gated follow-ups.

### at-034 — ● VERIFIED · validated

**claude-opus-5** · 2026-07-26T01:05:00-04:00

Move all three github/codeql-action entrypoints (init, autobuild, analyze) to the same v4.37.3 commit SHA e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81. The three are entrypoints in ONE repository and must move as a set; they had drifted apart, with autobuild on v4.37.3 while init and analyze stayed on the v3 SHA 4187e74d05793876e9989daffde9c3e66b4acd07.

> **Shadow [TRACE · certainty 0.95]** — Discovered while sweeping open Dependabot PRs: all four (#8 codeql-analyze, #9 cosign-installer, #10 action-gh-release, #13 hono) failed the same three Analyze (actions|javascript-typescript|python) jobs, including bumps that touch no CI at all. The failing STEP was Autobuild, erroring 'Loaded a configuration file for version 3.37.3, but running version 4.37.3' - autobuild v4 cannot read the config written by init v3. main was already broken: HEAD c337f62 merged the autobuild-only bump (#6), which silently broke CodeQL for every subsequent PR. This is the Dependabot partial-bump hazard for multi-entrypoint actions: Dependabot models init/autobuild/analyze as independent dependencies and opens separate PRs, so merging one alone desynchronises the set and the breakage surfaces on unrelated PRs - the misattribution trap. Merging the open analyze bump (#8) alone would NOT have fixed this, since init would still be v3; #8 is subsumed by this change. Note at-033 (which introduced this CodeQL workflow) remains pending_evidence, so CodeQL had never had a green run on main to protect - consistent with at-033's own staging rule that CodeQL becomes a required check only after its first green run.

### at-036 — ● VERIFIED · validated

**claude-opus-5** · 2026-07-26T02:20:00-04:00

Promote CodeQL to a required status check on main. The three matrix analyses - Analyze (actions), Analyze (javascript-typescript), Analyze (python) - are added to branch protection's required contexts alongside the existing Typecheck, tests, cross-validation.

> **Shadow [TRACE · certainty 0.9]** — at-033 staged this deliberately: CodeQL becomes a required check only AFTER its first green run on main, because a required code-scanning check with no passing scanner blocks every merge (the stele st-001 trap). That precondition was unmet for the entire life of at-033 - CodeQL had never been green on main - and at-034/at-035 have now satisfied it (run 30191349561 @ 804a095). Chose the three matrix job contexts rather than the aggregate CodeQL check run: the matrix jobs are the analyses that actually gate, and the aggregate reports in 2-3s as a code-scanning rollup. The tradeoff is that changing the language matrix now requires updating branch protection in the same change, which is the intended coupling.

### at-038 — ◐ PROVISIONAL · pending_evidence

**claude-opus-5** · 2026-07-26T03:05:00-04:00

Restrict the Dependabot dev-dependencies group to minor and patch updates. Major dev-dependency updates are NOT ignored - they arrive as their own individual PRs instead of riding along inside a routine grouped bump.

> **Shadow [TRACE · certainty 0.9]** — Group PR #12 (deps-dev, 5 updates) failed 'Typecheck, tests, cross-validation' at 'npm run check' with TS2591 Cannot find name 'node:fs', TS2304 Cannot find name 'URL', TS2339 Property 'url' does not exist on type 'ImportMeta' in core/test/cross-validation.test.ts. Cause was not @types/node (24->26) but typescript 5.9.3 -> 7.0.2 bundled in the same PR - the native TypeScript port, which ships platform-specific binaries (@typescript/typescript-darwin-arm64 et al) and resolves lib/types differently. vitest 3 -> 4 rode along too. Two real migrations were hidden inside a bump labelled routine dev-tooling. The grouping was the defect, not the packages: a group that admits majors converts 'review a version bump' into 'review a toolchain migration' without saying so. Chose update-types minor+patch over an ignore rule for typescript/vitest, because ignoring would silently stop the migrations from ever surfacing; this keeps them visible and reviewable on their own. #12 is closed rather than merged; Dependabot will reopen a conforming group.

### at-039 — ◐ PROVISIONAL · pending_evidence

**claude-sonnet-5** · 2026-08-06T06:46:00-04:00

Add explicit compilerOptions.types: ["node"] to core/tsconfig.json. core previously relied on TypeScript automatic @types acquisition (no explicit types field) to bring in Node globals (node:fs imports, URL, ImportMeta.url) used by core/test/cross-validation.test.ts.

*Revision chain:* `at-038 → at-039`

> **Shadow [TRACE · certainty 0.9]** — at-038 restricted the dev-dependencies Dependabot group to minor/patch after grouped PR #12 (typescript 7.0.2 + vitest 4 + others) broke npm run check with TS2591/TS2304/TS2339 in core/test/cross-validation.test.ts, and attributed the break to typescript 7 alone. Re-tested empirically against the three individually-open major-bump PRs (#19 typescript 7.0.2, #21 @types/node 26.1.2, #22 vitest 4.1.10): each passes npm run check cleanly in isolation, and typescript 7 + @types/node 26 together also pass. The break only reproduces with typescript 7 + vitest 4 together, regardless of @types/node version (24.13.3 or 26.1.2 both fail identically) - so at-038s attribution to typescript alone was incomplete, and @types/node was never the culprit. Root cause: with no explicit types field, tsc falls back to automatic @types acquisition, and something in how typescript 7s native port walks node_modules/@types changes which globals get pulled in once vitest 4 (and its own vite 8 / @types chain) is also present. An explicit types: ["node"] removes the dependency on that fallback entirely, matching what the compiler error itself suggests (Try add node to the types field). Verified: with the fix applied on top of current main (typescript still 5.9.3), npm run check / npm test / npm run test:reference / npm run validate:trace / docs/DECISIONS.md staleness all pass unchanged - so this is safe to land now, before any of #19/#21/#22 merge, rather than only after a break is observed. worker/tsconfig.json already sets its own explicit types (@cloudflare/workers-types), which is why worker never surfaced this.

### at-040 — ◐ PROVISIONAL · pending_evidence

**claude-opus-4.8** · 2026-07-25T15:10:00-04:00

Fix CodeQL CWE-200 alert js/file-access-to-http in cli/bin/stratum.mjs: s.endpoint (from the local config file / env / flag) flowed unvalidated into fetch(). call() now parses s.endpoint+path through the URL constructor, rejects any scheme other than http:/https: via fail(), and passes the validated URL object (not the raw string) to fetch.

*Revision chain:* `at-033 → at-040`

> **Shadow [TRACE · certainty 0.9]** — This is the first real finding the at-033 CodeQL setup surfaced — scanning earning its keep. URL(endpoint+path) preserves the existing concatenation semantics (paths are absolute, default endpoint has no base path) while adding the sanitizer CodeQL recognizes. Ghost edge: URL(path, endpoint) base-resolution form — rejected, it would silently drop a configured base-path prefix and change request targeting. Evidence lands when the CodeQL alert closes on the re-scan of this commit. Renumbered from at-039 to at-040 while resolving a merge conflict with main, which had independently assigned at-039 to an unrelated decision (explicit tsconfig types) that landed first.

## Foreclosures — ghost edges

### at-004 — standing

The landing page does not follow the circadian engine. It is pinned to a single dark survey-poster rendering — black field, false-color strata, mono caption register.

*Ghost edges:* ~~`circadian-landing`~~

> **Shadow [TRACE · certainty 0.8]** — User delegated this call ('the pinned poster for the landing page can either respect the circadian engine or stay dark, your call'). Pinned dark chosen: the USGS-plate aesthetic is the lasting-impression instrument, and a poster that re-inks itself by time of day dilutes its identity; accessibility is handled by AA-checked contrast within the dark palette rather than by a light variant. Reopen if analytics or feedback show daylight readability complaints.

### at-007 — standing

docs/TRUST.md ships as a skeleton that RESOLVES the two decidable questions (deny-wins tie-break, negative-test ship gate) and explicitly FRAMES the capability-ontology granularity question without answering it. Inventing an ontology to make the document look complete is foreclosed.

*Ghost edges:* ~~`invent-capability-ontology-now`~~ · ~~`omit-trust-md-until-resolvable`~~

> **Shadow [TRACE · certainty 0.85]** — The ontology is research agenda #1 and the make-or-break usability decision for a deny-by-default gate; resolving it needs evidence this project does not yet have — a corpus of real capability requests, rule-count-per-granularity, and transitive leak analysis. TRUST.md §3 names those three as what would resolve it, and states a provisional lean (granularity varies by capability class, not uniform) explicitly held as hypothesis rather than decision. Reopen when the dogfooding traces have accumulated enough real capability requests to sample. A document that answered it now would be prose wearing the costume of a decision — the exact conflation Stratum exists to prevent.

## Checked-evidence ledger

| verification | target | what was checked | when |
|---|---|---|---|
| `at-018` | `at-001` | https://stratum.mazzeleczzare.com/ -> 200; /atrium/ -> 200; /atrium -> 307 | 2026-07-23T21:52:00-04:00 |
| `at-019` | `at-002` | https://stratum.mazzeleczzare.com/ contains baked strata-records + FIG.1 section at epoch 19 | 2026-07-23T21:52:00-04:00 |
| `at-020` | `at-003` | atrium/public/theme.js @ 369a056 on main (circadian engine surfaced, themeExplicit guard) | 2026-07-23T21:53:00-04:00 |
| `at-021` | `at-005` | docs/ARCHITECTURE-EVALUATION.md + docs/TRUST.md @ 369a056 on main | 2026-07-23T21:53:30-04:00 |
| `at-022` | `at-006` | docs/ARCHITECTURE-EVALUATION.md ADR-001 + §0 addendum @ 369a056 on main | 2026-07-23T21:54:00-04:00 |
| `at-023` | `at-008` | https://stratum.mazzeleczzare.com/ cta--fork #5aa9d6 / cta--atrium #d0b25c; Plate ground in theme.js @ 369a056 | 2026-07-23T21:54:30-04:00 |
| `at-024` | `at-009` | docs/ARBITRATION.md @ 369a056 on main | 2026-07-23T21:55:00-04:00 |
| `at-025` | `at-010` | https://github.com/mazze93/stratum/actions/runs/30037916351 — check + 26 tests + reference + all-traces + DECISIONS-sync all pass | 2026-07-23T21:55:30-04:00 |
| `at-026` | `at-011` | https://stratum.mazzeleczzare.com/api/health -> {"ok":true,"service":"stratum","version":"0.4.0"} | 2026-07-23T21:56:00-04:00 |
| `at-027` | `at-012` | https://stratum.mazzeleczzare.com/ contains id=strata-records (20 events) + audit panel markup | 2026-07-23T21:56:30-04:00 |
| `at-028` | `at-013` | https://stratum.mazzeleczzare.com/ fig-live caption reads 'LIVE LOG REACHED · IN SYNC AT EPOCH 19' | 2026-07-23T21:57:00-04:00 |
| `at-029` | `at-014` | https://stratum.mazzeleczzare.com/ masthead nav + git-clone install cmd; /atrium/ has back-to-Plate/GitHub/Author links | 2026-07-23T21:57:30-04:00 |
| `at-030` | `at-015` | https://stratum.mazzeleczzare.com/ scrubber: 3 green seams at epoch 19, 0 at epoch 5 (measured in-browser) | 2026-07-23T21:58:00-04:00 |
| `at-031` | `at-016` | https://stratum.mazzeleczzare.com/ contains decode-line legend + audit-canon canonical links | 2026-07-23T21:58:30-04:00 |
| `at-032` | `at-017` | https://stratum.mazzeleczzare.com/ hero-title centered; cta--fork #5aa9d6 + cta--atrium #d0b25c with corner-tick deco; real :hover floods blue, ink dark | 2026-07-23T21:59:00-04:00 |
| `at-035` | `at-034` | https://github.com/mazze93/stratum/actions/runs/30191349561 - CodeQL on main @ 804a095: Analyze actions/javascript-typescript/python all success | 2026-07-26T01:35:00-04:00 |
| `at-035` | `at-034` | https://github.com/mazze93/stratum/actions/runs/30178990744 - prior CodeQL on main @ c337f62: same three Analyze jobs failed (Autobuild: config v3.37.3 vs running v4.37.3) | 2026-07-26T01:35:00-04:00 |
| `at-035` | `at-034` | .github/workflows/codeql.yml init+autobuild+analyze all @ e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81 # v4.37.3, merged as 804a0957b5e6340b32d459e242afc9b91574735a on main (PR #14) | 2026-07-26T01:35:00-04:00 |
| `at-037` | `at-036` | GET /repos/mazze93/stratum/branches/main/protection -> required_status_checks.contexts = [Typecheck, tests, cross-validation; Analyze (actions); Analyze (javascript-typescript); Analyze (python)] | 2026-07-26T02:20:00-04:00 |

---

### Da'ath

The mechanism that produced these convergences — whether each was discovery or retrieval — is not recorded here, because it cannot be. The void stays empty; anything placed in it would be fabrication of the unknowable.

