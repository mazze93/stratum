# Stratum v0.2.0 — Architecture Evaluation

*Evaluation of `SPEC.md` (v0.2.0) + `SPEC-DELTA-v0.2.0.md` against `cognitive-architecture-paper.md` and the four load-bearing critiques raised in prior review.*

**Status:** Review
**Date:** 2026-06-20
**Reviewer scope:** design soundness, prior-critique closure, open decisions
**Posture:** HIGH — systems infrastructure. Compliance surface touches policy, libsodium crypto, local-first egress, WCAG 2.1 AA. ARCHITECTURE checklist applied; findings in §6.

---

## 0. Status addendum — 2026-07-23

*The body of this document is the assessment as written on 2026-06-20 and is left standing; this section records what has changed since, in the same spirit as the contract it evaluates — supersede, don't mutate.*

- **ADR-001 (Tessera fidelity) — now Accepted and implemented.** §1's "one remains open" and §2's `Open` row for *Tessera/Chronicle is an unguarded compression point* were accurate on 2026-06-20 and are **superseded**: Option C shipped in both implementations, and B's trace-check is a hard CI gate. One of its four action items (Chronicle role re-scope) remains deferred — see §3.
- **ADR-002 intra-tier tie-break — resolved:** deny-wins, now stated normatively in §4 and `TRUST.md` §2.
- **`TRUST.md` and `ARBITRATION.md` now exist** as skeletons carrying the open questions §5 assigns them. They frame the questions; they do not answer them. Capability-ontology granularity and precedent decay both remain open research.
- **Unchanged and still open:** the cost model / assurance-tier principle (§5), branch-merge conflict resolution per tier (§5), and the relevance-scoring weights gap (§6).

## 1. Verdict

The design is sound and unusually disciplined — it is closer to an operating-system spec than to an app spec, which is the correct register for the thesis. The v0.2.0 delta is a genuine improvement, not a feature pile: it closed two of the four load-bearing gaps from prior review (determinism, negative-space/scope) and did so structurally rather than cosmetically. One gap is **partially** closed (role/topology cost) and **one remains open** (Tessera fidelity). The single new architectural commitment — the PolicyEngine as a synchronous gate on every dispatch — is the right call, but it concentrates risk in a way worth recording explicitly (ADR-002).

Net: ship-worthy as a v1.0 contract once ADR-001 is resolved. The remaining items are real but tractable and most are already named in your own forward-pointer docs (§5).

---

## 2. How v0.2.0 answers the prior critique

| Prior critique | Status in v0.2.0 | Where |
|---|---|---|
| **Determinism was shaky** — deterministic routing sitting on a stochastic memory tier | **Closed** | §14.2 + Context Epoch (RUNTIME §6) + policy snapshot pinning §7.1/§17.4 |
| **Negative space / non-goals underspecified** | **Closed & strengthened** | §10 constitutional system policies; §19 "Permanently out of scope"; §12.3 four hard rules |
| **Role taxonomy may violate its own cognitive-load principle** | **Partially closed** | §18 narrows to 12 in-tree reference plugins |
| **Tessera/Chronicle is an unguarded compression point** | **Open** | §9.4, §15 — generation-failure gate only, no fidelity check |
| *(bonus)* **No cost model: when is full topology worth it?** | **Open** | gestured at by §8.6 verification chains "high-assurance only," not formalized |

**Determinism — closed, and elegantly.** My earlier objection was that "same input → same routing" is incoherent when the Memory Curator mutates state stochastically. The Context Epoch (a memory version vector captured at context assembly) plus per-transaction `policySnapshot` pinning dissolves it: routing now reads a *pinned* version vector, not live memory, so determinism is over a frozen snapshot rather than a moving target. The Inspector's "non-authoritatively replayable" flag for incomplete records (§14.2) is exactly the right honesty mechanism. This is the strongest part of the delta.

**Negative space — exemplary.** The constitutional/system-policy tier ("cannot be loosened by any other policy tier"), the explicit "Permanently out of scope" list, and the four never-rules in §12.3 are precisely the foreclosing discipline the paper preaches in §3 and the prior review asked for. The "intersection of permissions" resolution rule is the correct lattice semantics for a tiered policy system.

**Role/topology — narrowed, not reduced.** Restricting v1.0 plugin loading to the twelve in-tree reference roles is good *scope* discipline (it shrinks the trust boundary), but it does not reduce the *runtime* role count, which was the substance of the cognitive-load concern. The concern was always about the human's surface area, not the package boundary — so it now lives in the UX layer (§4 Atrium / §7.x of the paper) rather than the architecture. Acceptable resolution: the architecture commits to twelve scaffolds; whether the *human* must see twelve is a separable UX decision. Recommend stating that separation explicitly so the role count is not later cited as architectural bloat.

