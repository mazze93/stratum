"""
tessera_projection.py  (v3 — epoch-pure, replay-proven)
=======================================================
Executable reference for the Event Epistemic Contract beneath Stratum's
Tessera. SEMANTICS-VALIDATION reference, not the production Swift.

Design (after two rounds of review):

  * Events are IMMUTABLE (frozen). Nothing mutates an event after append.
  * Status is a PURE FOLD over the log: `status_at(event, epoch)`. A marker's
    TYPE determines its effect (`_TRANSITION_EFFECT`), so the destination status
    is recoverable from the persisted log alone — never passed at runtime.
  * Verification is a LOGGED EVENT carrying checked evidence. "validated" = such
    an event exists at/<=epoch. Projection ignores wall-clock entirely; ordering
    is by logical `seq`.
  * "Under review" is DERIVED (a live invalidation over depended-on evidence),
    not a stored flag — so overturning the invalidation auto-clears it.
  * `invalidation` is first-class with its own lifecycle.
  * Two distinct trust kinds get two distinct tiers:
        VERIFIED  = trusted because EVIDENCE was checked
        AXIOMATIC = trusted because an AUTHORITY declared it (a trust root /
                    human ratification) -- carries no checked evidence by nature
    Collapsing these was a real defect; the projection now keeps them apart.
  * Completeness is undecidable -> the projector is FAIL-CLOSED.
  * Replay is proven by an actual serialize -> reload -> reproject round-trip
    (see serialize_log / load_log and the matching test), not by comparing two
    fingerprints of the same live object.

PERIMETER (stated, not fixed): guarantees provenance and internal consistency.
Does NOT guarantee a passing check is meaningful, that evidence points at the
right artifact, or that the engineering judgment is sound. Authority-registry
distinctness (which keys are real, distinct, uncompromised) is the bootstrap
axiom this system depends on; it does not eliminate it. See MEMORY_MODEL
§Perimeter and §Trust-Anchor.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Section 1 — Status LTS, transition ontology, authority tiers
# ---------------------------------------------------------------------------

class Status(str, Enum):
    ASSERTED = "asserted"
    PENDING_EVIDENCE = "pending_evidence"
    VALIDATED = "validated"
    CONTRADICTED = "contradicted"
    SUPERSEDED = "superseded"
    RATIFIED = "ratified"
    DISPUTED = "disputed"
    REJECTED = "rejected"


# Edges must be DRIVEABLE by a marker type (see _TRANSITION_EFFECT), else the
# fold is underdetermined. PENDING_EVIDENCE is an ENTRY (birth) status only —
# nothing transitions *into* it — so it is deliberately absent as a target here.
_TRANSITIONS: dict[Status, set[Status]] = {
    Status.ASSERTED: {Status.RATIFIED, Status.DISPUTED},
    Status.PENDING_EVIDENCE: {Status.VALIDATED, Status.REJECTED, Status.DISPUTED},
    Status.VALIDATED: {Status.CONTRADICTED, Status.SUPERSEDED},
    Status.CONTRADICTED: {Status.RATIFIED},
    Status.SUPERSEDED: set(),
    Status.RATIFIED: {Status.CONTRADICTED},
    Status.DISPUTED: {Status.VALIDATED, Status.REJECTED},
    Status.REJECTED: set(),
}

# Every reachable status needs a marker type, or the fold is underdetermined.
# Ten event types total: 2 originating + 1 evidence-scoped + 7 transition.
_TRANSITION_EFFECT: dict[str, Status] = {
    "verification": Status.VALIDATED,
    "supersession": Status.SUPERSEDED,
    "contradiction": Status.CONTRADICTED,
    "ratification": Status.RATIFIED,
    "rejection": Status.REJECTED,
    "dispute": Status.DISPUTED,
    "trust_root_revoked": Status.CONTRADICTED,
}
_ORIGINATING = {"decision", "foreclosure"}
_EVIDENCE_SCOPED = {"invalidation"}
_KNOWN_TYPES = _ORIGINATING | _EVIDENCE_SCOPED | set(_TRANSITION_EFFECT)

_OVERTURNED = {Status.CONTRADICTED, Status.SUPERSEDED, Status.REJECTED}


class Authority(str, Enum):
    VERIFIED = "authoritative_verified"        # evidence checked
    AXIOMATIC = "authoritative_axiomatic"      # authority-declared (trust root / ratification)
    PROVISIONAL = "authoritative_provisional"  # pending or under review
    NARRATIVE = "narrative"                     # LLM gloss; never canonical


QUORUM = 2
MAX_CHAIN_DEPTH = 8


# ---------------------------------------------------------------------------
# Section 2 — Immutable evidence and events
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Evidence:
    kind: str
    ref: str
    checked_at: Optional[str] = None
    signer: Optional[str] = None

    @property
    def is_checked(self) -> bool:
        return self.checked_at is not None


@dataclass(frozen=True)
class Event:
    id: str
    type: str
    agent_id: str
    schema_version: int
    seq: int = -1
    birth_status: Status = Status.ASSERTED
    claim: dict = field(default_factory=dict)
    evidence: tuple[Evidence, ...] = ()
    targets: tuple[str, ...] = ()
    is_trust_root: bool = False
    timestamp: Optional[str] = None   # metadata only; ignored by projection

    @property
    def has_checked_evidence(self) -> bool:
        return any(e.is_checked for e in self.evidence)


# ---------------------------------------------------------------------------
# Section 3 — Errors
# ---------------------------------------------------------------------------

class ContractViolation(Exception):
    pass


class ChainDepthExceeded(ContractViolation):
    pass


class IncompleteProjection(ContractViolation):
    pass


class ReinterpretationError(ContractViolation):
    pass


# ---------------------------------------------------------------------------
# Section 4 — Append-only log; status is a fold, never a mutation
# ---------------------------------------------------------------------------

class EpisodicLog:
    def __init__(self) -> None:
        self._events: list[Event] = []
        self._by_id: dict[str, Event] = {}

    @property
    def head(self) -> int:
        return len(self._events) - 1

    def events_upto(self, epoch: Optional[int] = None) -> list[Event]:
        e = self.head if epoch is None else epoch
        return [ev for ev in self._events if ev.seq <= e]

    def get(self, event_id: str) -> Event:
        return self._by_id[event_id]

    def append(self, event: Event) -> Event:
        if event.id in self._by_id:
            raise ContractViolation(f"duplicate event id {event.id}")
        if event.type not in _KNOWN_TYPES:
            raise ContractViolation(f"unknown event type {event.type!r}")
        event = replace(event, seq=len(self._events))
        self._guard(event)
        self._events.append(event)
        self._by_id[event.id] = event
        return event

    # -- guards ----------------------------------------------------------
    def _guard(self, event: Event) -> None:
        if event.type in _ORIGINATING:
            self._guard_originating(event)
        elif event.type in _EVIDENCE_SCOPED:
            self._guard_invalidation(event)
        else:
            self._guard_transition(event)

    def _guard_originating(self, e: Event) -> None:
        if e.birth_status not in (Status.ASSERTED, Status.PENDING_EVIDENCE, Status.RATIFIED):
            raise ContractViolation(f"{e.id} illegal entry status {e.birth_status.value}")
        if e.birth_status is Status.RATIFIED and not e.is_trust_root:
            raise ContractViolation(f"{e.id} entered RATIFIED without is_trust_root")
        # Lineage is single-parent in v1. Multi-parent DAGs are an explicit
        # extension; reject silently-ambiguous diamonds at write time.
        if len(e.targets) > 1:
            raise ContractViolation(
                f"{e.id} has multi-parent lineage {e.targets}; single-parent only in v1"
            )

    def _guard_invalidation(self, e: Event) -> None:
        if e.birth_status not in (Status.ASSERTED, Status.PENDING_EVIDENCE):
            raise ContractViolation(f"invalidation {e.id} illegal entry {e.birth_status.value}")
        if len(e.targets) != 1:
            raise ContractViolation(f"invalidation {e.id} must target exactly one evidence ref")

    def _guard_transition(self, t: Event) -> None:
        if len(t.targets) != 1:
            raise ContractViolation(f"transition {t.id} must target exactly one event")
        target_id = t.targets[0]
        cur = self.status_at(target_id, self.head)
        to = _TRANSITION_EFFECT[t.type]
        if to not in _TRANSITIONS[cur]:
            raise ContractViolation(f"illegal transition {cur.value} -> {to.value} on {target_id}")
        # I1: validation requires checked evidence on the verification event.
        if to is Status.VALIDATED and not t.has_checked_evidence:
            raise ContractViolation(f"I1: verification {t.id} carries no checked evidence")
        # Quorum: RATIFIED -> CONTRADICTED only via trust_root_revoked, and ONLY
        # counting CHECKED policy-authority signatures (cited != checked, even
        # here -- especially here).
        if cur is Status.RATIFIED and to is Status.CONTRADICTED:
            if t.type != "trust_root_revoked":
                raise ContractViolation(f"RATIFIED {target_id} revocable only by trust_root_revoked")
            signers = {
                e.signer for e in t.evidence
                if e.kind == "policy_authority" and e.signer is not None and e.is_checked
            }
            if len(signers) < QUORUM:
                raise ContractViolation(
                    f"trust_root_revoked needs >= {QUORUM} distinct CHECKED authorities, got {len(signers)}"
                )
        if to in (Status.SUPERSEDED, Status.CONTRADICTED):
            if self._chain_depth(target_id) > MAX_CHAIN_DEPTH:
                raise ChainDepthExceeded(f"I3: chain depth at {target_id} exceeds {MAX_CHAIN_DEPTH}")

    # -- status fold -----------------------------------------------------
    def status_at(self, event_id: str, epoch: int) -> Status:
        status = self._by_id[event_id].birth_status
        markers = sorted(
            (ev for ev in self._events
             if ev.seq <= epoch and ev.type in _TRANSITION_EFFECT
             and ev.targets and ev.targets[0] == event_id),
            key=lambda ev: ev.seq,
        )
        for m in markers:
            to = _TRANSITION_EFFECT[m.type]
            if to in _TRANSITIONS[status]:
                status = to
        return status

    def _lineage_parent(self, event: Event) -> Optional[str]:
        return event.targets[0] if event.targets else None

    def _chain_depth(self, event_id: str) -> int:
        depth, cursor, seen = 1, self._by_id[event_id], {event_id}
        parent = self._lineage_parent(cursor)
        while parent and parent in self._by_id and parent not in seen:
            cursor = self._by_id[parent]
            seen.add(cursor.id)
            depth += 1
            parent = self._lineage_parent(cursor)
        return depth

    # -- derived review --------------------------------------------------
    def evidence_refs_of(self, event_id: str, epoch: int) -> set[str]:
        refs: set[str] = set()
        for ev in self.events_upto(epoch):
            owns = ev.id == event_id
            targets_it = (ev.type in _TRANSITION_EFFECT and ev.targets
                          and ev.targets[0] == event_id)
            if owns or targets_it:
                refs.update(e.ref for e in ev.evidence)
        return refs

    def under_review(self, event_id: str, epoch: int) -> bool:
        deps = self.evidence_refs_of(event_id, epoch)
        if not deps:
            return False
        for ev in self.events_upto(epoch):
            if ev.type != "invalidation" or not ev.targets or ev.targets[0] not in deps:
                continue
            if self.status_at(ev.id, epoch) not in _OVERTURNED:
                return True
        return False


# ---------------------------------------------------------------------------
# Section 5 — Projection (pure function of the log at an epoch)
# ---------------------------------------------------------------------------

def _authority(log: EpisodicLog, event_id: str, epoch: int) -> Authority:
    if log.under_review(event_id, epoch):
        return Authority.PROVISIONAL
    st = log.status_at(event_id, epoch)
    if st is Status.RATIFIED:
        return Authority.AXIOMATIC      # authority-declared, NOT evidence-checked
    if st is Status.VALIDATED:
        return Authority.VERIFIED       # evidence-checked
    if st is Status.PENDING_EVIDENCE:
        return Authority.PROVISIONAL
    return Authority.NARRATIVE


def _revision_chain(log: EpisodicLog, event: Event) -> list[str]:
    chain, cursor, seen = [event.id], event, {event.id}
    parent = log._lineage_parent(cursor)
    while parent and parent in log._by_id and parent not in seen:
        cursor = log.get(parent)
        seen.add(cursor.id)
        chain.append(cursor.id)
        parent = log._lineage_parent(cursor)
    return list(reversed(chain))


def project_tessera(log: EpisodicLog, epoch: Optional[int] = None) -> dict:
    e = log.head if epoch is None else epoch
    events = sorted(log.events_upto(e), key=lambda ev: ev.seq)
    recent_decisions, foreclosed_options = [], []
    for ev in events:
        if ev.type == "decision":
            recent_decisions.append({
                "id": ev.id,
                "authority": _authority(log, ev.id, e).value,
                "status": log.status_at(ev.id, e).value,
                "revision_chain": _revision_chain(log, ev),
                "narrative": ev.claim.get("narrative"),
            })
        elif ev.type == "foreclosure":
            st = log.status_at(ev.id, e)
            foreclosed_options.append({
                "id": ev.id,
                "authority": _authority(log, ev.id, e).value,
                "status": st.value,
                "active": st not in _OVERTURNED,
                "narrative": ev.claim.get("narrative"),
            })
    return {
        "epoch": e,
        "authoritative": {"recent_decisions": recent_decisions,
                          "foreclosed_options": foreclosed_options},
        "narrative_only": {"current_goal": None, "next_action": None, "warnings": []},
    }


def require_authoritative(log: EpisodicLog, field_kind: str, event_id: str,
                          epoch: Optional[int] = None) -> dict:
    """Fail-closed: raise rather than default when a field has no backing event."""
    proj = project_tessera(log, epoch)
    bucket = {"decision": "recent_decisions", "foreclosure": "foreclosed_options"}[field_kind]
    for entry in proj["authoritative"][bucket]:
        if entry["id"] == event_id:
            return entry
    raise IncompleteProjection(
        f"no backing event for authoritative {field_kind} {event_id!r}"
    )


# ---------------------------------------------------------------------------
# Section 6 — Serialization (the persisted form) and replay
# ---------------------------------------------------------------------------

def event_to_record(e: Event) -> dict:
    """Persisted form. `seq` is intentionally omitted; reload reassigns it by
    append order, proving the log's order is self-describing."""
    return {
        "id": e.id, "type": e.type, "agent_id": e.agent_id,
        "schema_version": e.schema_version, "birth_status": e.birth_status.value,
        "claim": e.claim, "evidence": [dataclasses.asdict(x) for x in e.evidence],
        "targets": list(e.targets), "is_trust_root": e.is_trust_root,
        "timestamp": e.timestamp,
    }


