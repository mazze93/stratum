#!/usr/bin/env python3
"""Render fixtures/managed-client-v1/ from the reference oracle (joint spec v1.1, WP01).

Every expected digest and refusal code below is computed by reference/managed.py;
each case also names the code its author expects, and rendering aborts if the
oracle disagrees, so a fixture can't silently encode a typo. Both
core/test/managed.test.ts and reference/test_managed.py consume the output, and
the manifest pins every file by SHA-256. Never hand-edit the output; a change
means a new bundle digest and a review (R09):

  python3 scripts/render-managed-fixtures.py          # write
  python3 scripts/render-managed-fixtures.py --check  # exit 1 if the bundle is stale
"""

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))

import managed as m  # noqa: E402
from canonical import canonical_bytes  # noqa: E402
from tessera_projection import ParseError, record_to_event  # noqa: E402

OUT = ROOT / "fixtures" / "managed-client-v1"
BUNDLE = "stratum.managed-client.v1"


def d(label: str) -> str:
    """A deterministic stand-in digest. Fixture data is synthetic by design."""
    return hashlib.sha256(f"fixture:{label}".encode()).hexdigest()


LOG_ID = "cm-" + d("log")[:32]
CLIENT = "checkmate"
CASE = "case-synthetic-1"
HEAD0 = d("head/0")
HEAD1 = d("head/1")

CLAIM = {
    "claim_id": "claim-impact",
    "revision_id": "rev-impact-1",
    "proposition": "Synthetic fixture: the impact claim holds within its declared scope.",
    "scope_digest": d("scope/impact/1"),
    "obligations": ["execution_receipt", "oracle_result", "negative_control"],
    "requires": [{"revision_id": "rev-interp-1", "scope_digest": d("scope/interp/1")}],
}
EVIDENCE = {
    "evidence_id": "ev-static-1",
    "artifact_sha256": d("artifact/static-1"),
    "size_bytes": 4096,
    "media_type": "application/json",
    "private_locator": "r2://checkmate-evidence/ev-static-1",
    "recipe_sha256": d("recipe/static"),
    "environment_sha256": d("environment/macos-27"),
    "retention_class": "case",
}
PAYLOADS = {
    "register_claim": CLAIM,
    "register_evidence": EVIDENCE,
    "request_verification": {"revision_id": "rev-impact-1", "evidence_ids": ["ev-static-1"],
                             "recipe_sha256": d("recipe/static")},
    "apply_verification": {"revision_id": "rev-impact-1", "receipt_ref": "rcpt-1", "oracle_ref": "oracle-1",
                           "attestation_ref": "att-1"},
    "invalidate_evidence": {"evidence_id": "ev-static-1",
                            "reason": "Synthetic fixture: the interpretation trace was corrected.",
                            "evidence_refs": ["ev-static-2"]},
    "revise_claim": {"prior_revision_id": "rev-impact-1", "transition": "supersede",
                     "revision": {**CLAIM, "revision_id": "rev-impact-2", "scope_digest": d("scope/impact/2")}},
    "dispute_claim": {"revision_id": "rev-impact-1", "reason": "Synthetic fixture: the oracle lacks a negative control."},
}


def command(op, payload, *, source=None, command_id=None, prior=None, head=HEAD0, client=CLIENT):
    norm = m.parse_payload(op, payload)
    return {
        "protocol": 1, "client_id": client, "case_id": CASE,
        "source_event_id": source or f"src-{op}", "command_id": command_id or f"cmd-{op}-1",
        "prior_command_id": prior, "operation": op, "expected_head_digest": head,
        "payload_digest": m.payload_digest(op, norm), "payload": payload,
    }


def tweak(cmd, **changes):
    """A copy with top-level fields replaced; a `None` value for `_drop` keys removes them."""
    out = {**cmd, **{k: v for k, v in changes.items() if k != "_drop"}}
    for k in changes.get("_drop", ()):
        del out[k]
    return out


def with_payload(cmd, **changes):
    """Replace payload fields WITHOUT updating payload_digest, so only the decoder judges them."""
    return {**cmd, "payload": {**cmd["payload"], **changes}}