**Tessera fidelity — still open.** See ADR-001. This is the one critique the delta did not touch, and it is the highest-leverage remaining item because the Tessera is the system's load-bearing artifact: everything in §8.7 ("the transcript is never the relay") routes through it.

---

## 3. ADR-001: Tessera fidelity verification

**Status:** **Accepted — implemented** (was Proposed; accepted 2026-07-23)
**Date:** 2026-06-20 · accepted 2026-07-23
**Deciders:** Stratum architecture owner; Chronicle + Memory Curator role owners
**Relates to:** SPEC §9.4, §15, §6.6 (paper); MEMORY_MODEL.md rev 3 (§5, §8)

> **Acceptance note (2026-07-23).** Option C is not merely chosen — it is the design both implementations now ship. Authoritative Tessera fields are projections over the append-only log (`reference/tessera_projection.py`, `core/src/projection.ts`); prose fields are segregated in a `narrative_only` block and are never canonical. B's trace-check was retained as recommended and is a hard CI gate. Action item 4 is **not** done and is not counted as done — see below.

### Context

The Tessera is canonical handoff state (§8.7, paper §3.10): agents, humans, and tools read it on resume *instead of* replaying the transcript. The Chronicle agent generates it via LLM compression at session close. The spec guards **generation success** — "Tessera generation failure → block session close as blocking arbitration" (§15) — but never guards **generation fidelity**. A Chronicle that successfully emits a *plausible but wrong* Tessera (drops a foreclosed option, softens a reversibility flag, hallucinates a decision) passes every existing gate and then becomes the authoritative input to the next session.

This is the same failure class the architecture eliminates everywhere else through adversarial separation (§9.3 paper, Critic/Verifier independence) — except here, at the most load-bearing artifact, the producer is also the last word. The whole system's pitch is "no unguarded single points of failure in cognition"; the Tessera is currently one.

### Decision

Make the Tessera's **authoritative fields projections of the append-only episodic graph**, and reserve LLM generation for its **non-authoritative prose fields** only. Add an independent verification pass as the gate.

### Options considered

#### Option A: Status quo — generation-success gate only
| Dimension | Assessment |
|---|---|
| Complexity | Low (already specified) |
| Cost | Zero added |
| Fidelity guarantee | **None** — distinguishes "produced" from "correct" not at all |
| Replay consistency | Weak — a generative Tessera is non-deterministic, contradicting §14.2 |

**Pros:** nothing to build. **Cons:** leaves the central artifact unguarded; a wrong-but-well-formed Tessera silently poisons the next session.

#### Option B: Independent Verifier pass over the Tessera
A Verifier-class agent (different scaffold from Chronicle) checks the generated Tessera against the episodic graph before it is trusted: every `recent_decision` and `foreclosed_option` in the Tessera must trace to an episodic event; events of decision-class above a threshold must appear in the Tessera.

| Dimension | Assessment |
|---|---|
| Complexity | Medium — new check, reuses Verifier role |
| Cost | One extra read-only agent pass per session close |
| Fidelity guarantee | Good — catches omission and fabrication |
| Replay consistency | Improved, but the Tessera is still generatively produced |

**Pros:** consistent with existing adversarial-separation pattern; cheap (read-only). **Cons:** verifies a generative artifact rather than removing the generation; the prose fields remain unverifiable by construction.

#### Option C: Projection + bounded generation (recommended)
Split the Tessera schema by authority. **Authoritative fields** — `recent_decisions`, `foreclosed_options`, `artifacts_produced`, `active_spec`, `open_questions.blocking` — are *derived mechanically* as a projection (query + format) over the append-only episodic graph, which §12.1 already classifies as conflict-free and authoritative. **Non-authoritative prose fields** — `current_goal`, `next_action`, `warnings` (one-sentence human-facing summaries) — are LLM-generated and explicitly marked non-canonical, exactly as the transcript is non-canonical.

| Dimension | Assessment |
|---|---|
| Complexity | Medium — schema split + projection query; Chronicle's job shrinks |
| Cost | Lower steady-state — most fields stop costing a model call |
| Fidelity guarantee | **Strong** — authoritative fields cannot be hallucinated; they are projections |
| Replay consistency | **Strong** — projection is deterministic; fits §14.2 directly |

**Pros:** dissolves the failure mode instead of guarding it — if the authoritative fields are projections of an append-only graph, there is nothing to fabricate. Makes the Tessera deterministic and therefore replayable. Reduces model cost. **Cons:** requires the episodic graph to be rich enough to project from (it should be — §9.1 already stores decisions, ratifications, arbitrations as structured events); shifts work from Chronicle to the event-emission discipline upstream.

### Trade-off analysis