def record_to_event(r: dict) -> Event:
    return Event(
        id=r["id"], type=r["type"], agent_id=r["agent_id"],
        schema_version=r["schema_version"], birth_status=Status(r["birth_status"]),
        claim=dict(r.get("claim") or {}),
        evidence=tuple(Evidence(**x) for x in r["evidence"]),
        targets=tuple(r["targets"]), is_trust_root=r["is_trust_root"],
        timestamp=r.get("timestamp"),
    )


def serialize_log(log: EpisodicLog) -> list[dict]:
    return [event_to_record(e) for e in log._events]


def load_log(records: list[dict]) -> EpisodicLog:
    """Reconstruct purely from the persisted records. Re-runs every guard, so a
    corrupt persisted log fails on load rather than projecting wrong."""
    log = EpisodicLog()
    for r in records:
        log.append(record_to_event(r))
    return log


# ---------------------------------------------------------------------------
# Section 7 — I4 fingerprint (used by the replay round-trip test)
# ---------------------------------------------------------------------------

def authoritative_fingerprint(projection: dict) -> dict:
    out = {}
    for d in projection["authoritative"]["recent_decisions"]:
        out[("decision", d["id"])] = (d["authority"], d["status"], tuple(d["revision_chain"]))
    for f in projection["authoritative"]["foreclosed_options"]:
        out[("foreclosure", f["id"])] = (f["authority"], f["status"], f["active"])
    return out


def assert_no_reinterpretation(old: dict, new: dict) -> None:
    for key, old_val in old.items():
        if key not in new:
            raise ReinterpretationError(f"I4: authoritative field {key} dropped on replay")
        if new[key] != old_val:
            raise ReinterpretationError(f"I4: {key} reinterpreted {old_val} -> {new[key]}")
