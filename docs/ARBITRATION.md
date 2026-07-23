# ARBITRATION.md — precedent, and how it should decay

**Status:** Research draft — open questions forward, one design leaning
**Date:** 2026-07-23
**Posture:** RESEARCH — this is exploration, not a contract. Nothing here is normative.
**Relates to:** `ARCHITECTURE-EVALUATION.md` §5; `MEMORY_MODEL.md` §4, §6, §7; paper §3.8, §8.4; README research agenda #2

> **The problem in one sentence.** Recorded arbitrations become precedent, and
> precedent that never decays silently steers current decisions using reasoning
> nobody has re-examined — which is the cognitive-debt analogue of exactly the
> drift this system exists to prevent.

---

## 1. What precedent is, here

When two agents produce contradictory outputs, or when stakes exceed an
automated threshold, a human arbitrates and the arbitration is recorded
(paper §3.8). The recorded outcome is then available as *precedent* for
similar future decisions — this is what stops the system from re-escalating
the same question forever, and it is genuinely valuable.

It is also a trap, and worth naming the trap precisely rather than gesturing
at it. Precedent has a property no other record in this system has: **it is
consulted as authority for questions it was never asked.** A decision event
answers its own question and stops. A precedent answers its own question and
then keeps answering adjacent questions, indefinitely, by analogy — and the
analogy is drawn by whatever queries it, not by whoever made it.

That is the whole difficulty. Not staleness in the ordinary sense (the world
changed, the decision is now wrong), but **scope creep in the retrieval
path**: a narrow ruling accreting breadth every time something similar-looking
matches it.

## 2. Why the existing contract does not already solve this

A reasonable first reaction: the event contract already has supersession,
contradiction, dispute, and invalidation — why isn't precedent decay just
supersession?

Because those markers all require **someone to notice**. `supersession` needs
an author who knows the prior ruling exists and judges it replaced.
`invalidation` needs someone to identify the specific evidence that fell over.
Both are *active* corrections, and they work well for decisions that announce
their own relevance — you go to change the thing, you see the record.

Precedent fails differently: it is consulted *without being visited*. A
retrieval scores it as relevant, it shapes an answer, and no author ever opens
it to ask whether it still holds. The correction mechanisms in the contract
are author-triggered; the failure mode is reader-triggered. That mismatch is
the actual gap, and it is why "just use supersession" is not the answer.

Note also what the contract does give us, which is more than it looks:
`MEMORY_MODEL.md` §6 derives *under review* rather than storing it, so review
state has no cleanup actor. Any decay design should preserve that property —
if decay becomes a stored, mutable field that something has to sweep, it has
reintroduced precisely the class of bug the fold eliminated.

## 3. Three candidate mechanisms

### A. Half-life — precedent weight decays with time

Precedent carries a weight that falls off on a time constant; below a floor it
stops being offered as precedent and the question re-escalates.

**For:** trivially simple; needs no new events; matches the intuition that old
rulings deserve less deference.

**Against:** time is a **proxy for the thing that actually matters, and a poor
one**. A ruling about a dependency's licence may be as valid in three years as
today; a ruling about a fast-moving API may be obsolete in three weeks. Decay
by wall-clock also sits badly with a contract that deliberately ignores
wall-clock in every projection path (`MEMORY_MODEL.md` §2 — ordering is by
logical `seq`; `timestamp` is metadata). Introducing time as authority here
would be the one place the system trusts a clock, which is a real
inconsistency and not a small one.

### B. Citation-scoped decay — precedent weakens as it is stretched

Precedent stays fully authoritative for the question it answered, and weakens
as a function of **distance from that question** — how far the invoking
context sits from the arbitrated one.

**For:** targets the actual failure (scope creep in retrieval), not a proxy.
Keeps a narrow ruling narrow forever, which is correct. Nothing decays while
it is used for what it was decided for.

**Against:** requires a distance metric over decision contexts, and that metric
is doing enormous load-bearing work. Embedding similarity is the obvious
candidate and the obvious hazard: it would make an *authority* boundary depend
on a stochastic model, in a system whose whole thesis is that authority must
be mechanically checkable. That is not a detail to hand-wave.