B guards the artifact; C removes the need to guard it. C is more in the spirit of the architecture: §3.10 (paper) already says *state is canonical, narrative is a log* — Option C simply applies that same rule *inside* the Tessera, splitting it into a canonical projection and a narrative gloss. The only real cost of C is upstream: it forces episodic event emission to be complete enough that the projection is lossless, which is a discipline you want anyway. Recommend **C as the design, with B's trace-check retained as a cheap CI invariant** ("every authoritative Tessera field traces to an episodic event") to catch projection bugs.

### Consequences

- **Easier:** Tessera replay determinism (now a projection); Chronicle prompt-regression surface shrinks to three prose fields; the §AC #9 "explainable provenance" claim extends cleanly to the Tessera.
- **Harder:** episodic event emission becomes load-bearing — under-emission now silently truncates the projection. Needs its own property test (paper §9.3 territory).
- **Revisit:** the Chronicle role description (§4.9 paper) should be re-scoped from "compress the session" to "project authoritative state and summarize the rest." This is arguably a third mechanical rename candidate after Historian→Chronicle.

### Action items
1. [x] Split the Tessera schema (§6.6 paper) into `authoritative` and `narrative` blocks — projections emit `authoritative` (`recent_decisions`, `foreclosed_options`) and `narrative_only` (`current_goal`, `next_action`, `warnings`). `reference/tessera_projection.py:348`, `core/src/projection.ts`.
2. [x] Specify the episodic→Tessera projection query in MEMORY_MODEL.md — MEMORY_MODEL rev 3 is that specification: §2 (status as a fold), §5 (the four projected authority tiers), §8 (fail-closed on incompleteness).
3. [x] Add the trace-check invariant to §16 testing — `require_authoritative()` raises `IncompleteProjection` when a field has no backing event. Tested **both** directions in both implementations: positive resolve and negative ghost-id raise (`reference/test_tessera_projection.py:258-261`, `core/test/invariants.test.ts:306`). Runs in CI via `npm test` + `npm run test:reference`, so a dropped event does fail the build.
4. [ ] **Re-scope the Chronicle role contract — deferred, not done.** The Chronicle/Historian role lives in `cognitive-architecture-paper.md` §4.9 and the v0.2.0 SPEC, neither of which is committed to this repository; there is no agent-runtime role contract here to edit. Deferred to whichever repo carries the role definitions. Recording it as deferred rather than checked is the point: the projection design landed, the role's *description* of itself did not follow it.

---

## 4. ADR-002: PolicyEngine as a single synchronous gate

**Status:** Accepted (recording a decision already made in v0.2.0)
**Date:** 2026-06-20
**Deciders:** Stratum architecture owner
**Relates to:** SPEC §3.4, §8.2, §5 (latency), §17.4; TRUST.md (pending)

### Context

v0.1.0 scattered permission logic across `toolAllowlist` (§8), security defaults (§10), and plugin manifests (§18). v0.2.0 consolidates all capability decisions into one component evaluated synchronously before every dispatch, under a <1ms budget. This is the central structural move of the delta. It was made without a recorded alternatives analysis; this ADR supplies one so the decision is auditable later.

### Decision

A single PolicyEngine adjudicates every capability-bearing action, deny-by-default, fail-closed, recorded, deterministic, on the synchronous dispatch path.

**Intra-tier tie-break (added 2026-07-23):** when two rules of equal precedence *within the same tier* contradict, **deny wins**. This is stated normatively rather than left to be inferred from fail-closed, because "fail-closed" describes behaviour on *error* while this describes behaviour on *a well-formed disagreement* — a different case that would otherwise be resolved by rule ordering, i.e. by accident. Cross-tier precedence remains intersection semantics; deny-wins is its within-tier analogue, so the two compose without a special case.

### Options considered

#### Option A: Single synchronous gate (chosen)
**Pros:** one place to answer "may this role, in this state, use this capability?"; trivially recordable and replayable (decisions join the determinism contract §14.2); intersection semantics give clean tier composition. **Cons:** a chokepoint on every dispatch; its own bugs deny *legitimately* requested capabilities; correctness now depends on the <1ms budget holding.

#### Option B: Distributed per-surface enforcement
Each surface (Curator, Sandbox, tools) enforces its own rules.
**Pros:** no central latency tax; locality. **Cons:** *this is exactly the v0.1.0 problem* — permission logic leaks across runtime/tools/agents/plugins, no single audit point, no coherent replay of "why was this allowed." Rejected.

