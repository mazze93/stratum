"""
test_tessera_projection.py  (v3)
================================
Every invariant pinned and proven to fail when violated. New in v3, targeting
the second review round:

  * test_i4_replay_from_serialized_log  -- ACTUAL round-trip: serialize -> JSON
    -> clean reload -> reproject, assert identical. This is the only honest
    proof of replay stability; the prior fingerprint-the-live-object test was
    not one.
  * test_quorum_rejects_unchecked_signatures -- two signers, both checked_at=None
    -> revocation must be refused ("cited is not checked", even here).
  * test_axiom_and_evidence_trust_are_distinct -- a trust root projects
    AXIOMATIC, an evidence-validated decision projects VERIFIED.
  * test_ontology_covers_status_space -- every reachable status has a marker type.

Run:  python3 test_tessera_projection.py
"""

import json

from tessera_projection import (
    Authority,
    ChainDepthExceeded,
    ContractViolation,
    EpisodicLog,
    Event,
    Evidence,
    IncompleteProjection,
    Status,
    _TRANSITION_EFFECT,
    _TRANSITIONS,
    authoritative_fingerprint,
    load_log,
    project_tessera,
    require_authoritative,
    serialize_log,
)


# --- builders ---------------------------------------------------------------

def decision(id_, *, status=Status.ASSERTED, evidence=(), targets=(), ts=None,
             narrative="d", root=False):
    return Event(id=id_, type="decision", agent_id="executor", schema_version=1,
                 birth_status=status, claim={"narrative": narrative},
                 evidence=tuple(evidence), targets=tuple(targets),
                 is_trust_root=root, timestamp=ts)


def ev(id_, type_, *, evidence=(), targets=(), ts=None, status=Status.ASSERTED):
    return Event(id=id_, type=type_, agent_id="verifier", schema_version=1,
                 birth_status=status, evidence=tuple(evidence),
                 targets=tuple(targets), timestamp=ts)


CHECK = Evidence("test_exit", "suite#42", checked_at="t0.9")


# --- I1 ---------------------------------------------------------------------

def test_i1_claim_only_cannot_validate():
    log = EpisodicLog()
    log.append(decision("d1", status=Status.PENDING_EVIDENCE))
    try:
        log.append(ev("v1", "verification", targets=["d1"]))
    except ContractViolation as e:
        assert "I1" in str(e); return
    raise AssertionError("I1 not enforced")


def test_i1_checked_evidence_validates():
    log = EpisodicLog()
    log.append(decision("d1", status=Status.PENDING_EVIDENCE))
    log.append(ev("v1", "verification", targets=["d1"], evidence=[CHECK]))
    assert log.status_at("d1", log.head) is Status.VALIDATED


# --- I2 ---------------------------------------------------------------------

def test_i2_supersession_preserves_chain():
    log = EpisodicLog()
    log.append(decision("d1", status=Status.PENDING_EVIDENCE))
    log.append(ev("v1", "verification", targets=["d1"], evidence=[CHECK]))
    log.append(decision("d2", status=Status.PENDING_EVIDENCE, targets=["d1"]))
    log.append(ev("s1", "supersession", targets=["d1"]))
    proj = project_tessera(log)
    d2 = next(d for d in proj["authoritative"]["recent_decisions"] if d["id"] == "d2")
    assert "d1" in d2["revision_chain"]
    assert log.status_at("d1", log.head) is Status.SUPERSEDED


# --- I3 ---------------------------------------------------------------------

def test_i3a_depth_circuit_breaker():
    log = EpisodicLog()
    prev = None
    for i in range(20):
        did = f"d{i}"
        log.append(decision(did, status=Status.PENDING_EVIDENCE,
                            targets=[prev] if prev else []))
        log.append(ev(f"v{i}", "verification", targets=[did], evidence=[CHECK]))
        try:
            log.append(ev(f"s{i}", "supersession", targets=[did]))
        except ChainDepthExceeded:
            assert i >= 8; return
        prev = did
    raise AssertionError("depth breaker never tripped")