def valid_cases():
    cases = [(f"{op}: minimal valid command", command(op, p)) for op, p in PAYLOADS.items()]
    base = command("register_evidence", EVIDENCE)
    cases += [
        ("rebased retry: new command id and head, same effect",
         command("register_evidence", EVIDENCE, command_id="cmd-register_evidence-2",
                 prior="cmd-register_evidence-1", head=HEAD1)),
        ("changed effect under the same source event",
         command("register_evidence", {**EVIDENCE, "size_bytes": 8192})),
        ("protocol written as 1.0 is protocol 1", tweak(base, protocol=1.0)),
        ("size_bytes written as 4096.0 normalizes to 4096", with_payload(base, size_bytes=4096.0)),
        ("prerequisites at the 32-edge limit",
         command("register_claim", {**CLAIM, "requires": [
             {"revision_id": f"rev-pre-{i}", "scope_digest": d(f"scope/pre/{i}")} for i in range(32)]})),
        ("proposition at 8000 UTF-16 units (astral characters count twice)",
         command("register_claim", {**CLAIM, "proposition": "\U0001F600" * 4000})),
    ]
    out = []
    for name, cmd in cases:
        parsed = m.parse_command(json.loads(json.dumps(cmd)), CLIENT)
        out.append({"name": name, "ingress_client_id": CLIENT, "command": cmd, "expect": {
            "payload_digest": parsed["payload_digest"],
            "command_digest": m.command_digest(parsed, LOG_ID),
            "effect_digest": m.effect_digest(parsed),
        }})
    return out


def invalid_cases():
    claim = command("register_claim", CLAIM)
    ev = command("register_evidence", EVIDENCE)
    req = command("request_verification", PAYLOADS["request_verification"])
    rev = command("revise_claim", PAYLOADS["revise_claim"])
    edge = CLAIM["requires"][0]
    cases = [
        ("protocol 2", "unsupported_version", tweak(ev, protocol=2)),
        ("protocol true", "unsupported_version", tweak(ev, protocol=True)),
        ("protocol as a string", "unsupported_version", tweak(ev, protocol="1")),
        ("missing protocol", "unsupported_version", tweak(ev, _drop=["protocol"])),
        ("body names another client", "forbidden", tweak(ev, client_id="other-client")),
        ("unknown top-level field", "invalid_contract", tweak(ev, authority="authoritative_verified")),
        ("missing payload_digest", "invalid_contract", tweak(ev, _drop=["payload_digest"])),
        ("payload_digest does not match", "invalid_contract", tweak(ev, payload_digest=d("wrong"))),
        ("uppercase digest", "invalid_contract", tweak(ev, expected_head_digest=HEAD0.upper())),
        ("unknown operation", "invalid_contract", tweak(ev, operation="ratify_claim")),
        ("prior_command_id equals command_id", "invalid_contract",
         tweak(ev, prior_command_id=ev["command_id"])),
        ("id with a slash", "invalid_contract", tweak(ev, case_id="case/1")),
        ("id of 129 characters", "invalid_contract", tweak(ev, source_event_id="s" * 129)),
        ("payload carries a supplied verdict", "invalid_contract", with_payload(ev, verified=True)),
        ("self prerequisite edge", "invalid_contract",
         with_payload(claim, requires=[{"revision_id": "rev-impact-1", "scope_digest": edge["scope_digest"]}])),
        ("duplicate prerequisite edge", "invalid_contract", with_payload(claim, requires=[edge, edge])),
        ("33 prerequisites", "invalid_contract", with_payload(claim, requires=[
            {"revision_id": f"rev-pre-{i}", "scope_digest": d(f"scope/pre/{i}")} for i in range(33)])),
        ("blank proposition (JS trim whitespace only)", "invalid_contract",
         with_payload(claim, proposition=" 　﻿ ")),
        ("proposition over 8000 UTF-16 units", "invalid_contract",
         with_payload(claim, proposition="\U0001F600" * 4000 + "x")),
        ("file: locator", "invalid_contract", with_payload(ev, private_locator="file:///tmp/ev")),
        ("bare local path locator", "invalid_contract", with_payload(ev, private_locator="/tmp/ev")),
        ("locator containing a space", "invalid_contract", with_payload(ev, private_locator="r2://bucket/a b")),
        ("fractional size", "invalid_contract", with_payload(ev, size_bytes=1.5)),
        ("negative size", "invalid_contract", with_payload(ev, size_bytes=-1)),
        ("boolean size", "invalid_contract", with_payload(ev, size_bytes=True)),
        ("size above 2^53-1", "invalid_contract", with_payload(ev, size_bytes=2**53)),
        ("uppercase media type", "invalid_contract", with_payload(ev, media_type="Application/JSON")),
        ("unknown retention class", "invalid_contract", with_payload(ev, retention_class="forever")),
        ("no evidence ids to verify", "invalid_contract", with_payload(req, evidence_ids=[])),
        ("duplicate evidence ids", "invalid_contract", with_payload(req, evidence_ids=["ev-1", "ev-1"])),
        ("revision reuses the prior revision id", "invalid_contract", with_payload(rev, revision={
            **PAYLOADS["revise_claim"]["revision"], "revision_id": "rev-impact-1"})),
        ("unknown revision transition", "invalid_contract", with_payload(rev, transition="edit_in_place")),
    ]
    out = []
    for name, code, cmd in cases:
        try:
            m.parse_command(json.loads(json.dumps(cmd)), CLIENT)
        except m.ManagedRefusal as e:
            if e.code != code:
                raise SystemExit(f"case {name!r}: oracle says {e.code}, fixture expects {code}")
            out.append({"name": name, "ingress_client_id": CLIENT, "command": cmd, "expect_code": code})
            continue
        raise SystemExit(f"case {name!r}: oracle accepted a command the fixture expects to refuse")
    return out


