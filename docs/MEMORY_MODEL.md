# MEMORY_MODEL.md — Event Epistemic Contract (fragment, rev 3)

*Projection layer beneath the Tessera. Validated by an executable reference —
`tessera_projection.py` + `test_tessera_projection.py`, 16/16 invariants,
replay proven by an actual serialize→reload→reproject round-trip. The Python
is a semantics check; port the rules into `packages/runtime`.*

**Numbering note — resolved.** The Event Epistemic Contract was drafted as
"ADR-002," colliding with ADR-002 (PolicyEngine concentration) in the
architecture evaluation. Resolution recorded as genesis event `sb-009`
(see `docs/DECISIONS.md`): this contract keeps its MEMORY_MODEL identity
rather than an ADR number, ADR-001 and ADR-002 keep theirs, and new ADRs
start at ADR-003. Nothing is renumbered.

**What rev 3 fixed (two review rounds):** status is no longer a mutable field
(it is a fold), verification is a logged event (not a side effect), review is
derived (not a stored flag), the ontology now covers the whole status space,
quorum counts only *checked* signatures, axiom-trust and evidence-trust are
separate tiers, and replay is proven across a real serialization boundary.

---

## 1. Two field groups per event — never merged

Every event carries disjoint `evidence[]` (checkable: file hash, test exit,
diff SHA, signed approval, sensor, policy-authority signature) and `claim`
(LLM prose, never authoritative). A reference is not a verification:
`evidence.checked_at == null` means *cited, not checked*, and only checked
evidence counts — everywhere, including quorum (§7).

## 2. Status is a fold over the log, not a mutable field

**This is the load-bearing correction.** An event is immutable once appended.
Its status at a projection epoch is computed:

```
status_at(event, epoch) = fold( birth_status,
                                transition-markers targeting event with seq ≤ epoch,
                                ordered by logical seq )
```

A marker's *type* determines its effect, so the destination status is
recoverable from the persisted log alone — it is never passed at runtime and
never stored as derived state on the event. Consequences:

- Projection is a pure function of the log at an epoch. Wall-clock `timestamp`
  is metadata and is ignored by every projection path; ordering is by logical
  `seq` only. (This is what makes async verification safe — §6.)
- Replay is well-defined and **proven by round-trip**, not asserted: serialize
  → JSON → clean `load_log` (which re-runs all guards) → reproject → identical.
  A corrupt persisted log fails *on load*, not silently in projection.

## 3. Status space is a labeled transition system (not a lattice)

No meet/join; guarded edges; cycles; terminal sinks. Every edge must be
**driveable by a marker type** or the fold is underdetermined — the contract
test `test_ontology_covers_status_space` enforces this and already caught one
phantom edge (`asserted → pending_evidence`, which had no marker; removed).

| From | Marker → To | Marker type |
|---|---|---|
| `asserted` | `ratified` / `disputed` | ratification / dispute |
| `pending_evidence` *(entry-only status)* | `validated` / `rejected` / `disputed` | verification / rejection / dispute |
| `validated` | `contradicted` / `superseded` | contradiction / supersession |
| `contradicted` | `ratified` | ratification (human re-open) |
| `ratified` | `contradicted` | trust_root_revoked (quorum, §7) |
| `disputed` | `validated` / `rejected` | verification / rejection |
| `superseded`, `rejected` | — | terminal |

`pending_evidence` is reached only as a *birth* status; nothing transitions
into it. **I1:** a claim cannot reach `validated` without ≥1 *checked*
evidence reference on its verification marker. **I2:** `contradicted` /
`superseded` never delete; the projection renders the revision chain.

## 4. Event ontology — ten types

`decision`, `foreclosure` (originating); `invalidation` (evidence-scoped);
`verification`, `supersession`, `contradiction`, `ratification`, `rejection`,
`dispute`, `trust_root_revoked` (transition markers). *(Rev 2 listed eight and
silently used `rejection`/`dispute` in code — now reconciled.)*

Lineage is **single-parent** in v1: an originating event has ≤1 `targets`
entry (its revision parent); transition/invalidation markers target exactly
one id. Multi-parent DAGs (diamonds) are an explicit extension and are
**rejected at write time** until modeled — the chain/depth walks assume single
lineage and must not silently mis-measure a diamond.

## 5. Three projected authority tiers — plus a fourth for axiom-trust

| Tier | Source | Meaning |
|---|---|---|
| `authoritative_verified` | `validated` | trusted because **evidence was checked** |
| `authoritative_axiomatic` | `ratified` | trusted because an **authority declared it** (trust root / human ratification) — carries no checked evidence by nature |
| `authoritative_provisional` | `pending_evidence`, or under review | projected, not yet canonical |
| `narrative` | `claim` text, bare `asserted` | LLM gloss; never canonical |

Collapsing axiom-trust into `verified` was a real defect: a trust root would
project as evidence-backed while having zero evidence. Keeping `axiomatic`
distinct makes the system's reliance on declared authority **visible in every
projection** rather than hidden — which is the §Trust-Anchor point made honest.

## 6. Review is derived; invalidation is first-class

