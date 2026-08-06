---
title: Stratum Reshape Analysis — v0.4.0
type: analysis
project: stratum
version: v0.4.0
tags: [stratum, decision-ledger, cognitive-workbench, cathedral-brick, reshape, epistemic-contract, tessera, memory-model]
date: 2026-07-24
status: analysis-complete
supersedes: none
related: [[stratum]] · [[stele]] · [[kintsugi]] · [[macprobe]] · [[cognitive-topology-series]]
---

# Stratum Reshape Analysis — v0.4.0

*Comparison between SPEC v0.2.0 draft (session artifact) and Stratum v0.4.0 live at stratum.mazzeleczzare.com.*

---

## Strategic frame

**Stratum v0.4.0 is the first brick. The cathedral is still the cognitive workbench.**

The approach is one MVP at a time, leveraging existing resources, one brick at a time. This document is a diff between what was drafted in a single working session (a whole-cathedral spec) and what actually shipped as the first foundation stone (an epistemic decision ledger). The delta is not "the plan was wrong" — the delta is "the plan was ambitious in the right direction and the first shippable increment is a smaller, sharper artifact that stands on its own while carrying the cathedral's spine forward."

Nothing in the draft artifacts (whitepaper, SPEC v0.1.0/v0.2.0, RUNTIME.md, IMPLEMENTATION.md) is being retired. Concepts that couldn't ship in the first brick — the twelve agent roles, the memory hierarchy tiers, the sandbox, the CognitiveTransaction runtime — remain load-bearing for later bricks and for the eventual workbench.

---

## What shipped

