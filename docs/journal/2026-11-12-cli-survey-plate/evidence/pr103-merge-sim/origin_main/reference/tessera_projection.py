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

import re
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
SCHEMA_VERSIONS = {1, 2}
_SHA256_HEX = re.compile(r"[0-9a-f]{64}")
_GIT_OBJECT_ID = re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}")


def is_repo_relative_path(p) -> bool:
    """Resolvable inside a clean checkout: non-empty, not absolute, no backslash
    or NUL, no empty / "." / ".." segments — it can never point outside."""
    if not isinstance(p, str) or not p or p.startswith("/") or "\\" in p or "\0" in p:
        return False
    return all(seg not in ("", ".", "..") for seg in p.split("/"))


# ---------------------------------------------------------------------------
# Section 2 — Immutable evidence and events
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ReproducibleCheck:
    """ADR-003 §3 — a pinned recipe anyone can re-run and compare."""
    command: str
    repo: str
    commit: str                       # full 40- or 64-hex git object id
    expect_exit: int
    inputs: tuple = ()                # ((id, sha256), ...) — Temenos provenance shape
    output_sha256: Optional[str] = None   # digest of DETERMINISTIC output only
    output_path: Optional[str] = None     # repo-relative; present iff output_sha256 is
    type: str = "reproducible_check"


@dataclass(frozen=True)
class SignedAttestation:
    """ADR-003 §3 — an artifact digest signed by a registered authority key."""
    subject_sha256: str
    predicate: str
    key_id: str
    signature: str
    type: str = "signed_attestation"


@dataclass(frozen=True)
class Evidence:
    kind: str
    ref: str
    # v1: None = CITED, not CHECKED. v2: metadata only — no v2 guard reads it.
    checked_at: Optional[str] = None
    signer: Optional[str] = None      # v1: a name, not a signature. v2: metadata.
    binding: Optional[object] = None  # v2 only: ReproducibleCheck | SignedAttestation

    @property
    def is_checked(self) -> bool:
        return self.checked_at is not None

    @property
    def counts_as_bound(self) -> bool:
        # A signed_attestation counts only once the registry (phase 3) can
        # verify its key and signature; until then it never counts.
        return isinstance(self.binding, ReproducibleCheck)


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

    @property
    def has_bound_evidence(self) -> bool:
        return any(e.counts_as_bound for e in self.evidence)


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


class ParseError(ContractViolation):
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
        if e.schema_version >= 2 and e.birth_status is Status.RATIFIED:
            # v2 roots must be registry genesis or quorum-signed (ADR-003 §4);
            # refuse until the registry exists rather than mint unsigned roots.
            raise ContractViolation(f"{e.id}: v2 trust roots require the authority registry (ADR-003 §4)")
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
        # I1: validation requires evidence on the verification event itself.
        # v1: checked (checked_at != None). v2: BOUND — a typed timestamp no
        # longer counts (ADR-003 §3, tp-002).
        if to is Status.VALIDATED:
            if t.schema_version >= 2:
                if not t.has_bound_evidence:
                    raise ContractViolation(
                        f"I1: v2 verification {t.id} carries no bound evidence (checked_at is metadata in v2)")
            elif not t.has_checked_evidence:
                raise ContractViolation(f"I1: verification {t.id} carries no checked evidence")
        # v2 authority acts need registry signatures (ADR-003 §4): refused
        # until phase 3, never judged by v1's signer strings.
        if t.schema_version >= 2 and t.type in ("ratification", "trust_root_revoked"):
            raise ContractViolation(f"{t.id}: v2 {t.type} requires the authority registry (ADR-003 §4)")
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

def _binding_to_record(b) -> dict:
    if isinstance(b, SignedAttestation):
        return {"type": b.type, "subject_sha256": b.subject_sha256, "predicate": b.predicate,
                "key_id": b.key_id, "signature": b.signature}
    out = {"type": b.type, "command": b.command, "repo": b.repo, "commit": b.commit,
           "expect_exit": b.expect_exit}
    if b.inputs:
        out["inputs"] = [{"id": i, "sha256": h} for i, h in b.inputs]
    if b.output_sha256 is not None:
        out["output_sha256"] = b.output_sha256
        out["output_path"] = b.output_path
    return out


def _evidence_to_record(x: Evidence) -> dict:
    out = {"kind": x.kind, "ref": x.ref, "checked_at": x.checked_at, "signer": x.signer}
    if x.binding is not None:           # absent on v1: v1 wire bytes unchanged
        out["binding"] = _binding_to_record(x.binding)
    return out


def event_to_record(e: Event) -> dict:
    """Persisted form. `seq` is intentionally omitted; reload reassigns it by
    append order, proving the log's order is self-describing."""
    return {
        "id": e.id, "type": e.type, "agent_id": e.agent_id,
        "schema_version": e.schema_version, "birth_status": e.birth_status.value,
        "claim": e.claim, "evidence": [_evidence_to_record(x) for x in e.evidence],
        "targets": list(e.targets), "is_trust_root": e.is_trust_root,
        "timestamp": e.timestamp,
    }


def _nonempty(v) -> bool:
    return isinstance(v, str) and len(v) > 0


def _only_keys(r: dict, allowed: set, ctx: str) -> None:
    for k in r:
        if k not in allowed:
            raise ParseError(f"{ctx}: unknown field {k!r}")


