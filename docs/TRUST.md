# TRUST.md — capability authority and the policy gate

**Status:** Skeleton — frames open questions, resolves two
**Date:** 2026-07-23
**Relates to:** `ARCHITECTURE-EVALUATION.md` ADR-002 and §5; `MEMORY_MODEL.md` §7 (Trust-Anchor); README research agenda #1

> **What this document is.** ADR-002 and the evaluation's §5 both point here for
> three things: the intra-tier tie-break, the negative-test ship gate, and the
> capability ontology. The first two are decidable now and are decided below.
> The third is the make-or-break usability question for a deny-by-default
> system and is **not** decided here — §3 frames it honestly rather than
> inventing an answer to make this document look finished.
>
> Scope note: the PolicyEngine described here belongs to the agent runtime
> (v0.2.0 SPEC), which is not committed to this repository. What *is* here is
> the event contract (`MEMORY_MODEL.md`), which already implements the same
> trust discipline for a narrower question. §4 draws the line between them.

---

## 1. The regress, and where it bottoms out

Every trust system relocates its axiom; none eliminates it. `MEMORY_MODEL.md`
§7 states this for the event contract: a trust root is `authoritative_axiomatic`
— authority-declared, carrying no evidence, because evidence is precisely what
it is the origin of. Quorum does not escape the regress either; it relocates it
into key management and PKI.

The honest position is therefore not "no axioms" but **axioms are visible,
enumerated, and separately tiered**. Keeping `authoritative_axiomatic` distinct
from `authoritative_verified` is the mechanism: a reader can always ask which
authoritative facts were *checked* and which were *declared*, and get different
answers. Collapsing those two tiers would make the system look stronger and be
weaker.

The policy gate inherits this. Its rules are declared, not derived; the
authority to declare them is axiomatic; what the system owes its user is that
the declaration is legible and every decision made under it is recorded.

## 2. Resolved: intra-tier contradiction resolves deny-wins

**Rule.** When two rules of equal precedence within the same tier contradict,
the deny wins.

Cross-tier composition already uses intersection semantics (a permission must
survive every tier). Deny-wins is the within-tier analogue, so the two compose
without a special case: at no point does adding a rule widen a grant.

This was previously inferable from fail-closed but unstated, which is not the
same thing. Fail-closed describes behaviour under *error*; this describes
behaviour under a *well-formed disagreement between valid rules*. Left
unstated, that case resolves by rule ordering — that is, by accident of
authoring order, which is exactly the kind of invisible determinism the
architecture exists to eliminate.

**Ship gate.** Negative tests — an action that *must* be denied, asserted to be
denied — are a hard gate, not advisory. A false-deny bug blocks legitimate work
and a false-allow bug is a security defect; only negative tests catch the
second class. Precedent for treating this as hard rather than advisory already
exists in this repo: the contract's own negative test (a projection field with
no backing event must raise `IncompleteProjection`) runs in CI in both
implementations, so a dropped event fails the build rather than degrading
silently.

## 3. Open: capability ontology granularity

**The question.** At what granularity is a capability named?

```
networkEgress                          # coarse
networkEgress(host)                    # medium
networkEgress(host, method, path)      # fine
```

**The trade, stated plainly.** Too fine and policy authoring becomes a burden
no human maintains correctly — and an unmaintained deny-by-default policy is
either bypassed wholesale or accreted into a permanent allow. Too coarse and
grants leak: `networkEgress` as a single capability means permission to reach a
package registry is permission to reach an exfiltration endpoint.

This is the make-or-break usability decision for the whole PolicyEngine. A
deny-by-default system is only as good as the legibility of its rules, and
legibility is a property of the ontology, not of the engine.

**What would resolve it.** Not more reasoning — evidence. Specifically:

1. A corpus of the capability requests real workflows actually make (this repo's
   own traces are a start, and the dogfooding discipline is what generates it).
2. For each candidate granularity, the count of distinct rules a realistic
   project would need to author, and how many a human gets *right* unaided.
3. The leak analysis at each level: for a grant at granularity *g*, what else
   does it transitively permit?

**Provisional lean, held loosely.** Granularity should probably vary by
capability class rather than being uniform — filesystem writes want path
scoping because the blast radius is path-shaped, while a clock read wants none.
A uniform granularity is a simplification the domain does not support. This is
a hypothesis to be tested against (1)–(3), not a decision.

**Explicitly not decided here:** the ontology itself, its serialization, and
whether capabilities compose (does `networkEgress(a.com)` plus
`networkEgress(b.com)` equal a rule set or a lattice element?).

## 4. What this repo already implements, and what it does not

Drawing the line precisely, because the two are easy to conflate:

| Concern | Where it lives | Status |
|---|---|---|
| Is this *decision* authoritative? | `MEMORY_MODEL.md` + `core/`, `reference/` | **Implemented** — four tiers, evidence-gated, fail-closed |
| Who may *declare* a trust root? | `MEMORY_MODEL.md` §7 | Implemented as an axiom, deliberately |
| May this *agent* take this *action*? | PolicyEngine (v0.2.0 SPEC, not in this repo) | **Not implemented here** |
| At what granularity are actions named? | This document, §3 | **Open** |

The event contract is not a policy engine and does not pretend to be. It
answers a narrower question — *what may be believed* — and answers it
mechanically. *What may be done* is the policy gate's question, and the gate
does not exist in this repository yet.

## 5. Open questions

1. Capability ontology granularity (§3) — the blocking one.
2. Does the authority registry become an instance of this same contract —
   append-only, quorum-gated, epoch-pinned, bottoming out at a versioned genesis
   authority set? The README research agenda proposes this, and it is
   attractive because it would make the trust root's *own* history auditable by
   the same machinery. Unresolved: whether that recursion terminates cleanly or
   merely relocates the regress one more time, which is the same question §1
   raises and does not close.
3. Integration with Stele (policy governance) signing `policy_authority`
   evidence — named as a target, unspecified.
4. Capability *revocation*: `trust_root_revoked` exists in the event ontology,
   but the policy-gate analogue (a grant withdrawn mid-session, with in-flight
   actions already authorized under it) is unspecified.
