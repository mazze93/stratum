"""
test_binding.py — schema_version 2 evidence binding (ADR-003 §3, tp-002/tp-011).

Each test is pinned to fail if its rule is removed. Names are mirrored 1:1 in
core/test/binding.test.ts; if the two disagree, this file wins.

Run:  python3 test_binding.py
"""

import copy
import json
from pathlib import Path

from canonical import log_digest
from tessera_projection import (
    Authority, ContractViolation, EpisodicLog, ParseError, Status,
    _authority as authority_of, load_log, project_tessera, record_to_event, serialize_log,
)

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "core" / "test" / "fixtures" / "binding-v2.jsonl"
C = "0123456789abcdef0123456789abcdef01234567"

CHECK = {"type": "reproducible_check", "command": "npm test", "repo": "github.com/mazze93/stratum",
         "commit": C, "expect_exit": 0}
ATTEST = {"type": "signed_attestation", "subject_sha256": "c" * 64, "predicate": "p",
          "key_id": "k1", "signature": "c2ln"}


def rec(i, typ, sv=2, birth="pending_evidence", ev=(), targets=(), root=False):
    return {"id": i, "type": typ, "agent_id": "t", "schema_version": sv, "birth_status": birth,
            "claim": {}, "evidence": list(ev), "targets": list(targets), "is_trust_root": root,
            "timestamp": None}


def ev(binding=None, checked_at="2026-10-06T20:00:00Z", signer="claude"):
    e = {"kind": "test_exit", "ref": "npm test", "checked_at": checked_at, "signer": signer}
    if binding is not None:
        e["binding"] = binding
    return e


def refused(records, *, kind=ContractViolation, match="") -> bool:
    try:
        load_log(records)
    except kind as e:
        assert match in str(e), f"refused, but for the wrong reason: {e}"
        return True
    return False


def test_v2_checked_at_alone_cannot_validate():
    # The defect v2 fixes: a typed timestamp + a name is no longer evidence.
    assert refused([rec("d", "decision"), rec("v", "verification", birth="asserted",
                                              ev=[ev()], targets=["d"])],
                   match="no bound evidence")


def test_v2_reproducible_check_validates():
    log = load_log([rec("d", "decision"),
                    rec("v", "verification", birth="asserted", ev=[ev(CHECK, None, None)], targets=["d"])])
    assert log.status_at("d", log.head) is Status.VALIDATED
    assert authority_of(log, "d", log.head) is Authority.VERIFIED


def test_v2_attestation_cannot_validate_before_registry():
    assert refused([rec("d", "decision"), rec("v", "verification", birth="asserted",
                                              ev=[ev(ATTEST)], targets=["d"])],
                   match="no bound evidence")


def test_v1_checked_at_still_validates():
    # v1 guards are byte-for-byte unchanged: every existing trace keeps loading.
    log = load_log([rec("d", "decision", sv=1),
                    rec("v", "verification", sv=1, birth="asserted", ev=[ev()], targets=["d"])])
    assert log.status_at("d", log.head) is Status.VALIDATED


def test_v1_evidence_cannot_carry_a_binding():
    assert refused([rec("d", "decision", sv=1, ev=[ev(CHECK)])], kind=ParseError,
                   match="requires schema_version 2")


def test_unknown_schema_version_fails_closed():
    for sv in (0, 3, "2", True, None):
        assert refused([rec("d", "decision", sv=sv)], kind=ParseError, match="unsupported"), sv


def test_malformed_bindings_rejected():
    bad = [
        ({**CHECK, "commit": C[:12]}, "git object id"),           # abbreviated SHA
        ({**CHECK, "commit": C.upper()}, "git object id"),        # uppercase hex
        ({**CHECK, "command": ""}, "command"),
        ({**CHECK, "repo": ""}, "repo"),
        ({**CHECK, "expect_exit": 256}, "expect_exit"),
        ({**CHECK, "expect_exit": -1}, "expect_exit"),
        ({**CHECK, "expect_exit": True}, "expect_exit"),
        ({**CHECK, "expect_exit": 0.5}, "expect_exit"),
        ({**CHECK, "output_sha256": "z" * 64}, "output_sha256"),
        ({**CHECK, "inputs": [{"id": "x", "sha256": "A" * 64}]}, "inputs[0].sha256"),
        ({**CHECK, "inputs": [{"id": "", "sha256": "a" * 64}]}, "inputs[0].id"),
        ({**CHECK, "inputs": [{"id": "x", "sha256": "a" * 64, "extra": 1}]}, "unknown field"),
        ({**CHECK, "verified": True}, "unknown field"),           # no supplied verdicts
        ({**ATTEST, "subject_sha256": "c" * 63}, "subject_sha256"),
        ({**ATTEST, "key_id": ""}, "key_id"),
        ({**CHECK, "output_sha256": "b" * 64}, "go together"),
        ({**CHECK, "output_path": "out.json"}, "go together"),
        ({**CHECK, "output_sha256": "b" * 64, "output_path": "../escape.json"}, "output_path"),
        ({**CHECK, "output_sha256": "b" * 64, "output_path": "/etc/passwd"}, "output_path"),
        ({"type": "vibes"}, "unknown binding type"),
        ("npm test", "binding must be an object"),
    ]
    for b, why in bad:
        assert refused([rec("d", "decision", ev=[ev(b)])], kind=ParseError, match=why), (b, why)


def test_v2_authority_acts_refused_until_registry():
    assert refused([rec("r", "decision", birth="ratified", root=True)], match="authority registry")
    v1_root = rec("r", "decision", sv=1, birth="ratified", root=True)
    assert refused([rec("d", "decision", birth="asserted"),
                    rec("x", "ratification", birth="asserted", targets=["d"])], match="authority registry")
    sigs = [{"kind": "policy_authority", "ref": a, "checked_at": "t", "signer": a} for a in "AB"]
    assert refused([v1_root, rec("x", "trust_root_revoked", birth="asserted", ev=sigs, targets=["r"])],
                   match="authority registry")


def test_binding_round_trips_and_v1_wire_is_unchanged():
    recs = [json.loads(l) for l in FIXTURE.read_text().splitlines() if l.strip()]
    log = load_log(recs)
    again = load_log(json.loads(json.dumps(serialize_log(log))))
    assert project_tessera(again) == project_tessera(log)
    assert log_digest(again) == log_digest(log)
    v1 = next(r for r in serialize_log(log) if r["id"] == "f-v1-ok")
    assert all("binding" not in e for e in v1["evidence"])   # no "binding": null on v1


def test_strict_required_fields_match_typescript():
    base = rec("d", "decision")
    for k in ("evidence", "targets", "is_trust_root"):
        r = copy.deepcopy(base)
        del r[k]
        try:
            record_to_event(r)
        except ParseError:
            continue
        raise AssertionError(f"missing {k} accepted")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)}/{len(tests)} v2 binding rules hold.")