def _parse_binding(x, ctx: str):
    """Strict: unknown keys refused, every field re-derived and format-checked."""
    if not isinstance(x, dict):
        raise ParseError(f"{ctx}: binding must be an object")
    t = x.get("type")
    if t == "reproducible_check":
        _only_keys(x, {"type", "command", "repo", "commit", "expect_exit", "inputs", "output_sha256",
                       "output_path"}, ctx)
        if not _nonempty(x.get("command")):
            raise ParseError(f"{ctx}: command must be a non-empty string")
        if not _nonempty(x.get("repo")):
            raise ParseError(f"{ctx}: repo must be a non-empty string")
        c = x.get("commit")
        if not isinstance(c, str) or not _GIT_OBJECT_ID.fullmatch(c):
            raise ParseError(f"{ctx}: commit must be a full 40- or 64-hex git object id")
        ex = x.get("expect_exit")
        if isinstance(ex, bool) or not isinstance(ex, int) or not 0 <= ex <= 255:
            if not (isinstance(ex, float) and ex.is_integer() and 0 <= ex <= 255):
                raise ParseError(f"{ctx}: expect_exit must be an integer 0..255")
            ex = int(ex)   # JSON 0.0 / 0 are the same number to JS
        raw = x.get("inputs", [])
        if raw is None:
            raw = []
        if not isinstance(raw, list):
            raise ParseError(f"{ctx}: inputs must be an array")
        inputs = []
        for n, i in enumerate(raw):
            if not isinstance(i, dict):
                raise ParseError(f"{ctx}: inputs[{n}] must be an object")
            _only_keys(i, {"id", "sha256"}, f"{ctx} inputs[{n}]")
            if not _nonempty(i.get("id")):
                raise ParseError(f"{ctx}: inputs[{n}].id must be a non-empty string")
            h = i.get("sha256")
            if not isinstance(h, str) or not _SHA256_HEX.fullmatch(h):
                raise ParseError(f"{ctx}: inputs[{n}].sha256 must be 64 lowercase hex")
            inputs.append((i["id"], h))
        out = x.get("output_sha256")
        if out is not None and (not isinstance(out, str) or not _SHA256_HEX.fullmatch(out)):
            raise ParseError(f"{ctx}: output_sha256 must be 64 lowercase hex")
        op = x.get("output_path")
        if (out is None) != (op is None):
            # a digest without its file can't be re-checked; a file without a digest pins nothing
            raise ParseError(f"{ctx}: output_sha256 and output_path go together")
        if op is not None and not is_repo_relative_path(op):
            raise ParseError(f"{ctx}: output_path must be a repo-relative path inside the checkout")
        return ReproducibleCheck(command=x["command"], repo=x["repo"], commit=c, expect_exit=ex,
                                 inputs=tuple(inputs), output_sha256=out, output_path=op)
    if t == "signed_attestation":
        _only_keys(x, {"type", "subject_sha256", "predicate", "key_id", "signature"}, ctx)
        h = x.get("subject_sha256")
        if not isinstance(h, str) or not _SHA256_HEX.fullmatch(h):
            raise ParseError(f"{ctx}: subject_sha256 must be 64 lowercase hex")
        for k in ("predicate", "key_id", "signature"):
            if not _nonempty(x.get(k)):
                raise ParseError(f"{ctx}: {k} must be a non-empty string")
        return SignedAttestation(subject_sha256=h, predicate=x["predicate"],
                                 key_id=x["key_id"], signature=x["signature"])
    raise ParseError(f"{ctx}: unknown binding type {t!r}")


def _parse_evidence(x, ctx: str, schema_version: int) -> Evidence:
    if not isinstance(x, dict):
        raise ParseError(f"{ctx}: evidence entry not an object")
    if not isinstance(x.get("kind"), str) or not isinstance(x.get("ref"), str):
        raise ParseError(f"{ctx}: evidence.kind and evidence.ref must be strings")
    ca, sg = x.get("checked_at"), x.get("signer")
    if ca is not None and not isinstance(ca, str):
        raise ParseError(f"{ctx}: evidence.checked_at must be string or null")
    if sg is not None and not isinstance(sg, str):
        raise ParseError(f"{ctx}: evidence.signer must be string or null")
    b = x.get("binding")
    if b is not None:
        if schema_version < 2:
            raise ParseError(f"{ctx}: binding requires schema_version 2")
        b = _parse_binding(b, f"{ctx} binding")
    return Evidence(kind=x["kind"], ref=x["ref"], checked_at=ca, signer=sg, binding=b)


def record_to_event(r: dict) -> Event:
    ctx = f"event {r.get('id', '<no id>')}"
    sv = r.get("schema_version")
    if isinstance(sv, bool) or sv not in SCHEMA_VERSIONS:
        # fail-closed on versions this build doesn't know (ADR-003 §3)
        raise ParseError(f"{ctx}: schema_version {sv!r} unsupported")
    if not isinstance(r.get("evidence"), list):
        raise ParseError(f"{ctx}: evidence must be an array")
    if not isinstance(r.get("targets"), list) or not all(isinstance(t, str) for t in r["targets"]):
        raise ParseError(f"{ctx}: targets must be an array of strings")
    if not isinstance(r.get("is_trust_root"), bool):
        raise ParseError(f"{ctx}: is_trust_root must be a boolean")
    return Event(
        id=r["id"], type=r["type"], agent_id=r["agent_id"],
        schema_version=int(sv), birth_status=Status(r["birth_status"]),
        claim=dict(r.get("claim") or {}),
        evidence=tuple(_parse_evidence(x, f"{ctx} evidence[{i}]", int(sv))
                       for i, x in enumerate(r["evidence"])),
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