def test_i3b_fanin_distinct_from_depth():
    log = EpisodicLog()
    shared = Evidence("file_hash", "config.yaml#sha", checked_at="t0")
    for i in range(5):
        log.append(decision(f"d{i}", status=Status.PENDING_EVIDENCE, evidence=[shared]))
    log.append(ev("inv1", "invalidation", targets=["config.yaml#sha"],
                  status=Status.PENDING_EVIDENCE))
    proj = project_tessera(log)
    demoted = [d for d in proj["authoritative"]["recent_decisions"]
               if d["authority"] == Authority.PROVISIONAL.value]
    assert len(demoted) == 5
    for i in range(5):
        assert log.status_at(f"d{i}", log.head) is Status.PENDING_EVIDENCE


def test_review_clears_on_overturned_invalidation():
    log = EpisodicLog()
    fact = Evidence("file_hash", "x.yaml#sha", checked_at="t0")
    log.append(decision("d1", status=Status.PENDING_EVIDENCE, evidence=[fact]))
    log.append(ev("v1", "verification", targets=["d1"], evidence=[CHECK]))
    log.append(ev("inv1", "invalidation", targets=["x.yaml#sha"],
                  status=Status.PENDING_EVIDENCE))
    assert log.under_review("d1", log.head) is True
    # overturning a pending invalidation is a rejection ("this was wrong"),
    # which lands in an _OVERTURNED status and clears review with no cleanup actor
    log.append(ev("r_inv", "rejection", targets=["inv1"]))
    assert log.under_review("d1", log.head) is False
    assert project_tessera(log)["authoritative"]["recent_decisions"][0]["authority"] \
        == Authority.VERIFIED.value


# --- determinism: wall-clock independence -----------------------------------

def test_determinism_under_timestamp_permutation():
    def build(ts):
        log = EpisodicLog()
        log.append(decision("d1", status=Status.PENDING_EVIDENCE, ts=ts[0]))
        log.append(ev("v1", "verification", targets=["d1"], evidence=[CHECK], ts=ts[1]))
        log.append(decision("d2", status=Status.PENDING_EVIDENCE, ts=ts[2]))
        return project_tessera(log)
    assert build(["2026-01-01", "2026-01-02", "2026-01-03"]) \
        == build(["2030-12-31", "1999-01-01", "2026-06-20"])


# --- NEW: replay proven by an actual serialization round-trip ---------------

def _rich_log():
    log = EpisodicLog()
    log.append(decision("d1", status=Status.PENDING_EVIDENCE))
    log.append(ev("v1", "verification", targets=["d1"], evidence=[CHECK]))
    log.append(decision("d2", status=Status.PENDING_EVIDENCE, targets=["d1"]))
    log.append(ev("s1", "supersession", targets=["d1"]))
    log.append(Event(id="f1", type="foreclosure", agent_id="architect",
                     schema_version=1, birth_status=Status.RATIFIED, is_trust_root=True,
                     claim={"narrative": "no kafka"}))
    fact = Evidence("file_hash", "y#sha", checked_at="t0")
    log.append(decision("d3", status=Status.PENDING_EVIDENCE, evidence=[fact]))
    log.append(ev("inv1", "invalidation", targets=["y#sha"], status=Status.PENDING_EVIDENCE))
    return log


def test_i4_replay_from_serialized_log():
    log = _rich_log()
    live = project_tessera(log)
    # cross a REAL serialization boundary (what survives the Swift port / disk)
    records = json.loads(json.dumps(serialize_log(log)))
    reloaded = load_log(records)
    replay = project_tessera(reloaded)
    assert replay == live, "projection diverged after replay from persisted log"
    assert authoritative_fingerprint(replay) == authoritative_fingerprint(live)


def test_corrupt_persisted_log_fails_on_load():
    # An illegal transition smuggled into the persisted form must be rejected at
    # load (guards re-run), not silently projected.
    records = serialize_log(_rich_log())
    records.append({
        "id": "bad", "type": "verification", "agent_id": "x", "schema_version": 1,
        "birth_status": "asserted", "claim": {}, "evidence": [],  # no checked evidence
        "targets": ["d3"], "is_trust_root": False, "timestamp": None,
    })
    try:
        load_log(records)
    except ContractViolation:
        return
    raise AssertionError("corrupt persisted log loaded without complaint")