An event is *under review* iff a **live** `invalidation` (one not itself
`contradicted`/`superseded`/`rejected`) targets evidence it depends on, at the
epoch. There is no stored `review_pending` flag. Therefore overturning the
invalidation clears review on the next projection with **no cleanup actor** —
there is nothing to clean. Fan-in (many events citing one fact) is caught by
this derivation, not by any depth bound; depth and fan-in are guarded
separately (`test_i3a` vs `test_i3b`). Invalidation has its own status
lifecycle, which is what makes the overturn path exist.

## 7. Trust-Anchor — the axiom is relocated, not eliminated

**The earlier "quorum terminates the regress" claim was overstated.** A quorum
of distinct `policy_authority` signatures does not end the trust regress; it
relocates it into key management: which keys are valid, genuinely distinct, and
uncompromised. That is a PKI problem — and a live one here, given step-ca with
cert rotation in the broader stack. The runtime regress terminates, but only by
depending on an **authority registry**, whose add/revoke operations need their
own authorization, which bottoms out at a **genesis authority set fixed at
initialization**. That genesis set *is* the axiom.

Honest position, modeled on a CA root:

- **Name the axiom.** The genesis authority set is a declared, versioned,
  out-of-band-distributed root — not an emergent property. It is the
  `authoritative_axiomatic` tier at the registry level.
- **Make it minimal and rotatable.** Adding an authority is a signing ceremony
  by the current quorum; revoking a compromised one is the same, or a
  higher-threshold emergency quorum. The registry is itself an append-only,
  quorum-gated, epoch-pinned structure — i.e. it obeys *this same contract*,
  recursively.
- **Enforce checked-only at the apex.** Quorum counts only signatures with
  `checked_at != null`. A `trust_root_revoked` with cited-but-unchecked
  signatures is refused — proven by `test_quorum_rejects_unchecked_signatures`.
- **What the contract still cannot do:** distinct *strings* are not distinct
  *real* authorities. The engine verifies the registry's claim of distinctness;
  whether those identities map to genuine, uncompromised keys is the registry's
  job and the bootstrap axiom's. The contract depends on it; it does not
  establish it.

## 8. Completeness is undecidable → fail-closed projection

The trace-check proves *stability*, never *completeness*; completeness can only
be falsified (find a field with no event source). Runtime guard: an
authoritative field with no backing event **raises** (`IncompleteProjection`),
never returns a default. Otherwise "pure projection" silently degrades into
"projection with defaults" the moment a field lacks a source. Proven by
`test_fail_closed_on_missing_backing`. The minimal ontology (§4) remains
**unvalidated against a real session trace** — the one open empirical risk; if
a real Tessera field needs information no event records, the ontology is
incomplete and fail-closed will surface it loudly rather than fabricate.

## Perimeter — what this contract does NOT guarantee

State the boundary plainly; the system is honest only if it does.

This contract guarantees **provenance and internal consistency**: transitions
are legal, validation requires checked evidence, chains are bounded, projection
is a deterministic, replay-stable function of the log. It does **not** guarantee
**correctness**:

- A `decision` can be `validated` by a green test that asserts nothing
  meaningful.
- Evidence can be `checked` against the wrong file, the wrong commit, or a
  hollow assertion.
- The engineering judgment behind a decision can simply be wrong.

Evidence-backing moves the truth question from *"did the LLM assert it?"* to
*"did the referenced check pass?"* — a strict improvement, but not a
resolution. The hallucination surface did not disappear; it **relocated to the
semantic adequacy of the evidence references**, which can look rigorous behind
a green checkmark while being hollow underneath. That adequacy is **outside the
system's frame**: it lives in code review, test-quality discipline (e.g.
mutation testing on the checks themselves), and human arbitration. The contract
makes the log trustworthy *as a record*; it cannot make the decisions *sound*.
Narrowing that gap (meta-evidence on check quality) is possible but only pushes
the regress one level; it does not close the perimeter. Acknowledging the
perimeter is the guarantee.

## 9. Verification status

```
ok  test_i1_claim_only_cannot_validate            ok  test_i4_replay_from_serialized_log
ok  test_i1_checked_evidence_validates            ok  test_corrupt_persisted_log_fails_on_load
ok  test_i2_supersession_preserves_chain          ok  test_axiom_and_evidence_trust_are_distinct
ok  test_i3a_depth_circuit_breaker                ok  test_quorum_rejects_unchecked_signatures
ok  test_i3b_fanin_distinct_from_depth            ok  test_quorum_accepts_checked_distinct_signatures
ok  test_review_clears_on_overturned_invalidation ok  test_ontology_covers_status_space
ok  test_determinism_under_timestamp_permutation  ok  test_fail_closed_on_missing_backing
ok  test_illegal_transition_rejected              ok  test_multi_parent_lineage_rejected
16/16 invariants hold (epoch-pure, replay-proven).
```

## 10. Carry-forward for the Swift port

- `status_at` is the single source of truth; the Swift actor must expose status
  ONLY as a computed fold, never a stored property — the v1/v2 mutation bug
  must not reappear at the type level.
- `load_log` re-running all guards is the replay contract: a persisted log that
  fails a guard on load is corrupt and must halt, per SPEC §15.
- `authoritative_axiomatic` needs a distinct Inspector tier and VoiceOver
  announcement (SPEC §13, §AC #9) so reliance on declared authority is never
  silently rendered as evidence-backed.
- The authority registry (§7) is itself an instance of this contract; build it
  on the same `EpisodicLog`, do not special-case it.