def reader_cases():
    """Schema 3 is allocated, not readable: both readers refuse it (R08/R09, A11)."""
    base = {"id": "v3-probe", "type": "decision", "agent_id": "fixture", "birth_status": "pending_evidence",
            "claim": {"narrative": "Synthetic fixture."}, "evidence": [], "targets": [],
            "is_trust_root": False, "timestamp": None}
    out = []
    for sv in (m.PROPOSED_EVENT_SCHEMA, 0, 4):
        rec = {**base, "schema_version": sv}
        try:
            record_to_event(rec)
        except ParseError:
            out.append({"name": f"schema_version {sv} is refused", "record": rec, "expect": "refused"})
            continue
        raise SystemExit(f"reader accepted schema_version {sv}")
    return out


def render() -> dict[str, bytes]:
    commands = {
        "bundle": BUNDLE, "protocol": m.MANAGED_PROTOCOL, "log_id": LOG_ID,
        "constants": {
            "operations": list(m.MANAGED_OPERATIONS), "service_methods": list(m.SERVICE_METHODS),
            "failure_codes": {k: {"http": v[0], "handling": v[1]} for k, v in m.FAILURE_CODES.items()},
            "proposed_event_schema": m.PROPOSED_EVENT_SCHEMA, "receipt_domain": m.RECEIPT_DOMAIN,
        },
        "valid": valid_cases(), "invalid": invalid_cases(), "readers": reader_cases(),
        "non_managed_log_id": {"log_id": "checkmate", "expect_code": "invalid_contract"},
    }
    files = {"commands.json": (json.dumps(commands, indent=1, ensure_ascii=False) + "\n").encode()}
    digests = {name: hashlib.sha256(b).hexdigest() for name, b in sorted(files.items())}
    manifest = {"bundle": BUNDLE, "generator": "scripts/render-managed-fixtures.py", "files": digests,
                "bundle_digest": hashlib.sha256(canonical_bytes({"bundle": BUNDLE, "files": digests})).hexdigest()}
    files["manifest.json"] = (json.dumps(manifest, indent=1) + "\n").encode()
    return files


def main() -> int:
    files = render()
    if "--check" in sys.argv[1:]:
        stale = [n for n, b in files.items() if not (OUT / n).exists() or (OUT / n).read_bytes() != b]
        if stale:
            print(f"stale: {', '.join(stale)} (re-run without --check and review the new digest)")
            return 1
        print("fixtures current")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, b in files.items():
        (OUT / name).write_bytes(b)
    print(json.loads(files["manifest.json"])["bundle_digest"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