# --- NEW: axiom vs evidence trust are different tiers ------------------------

def test_axiom_and_evidence_trust_are_distinct():
    log = EpisodicLog()
    log.append(decision("root", status=Status.RATIFIED, root=True))   # authority-declared
    log.append(decision("d1", status=Status.PENDING_EVIDENCE))
    log.append(ev("v1", "verification", targets=["d1"], evidence=[CHECK]))  # evidence-checked
    proj = project_tessera(log)
    auth = {d["id"]: d["authority"] for d in proj["authoritative"]["recent_decisions"]}
    assert auth["root"] == Authority.AXIOMATIC.value
    assert auth["d1"] == Authority.VERIFIED.value
    assert auth["root"] != auth["d1"]  # the distinction is preserved, not collapsed


# --- NEW: quorum must count only CHECKED signatures -------------------------

def test_quorum_rejects_unchecked_signatures():
    log = EpisodicLog()
    log.append(decision("r1", status=Status.RATIFIED, root=True))
    # two DISTINCT signer strings, but BOTH unchecked (checked_at=None)
    unchecked = ev("rev", "trust_root_revoked", targets=["r1"], evidence=[
        Evidence("policy_authority", "A", checked_at=None, signer="A"),
        Evidence("policy_authority", "B", checked_at=None, signer="B")])
    try:
        log.append(unchecked)
    except ContractViolation as e:
        assert "checked" in str(e).lower()
        assert log.status_at("r1", log.head) is Status.RATIFIED  # NOT revoked
        return
    raise AssertionError("revocation passed with unchecked signatures")


def test_quorum_accepts_checked_distinct_signatures():
    log = EpisodicLog()
    log.append(decision("r1", status=Status.RATIFIED, root=True))
    log.append(ev("rev", "trust_root_revoked", targets=["r1"], evidence=[
        Evidence("policy_authority", "A", checked_at="t", signer="A"),
        Evidence("policy_authority", "B", checked_at="t", signer="B")]))
    assert log.status_at("r1", log.head) is Status.CONTRADICTED


# --- ontology completeness vs the status space ------------------------------

def test_ontology_covers_status_space():
    # Every status reachable by a transition must have a marker type, else the
    # fold is underdetermined (the rejection/dispute gap from review).
    reachable = set()
    for outs in _TRANSITIONS.values():
        reachable |= outs
    covered = set(_TRANSITION_EFFECT.values())
    missing = reachable - covered
    assert not missing, f"statuses with no marker type: {missing}"


# --- fail-closed completeness + LTS guard -----------------------------------

def test_fail_closed_on_missing_backing():
    log = EpisodicLog()
    log.append(decision("d1", status=Status.PENDING_EVIDENCE))
    assert require_authoritative(log, "decision", "d1")["id"] == "d1"
    try:
        require_authoritative(log, "decision", "ghost")
    except IncompleteProjection:
        return
    raise AssertionError("projector defaulted instead of failing closed")


def test_illegal_transition_rejected():
    log = EpisodicLog()
    log.append(decision("d1", status=Status.ASSERTED))
    try:
        log.append(ev("v1", "verification", targets=["d1"], evidence=[CHECK]))
    except ContractViolation as e:
        assert "illegal transition" in str(e); return
    raise AssertionError("asserted -> validated let through")


def test_multi_parent_lineage_rejected():
    log = EpisodicLog()
    log.append(decision("a", status=Status.PENDING_EVIDENCE))
    log.append(decision("b", status=Status.PENDING_EVIDENCE))
    try:
        log.append(decision("c", status=Status.PENDING_EVIDENCE, targets=["a", "b"]))
    except ContractViolation as e:
        assert "multi-parent" in str(e); return
    raise AssertionError("diamond lineage accepted unguarded")


# --- harness ----------------------------------------------------------------

if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)}/{len(tests)} invariants hold (epoch-pure, replay-proven).")