**Stratum** is now a web-based **epistemic decision ledger**, not a macOS cognitive workbench. TypeScript + Cloudflare Workers + Durable Objects for the backend, hand-authored ES modules for the Atrium (zero build step), Python as a semantics oracle for the projection rules. Public at [stratum.mazzeleczzare.com](https://stratum.mazzeleczzare.com), source at [github.com/mazze93/stratum](https://github.com/mazze93/stratum), MIT-licensed. Currently at **v0.4.0**.

The load-bearing move is not agent orchestration. It's an epistemic contract on an append-only event log: **status is a fold over the log, never a stored field**. `validated`, `superseded`, `disputed`, `pending_evidence`, `contradicted`, `ratified`, `rejected` — all computed by folding transition markers over immutable events, at any epoch. Drag the timeline back and verified decisions un-verify because their evidence hasn't landed yet. Replay is not a feature; it's a proof.

---

## The load-bearing shift

The v0.2.0 spec was about **cognitive topology** — roles, memory tiers, orchestration, sandboxing, twelve agent scaffolds. It was answering the question: *how do humans and multiple AI agents coordinate reliably?*

The shipped Stratum answers a smaller, sharper question: *how do you keep a generated conclusion from becoming operational truth just because it got persisted?* The framing on the landing page states it directly — "Agentic systems conflate generation with authority: without an evidence ledger, a generated conclusion becomes operational truth merely because it was persisted or repeated." Everything downstream — the Durable Object as single-writer gate, the sixteen invariants, the fail-closed projection, the distinction between `authoritative_verified` and `authoritative_axiomatic` — is in service of that one claim.

This is a **smaller product with more philosophical spine**. The v0.2.0 spec had many good ideas serving a broad ambition. What shipped has one idea serving itself precisely.

---

## What survived from v0.2.0 / RUNTIME.md

| Concept | Fate in live product |
|---|---|
| Append-only audit log | Central. The log *is* the product now. |
| Foreclosed options with reason and reopen condition | Central. Rendered as first-class layer in the section diagram. |
| Determinism / replay-as-proof | Central. Sixteen invariants, replay proven by serialize → JSON → reload → reproject round-trip. |
| Fail-closed discipline | Kept and hardened. `IncompleteProjection` raises on any authoritative field with no backing event. |
| Tessera | Kept as a **projection** at an epoch, not as an out-of-session handoff. CLI shows `stratum tessera` → "13 decisions · 3 verified · 4 foreclosed · epoch 19." |
| PolicyEngine (as concept) | Compressed. The Durable Object per log is the single-writer gate; every guard runs at one door (sb-003). No separate PolicyEngine component. |
| The Atrium as spatial surface | Kept, but web-based; static HTML/ES modules; a section diagram through the ledger rather than a native workbench. |
| State ≠ transcript | Kept and generalized to "status is a fold, never stored." |
| Local-first / sovereignty | Reframed. Sovereignty escape hatch is the export endpoint (sb-007), because the contract is portable — you can lift your log anywhere. |
| Provenance | Kept. Every event carries evidence with `checked_at`. |
| Perimeter honesty | Strengthened. Explicit "what this contract does NOT guarantee" section — evidence-gated trust does not equal correctness; it relocates the hallucination surface to the adequacy of the evidence references. |

---

## What was cut (in the first brick — not from the cathedral)

- **Swift 6 / SwiftUI / macOS-native app.** Deferred to a later brick. The workbench interface remains a target.
- **Twelve agent role scaffolds.** Foreclosed explicitly at sb-004: "The simulated agent roster and mock telemetry are cut from Atrium v1. Everything rendered is a projection of a real log."
- **LLM adapter framework.** Stratum does not orchestrate LLMs *yet*. The current product treats LLM output as claims to be verified, not as agents to be routed. The routing layer becomes a later brick.
- **Sandbox / OrbStack execution isolation.** Not needed at ledger scope; needed later.
- **Six-tier memory hierarchy.** Collapsed into event log + projection. The tiers may return in a later brick as *views* over the log, not as separate stores.
- **CognitiveTransaction as full schema.** Replaced for the ledger by the simpler event + evidence + claim + transition-marker model. The transaction schema is preserved in RUNTIME.md for the future runtime.
- **Sync model with four classes.** Not needed at v0.4.0 — one Durable Object per log, single-writer, no cross-device merge yet. The four-class model is preserved for when this returns.
- **Cloudflare Access as auth.** Foreclosed explicitly at sb-008: bearer token via wrangler secret gates writes and private reads.
- **Speculative execution / prewarmer.** Not needed at this product shape.
- **Branchable Reasoning Trees.** Not implemented; may re-enter later as a projection view.
- **Plugin architecture (v1.0 experimental flag).** Not shipped.
- **Vitest-in-Worker unit tests.** Foreclosed at sb-014 in favor of a live end-to-end smoke suite against the deployed API.
- **`packages/runtime` layout.** Flat npm workspaces instead — core, worker, cli, static atrium (sb-010).
- **Chronicle rename.** Moot at this brick — no Historian/Chronicle role because there's no session synthesis; the log is the record.
- **Memory Curator role.** Moot at this brick — the Durable Object is the writer.

---

## What was reframed

- **PolicyEngine → guards at one door.** The v0.2.0 vision of a single-authority permission layer collapsed into a much smaller surface: one Durable Object per log, all appends serialized in a single-threaded scope, all guards run at that one door. Same load-bearing intent (single point of authority, fail-closed, recorded), smaller physical footprint.
- **`authoritative_axiomatic` vs `authoritative_verified` split** is a version of the "policy tiers cannot loosen system tiers" idea from v0.2.0 §3.4, translated into epistemic tiers instead of permission tiers. This is a real improvement — the MEMORY_MODEL section 5 correctly notes that collapsing axiom-trust into verified was a defect: "a trust root would project as evidence-backed while having zero evidence."
- **Arbitration** is now derived from the transition system at the event's current folded status (sb-015): the UI can only offer what the guards would accept. Same "arbitration as commit gate" intuition from RUNTIME.md §10, expressed as UI derivation rather than as an explicit arbitration transaction.
- **DECISIONS.md as projection** (sb-019). The human-readable record is generated from the trace, drift-guarded in CI alongside a golden projection. This is exactly the "state continuity over transcript continuity" principle from the whitepaper §3.10 — you don't hand-edit the record because the record is a fold.

---

## What's new that wasn't in the drafts

- **The genesis-in-itself pattern.** Stratum records its own genesis decisions in itself. sb-000 (axiomatic: "launch as working prototype") through sb-019 (narrative: "the human-readable record is a projection of this trace") — the system dogfoods on its own construction. This is the sharpest expression of the philosophy in the whole product.
- **Python as semantics oracle, TypeScript as production port.** MEMORY_MODEL §10 makes the discipline explicit: "the Python is a semantics check; port the rules into `packages/runtime`." Stronger contract than v0.2.0 §14 (Determinism Contract) — semantics live in a validated reference implementation, production language must reproduce it or fail loudly.
- **The perimeter section** (MEMORY_MODEL). Directly names what evidence-gated trust cannot do: a green test can assert nothing meaningful, evidence can be checked against the wrong file, engineering judgment can be wrong. "The contract makes the log trustworthy *as a record*; it cannot make the decisions *sound*." Honest in a way most product docs never manage.
- **Playground logs per-session.** Visitors get per-session Durable Objects cloned from a curated demo seed — write-open but capped, isolated, disposable (sb-013). Solves the "how do people try this without an install" problem in a way the v0.2.0 spec never addressed.
- **Ten-event ontology with single-parent lineage.** `decision`, `foreclosure`, `invalidation`, `verification`, `supersession`, `contradiction`, `ratification`, `rejection`, `dispute`, `trust_root_revoked`. Multi-parent DAGs explicitly rejected at write time until modeled. Much smaller and more disciplined than the twelve agent roles it replaced.
- **USGS/Landsat plate aesthetic.** Fraunces / IBM Plex Mono. Section-through-the-ledger figure. The v0.2.0 spec gestured at this in §10 but never made it concrete. The live version made a real aesthetic choice.

---

## Trajectory observations

Three honest calls:

1. **The scope was cut and the spine was kept.** The v0.2.0 spec was reachable but at high cost. The first brick is reachable at low cost and does exactly one thing that no other tool does. Almost every product that tries to be a cognitive workbench collapses into "chat with better chrome"; Stratum sidestepped that trap by refusing to be a workbench at *this* brick.

2. **The MEMORY_MODEL.md that shipped is a better version of what MEMORY_MODEL.md was going to be in the drafts.** It replaces the "memory tiers with promotion policies" framing with "immutable log + fold operation," which is strictly more general and strictly cleaner. The invariant test suite (16/16) is real proof — the draft would have been aspirational text.

3. **What Stratum currently is not, and probably shouldn't rush to become in the second brick:**
   - It's not a workbench yet. If it grows into one, it'll be by other tools targeting it as a ledger, not by absorbing agent orchestration into itself.
   - It's not multi-user. Single bearer token gates writes; sync/collaboration is a future problem.
   - It's not offering primitives for the agent-orchestration layer to consume — *yet*. This is a strong candidate for the second brick: Stratum as the ledger that arbitrary agent frameworks write into. The "external cognitive bus" from v0.2.0 §19 comes back in scope, but as **ingress** rather than as **inspection**.

---

## Open questions worth resolving (candidate second-brick decisions)

- **Second brick target.** Options include: (a) making Stratum consumable as a ledger backend by [[stele]] and other tools; (b) building the first agent-orchestration layer on top of the ledger; (c) shipping the Substack essays and building the audience first while the ledger accrues real decisions; (d) integrating with [[macprobe]] to have security-event evidence flow into the ledger. Not yet decided.
- **How does Stratum consume events from AI agents?** Right now the API is `POST events`. Any agent framework — Claude Code, MCP servers, Stele — could write into Stratum as a ledger for its own decisions. Explicit design question for the next brick.
- **Sync between devices / logs.** Foreclosed for v1. The four-class sync model from SPEC v0.2.0 §12 is preserved for when this returns.
- **The trust-root registry** (MEMORY_MODEL §7) is axiom-fixed at initialization. Rotation ceremonies are described but not implemented. When Stratum gets deployed into multi-tenant contexts, this becomes load-bearing.
- **When does the workbench interface (macOS-native) become a brick?** Not now. But naming the earliest brick where it makes sense (probably after ledger-as-ingress and after the first real agent-orchestration layer prove the semantics) helps sequence the cathedral.

---

## Notable quotes

> "One MVP at a time, leveraging existing resources well, one brick at a time. I'm still going to build the cathedral, but first I need to ship the bricks."
> — Mazze, on strategy (2026-07-24)

> "Agentic systems conflate generation with authority: without an evidence ledger, a generated conclusion becomes operational truth merely because it was persisted or repeated — and every later decision inherits it."
> — stratum.mazzeleczzare.com landing

> "The instrument doesn't know the destination. It simply aligns itself with a field that is otherwise invisible. A navigator reads the instrument. A human decides where to sail."
> — stratum.mazzeleczzare.com landing

> "The contract makes the log trustworthy *as a record*; it cannot make the decisions *sound*."
> — MEMORY_MODEL.md, Perimeter section

> "Every position is a real projection computed by the reference implementation — not an animation."
> — stratum.mazzeleczzare.com, section diagram caption

---

## Actions

- [x] Update [[stratum]] memory file to reflect v0.4.0 shipped state and cathedral/brick strategic frame
- [ ] Decide the second brick target (see open questions)
- [ ] Consider archiving v0.1.0/v0.2.0 SPEC drafts under `docs/superseded/` with a pointer note explaining their carry-forward relevance to the cathedral
- [ ] File the whitepaper, RUNTIME.md, and IMPLEMENTATION.md as reference documents for the future workbench brick — mark them "cathedral-target artifacts" so future-Claude sessions know they're not obsolete, just deferred
- [ ] Consider whether the Cognitive Topology Substack series (planned) should now open with the ledger and build toward the workbench — the sequencing mirrors the brick strategy
- [ ] Draft the ingress spec for how [[stele]], [[kintsugi]], [[macprobe]], Claude Code, and MCP servers would write events into Stratum (candidate second brick)

---

## Obsidian concept graph seeds

Core concepts, ready to become notes in the graph:

- [[stratum]] · [[epistemic-decision-ledger]] · [[cognitive-workbench]] (cathedral)
- [[status-is-a-fold]] · [[append-only-log]] · [[foreclosed-option]] · [[axiomatic-vs-verified]]
- [[tessera]] (session handoff → projection at epoch)
- [[cognitive-transaction]] · [[three-clock-system]] · [[snapshot-isolation]] · [[replay-vs-re-simulation]]
- [[genesis-in-itself]] · [[perimeter-honesty]] · [[semantics-oracle-pattern]]
- [[durable-object-as-single-writer-gate]] · [[policy-engine-compressed]]
- [[usgs-landsat-plate-aesthetic]] · [[fraunces-plex-mono]]
- [[cathedral-brick-strategy]] · [[one-mvp-at-a-time]]

Cross-project ties (existing notes, if present):

- [[stele]] — AI integrity harness → candidate first ingress client for Stratum
- [[kintsugi]] — Fragility-aware tool orchestrator → candidate for logging orchestration decisions into Stratum
- [[macprobe]] — macOS security probe → candidate for logging security-event evidence into Stratum
- [[cognitive-topology-series]] — Substack essays; sequencing question flagged
- [[secure-pride]] — the operational context this all serves
- [[context-synapse]] — the local-first cognitive architecture; personal OS ambition builds on this

---

## Session context

- **Session date:** 2026-07-24 (Friday)
- **Session artifacts produced (this session, before the reshape check):** whitepaper, SPEC.md v0.1.0, IMPLEMENTATION.md, RUNTIME.md, SPEC.md v0.2.0, SPEC-DELTA-v0.2.0.md
- **Session artifact produced (this analysis):** this file, `stratum-reshape-analysis-v0.4.0.md`
- **Live product state at time of analysis:** v0.4.0 at stratum.mazzeleczzare.com; MEMORY_MODEL.md rev 3; 16/16 invariants passing; genesis trace sb-000 through sb-019 visible in the landing section diagram
- **Reviewer chain in this session (external):** four review rounds compressed into the drafts; the shipped product superseded most of them; a fifth round would be premature — the next honest review point is when the second brick candidate is chosen

---

*This document is itself a projection of a session. It should be filed under `stratum/analyses/` in the Obsidian vault. If Stratum-the-ledger were used to record this session's decisions, this file would be one of its outputs.*
