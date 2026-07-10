# Decisions — projected from the genesis trace

> Generated from `data/genesis-trace.jsonl` at epoch 19 (20 events). **Do not hand-edit** — regenerate with `python3 scripts/render-decisions.py > docs/DECISIONS.md`.
>
> Each entry has two faces: the clean record as the projection renders it, and the *shadow trace* — what the clean record buried, tagged `TRACE` when sourced from surfaced deliberation or `RECON` when reconstructed, with a certainty weight. Ghost edges are roads deliberately not taken.

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

### Da'ath

The mechanism that produced these convergences — whether each was discovery or retrieval — is not recorded here, because it cannot be. The void stays empty; anything placed in it would be fabrication of the unknowable.