#### Option C: Capability-token model (object-capability)
Agents hold unforgeable tokens minted at dispatch.
**Pros:** strong isolation; well-studied. **Cons:** minting authority still centralizes the *decision* (so it doesn't avoid A's chokepoint), while making central *recording* harder because enforcement is decoupled from decision. Worse fit for the "every decision explainable in the Inspector" contract (§AC #9). Rejected for v1.0; revisit if plugin isolation in v1.1 needs it.

### Trade-off analysis

The decision trades distributed resilience for centralized auditability, and auditability is the product's whole trust thesis (§2.1, §AC #9), so the trade is correct. The chokepoint risk is mitigated by three existing provisions: the <1ms budget (§5), policy-decision recording in the determinism contract (§14.2), and positive+negative rule tests as a ship gate (§16.3). Fail-closed is the right default for a security gate.

### Consequences

- **Easier:** auditing, replay, and the "no silent capability use" guarantee.
- **Harder:** the PolicyEngine is now correctness-critical for *availability*, not just security — a false-deny bug blocks legitimate work. The §16.3 negative tests are load-bearing, not optional.
- **Revisit / gap:** the spec specifies cross-tier precedence (intersection) but **not the intra-tier tie-break** — two equal-precedence rules within the same tier that contradict. Fail-closed implies deny-wins, but that should be stated, not inferred. Flag for TRUST.md.

### Action items
1. [x] State the intra-tier contradiction tie-break explicitly — **done 2026-07-23**, deny-wins, stated under Decision above and restated normatively in `TRUST.md` §2.
2. [ ] Confirm §16.3 negative-test coverage is a hard ship gate, not advisory. *(Open for the PolicyEngine, which does not exist in this repo. Note the precedent: the contract's own negative tests — a dropped backing event must raise `IncompleteProjection` — are already a hard CI gate in both implementations, so the pattern is established, not merely proposed.)*
3. [ ] Define the `Capability` ontology granularity in TRUST.md (see §5). *(Framed as the open question in `TRUST.md` §3 — 2026-07-23. Framing is not resolution; the ontology itself remains undecided.)*

---

## 5. Remaining open decisions

These are real but bounded, and most are already named in the delta's §8 forward pointers. Listed by where they should be resolved.

**MEMORY_MODEL.md — branch-merge conflict resolution per tier.** §8.2 (branch-per-agent) and §12.1 (per-tier sync classes) interact but aren't reconciled for the *concurrent-Executor* case: two Executors on disjoint files (§8.3 permits this) whose work implies conflicting *semantic* promotions. Semantic is arbitration-class on sync but the in-process concurrent case isn't specified. Needs a per-tier merge rule, not just a per-tier sync class.

**TRUST.md — capability ontology granularity.** Too fine (`networkEgress(host)`) and policy authoring becomes a burden no human will maintain correctly; too coarse and grants leak. This is the make-or-break usability decision for the whole PolicyEngine — a deny-by-default system is only as good as the legibility of its rules. Plus the intra-tier tie-break from ADR-002.

**ARBITRATION.md — precedent weighting and decay.** Recorded arbitrations become precedent (paper §3.8), but there is no decay or override model. Stale precedent silently steering current decisions is the cognitive-debt analogue of the drift the system exists to prevent. Needs an explicit precedent half-life or supersession rule.

**Cost model — the missing "when full topology" principle.** Still unaddressed across both versions. The architecture's load-bearing assumption is *orchestration cost < drift cost*, which is true for high-assurance work and false for a 20-minute fix. Recommend formalizing as a per-workflow **assurance tier** declared in `*.workflow.yaml` (§17.3 already versions workflows) — e.g. `assurance: high` invokes the full verification chain (§8.6), `assurance: low` runs Executor→Verifier only. This turns an implicit judgment into a declared, auditable property and stops the topology from taxing trivial work.

---

## 6. Architecture checklist findings

Scoped to the project's ARCHITECTURE checklist; passing items omitted.

- **Async/sync boundary explicit:** ✅ Strong. The PolicyEngine gate is declared synchronous with a budget (§5); LLM adapters are explicitly streaming/async (§17.1); the Curator-only write boundary is stated (§9.3).
- **Math assumptions documented:** ⚠️ The relevance-scoring weights (`w_sim, w_rec, w_sal, w_pin`, paper §6.9) are presented as tunable but ship with no defaults, no tuning method, and no statement of what failure looks like if mis-weighted. For a retrieval system this is a silent-quality knob. Document defaults and a calibration procedure, or flag it as an explicit open parameter.
- **Foreclosed options flagged:** ✅ Exemplary — §19, §12.3, constitutional policies.
- **Non-scope documented with rationale:** ✅ Exemplary — "Permanently out of scope" with reasons.

---

## 7. One-paragraph summary

v0.2.0 is a strong, honest spec that closed the determinism and negative-space gaps structurally and made the right central bet on a single auditable policy gate. Resolve ADR-001 (make the Tessera's authoritative fields projections, not generations — it dissolves the last unguarded compression point and is *more* in the spirit of "state is canonical, narrative is a log" than a guard would be), record ADR-002's intra-tier tie-break, and convert the implicit orchestration-cost judgment into a declared per-workflow assurance tier. The three forward-pointer docs (MEMORY_MODEL, TRUST, ARBITRATION) carry the rest, and you already named them.