### C. Re-ratification on invocation — precedent expires into a question

Precedent does not decay continuously. When invoked beyond some threshold —
of distance, of invocation count, of elapsed epochs — it converts back into an
open question requiring a fresh human ratification, which is recorded as a new
event targeting the old one.

**For:** uses machinery that already exists (`ratification` events, single-parent
lineage, the revision chain). Decay becomes an *event*, not a stored decaying
field, so it stays inside the append-only discipline and stays projectable.
Failure mode is escalation — a human gets asked — which is the safe direction
for a system with a human arbitration tier.

**Against:** the threshold is still a tunable nobody has calibrated, and set
wrong it either re-escalates constantly (the human becomes the orchestration
layer again — paper §2.8, the failure mode this architecture exists to avoid)
or never fires and we are back to A doing nothing.

## 4. Where this leans

**C, with B's distance notion as the trigger rather than as a continuous
weight, and explicitly not A.**

The reasoning: decay should produce **events, not decaying numbers**. A stored
weight silently ticking toward a floor is unauditable — you cannot ask it
"why is this precedent weak today?" and get an answer that traces to anything.
A re-ratification event is a fact in the log, with an author, and it projects
like everything else. This keeps the property `MEMORY_MODEL.md` §6 established:
state is derived from events, never swept by a background actor.

B's distance notion earns its place as a *trigger* rather than a weight,
because a trigger's errors are bounded (it fires or doesn't, and firing costs
one human question), whereas a continuous weight's errors are unbounded and
invisible — it silently ranks. If the metric is stochastic, use it where the
worst case is "asked a human unnecessarily," never where the worst case is
"quietly deferred to stale authority."

A is rejected as the primary mechanism for the wall-clock inconsistency in §3.
It might survive as a *backstop* — some absolute horizon past which anything
re-ratifies regardless — precisely because a backstop's failure mode is also
escalation.

**Confidence: low-to-moderate.** This is reasoned from the contract's existing
commitments, not from evidence. No precedent has actually gone stale in this
system yet, because the system has not run long enough to have any. The
argument could be wrong in a way that only a real stale-precedent incident
would reveal.

## 5. What would resolve this

Not more reasoning. Specifically:

1. **A real corpus of arbitrations.** There are currently none. Until
   arbitrations exist, every threshold here is invented. The dogfooding
   discipline is what generates this corpus.
2. **At least one observed staleness incident** — a precedent that demonstrably
   steered a decision it should not have. One real case would discriminate
   between A, B, and C faster than any amount of argument, because it would
   show *how* the thing actually goes wrong.
3. **A calibration for the distance metric**, if B's trigger survives: over
   real invocation pairs, how often does the metric agree with a human asked
   "is this the same question?" A metric that disagrees with humans is not a
   trigger, it is a random escalator.
4. **A cost measurement**: how often re-ratification fires per unit of real
   work, since the entire value of precedent is not re-asking, and a mechanism
   that re-asks constantly has destroyed the thing it was protecting.

## 6. Open questions

1. Does precedent decay at all if nobody ever invokes it? (Under C: no — and
   that is arguably correct. Unconsulted precedent harms nothing.)
2. Can precedent be *strengthened* by repeated consistent invocation, or is
   that just entrenchment wearing a nicer name? Common law says the former;
   the drift argument says the latter. Unresolved, and the asymmetry matters:
   strengthening is much harder to undo than weakening.
3. Who authors the re-ratification event — the human who answers, or the
   system that escalated? Affects `agent_id` semantics and therefore what the
   authority tier of the result should be.
4. Does a re-ratified precedent supersede the original, or do both stand with
   the chain recorded? (`MEMORY_MODEL.md` I2 says supersession never deletes
   and the projection renders the revision chain — so probably both stand.)
5. Multi-parent lineage: an arbitration that reconciles *two* prior precedents
   is a diamond, and diamonds are rejected at write time in v1
   (`MEMORY_MODEL.md` §4). Precedent reconciliation may therefore be blocked on
   the multi-parent extension — worth confirming, because if so it is a
   dependency nobody has drawn yet.
