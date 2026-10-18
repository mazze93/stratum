"""
managed.py — managed client protocol 1: wire decoders and canonical identities.
==============================================================================
Reference twin of core/src/managed.ts (joint spec v1.1 §6, contracts C01-C03).
fixtures/managed-client-v1/ is GENERATED from this module
(scripts/render-managed-fixtures.py) and checked from both sides, so the
TypeScript port must reproduce every digest and refusal code the oracle emits.

Frozen contract only (M0): nothing here appends, resolves a log or checks a
capability. PROPOSED_EVENT_SCHEMA is allocated, not readable.

Stdlib only. Portability rules the TS side shares: every pattern is matched
with fullmatch (Python's `$` accepts a trailing newline), lengths count UTF-16
code units, and "blank" means JS String.prototype.trim()'s whitespace set.
"""

from __future__ import annotations

import hashlib
import math
import re

from canonical import canonical_bytes

MANAGED_PROTOCOL = 1
RESEARCH_PROFILE = 1
PROPOSED_EVENT_SCHEMA = 3
MANAGED_LOG_ID = re.compile(r"cm-[0-9a-f]{32}")
MANAGED_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
SHA256_HEX = re.compile(r"[0-9a-f]{64}")
MEDIA_TYPE = re.compile(r"[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*")
LOCATOR = re.compile(r"[a-z][a-z0-9+.-]*://[\x21-\x7e]+")

MANAGED_OPERATIONS = (
    "register_claim", "register_evidence", "request_verification", "apply_verification",
    "invalidate_evidence", "revise_claim", "dispute_claim",
)
SERVICE_METHODS = ("provisionCase", "submitCommand", "getCommandResult", "getCaseSnapshot")
FAILURE_CODES = {
    "invalid_contract": (400, "terminal_until_corrected"),
    "unsupported_version": (400, "terminal_until_compatible"),
    "unauthorized": (401, "deny_no_escalation"),
    "forbidden": (403, "deny_no_escalation"),
    "head_conflict": (409, "reevaluate_new_command_id"),
    "idempotency_conflict": (409, "operator_review"),
    "dependency_blocked": (409, "preserve_proposal_review"),
    "evidence_rejected": (409, "preserve_proposal_review"),
    "unavailable": (503, "bounded_retry"),
}
MAX_PREREQUISITES = 32
MAX_PROSE = 4000
MAX_PROPOSITION = 8000
MAX_REFS = 64
REVISION_TRANSITIONS = ("supersede", "reject_and_relink", "dispute_and_relink")
RETENTION_CLASSES = ("case", "permanent")
DOMAIN_PAYLOAD = "stratum.managed.payload.v1"
DOMAIN_COMMAND = "stratum.managed.command.v1"
DOMAIN_EFFECT = "stratum.managed.effect.v1"
RECEIPT_DOMAIN = "stratum execution receipt 1"

COMMAND_KEYS = (
    "protocol", "client_id", "case_id", "source_event_id", "command_id",
    "prior_command_id", "operation", "expected_head_digest", "payload_digest", "payload",
)
PAYLOAD_KEYS = {
    "register_claim": ("claim_id", "revision_id", "proposition", "scope_digest", "obligations", "requires"),
    "register_evidence": ("evidence_id", "artifact_sha256", "size_bytes", "media_type", "private_locator",
                          "recipe_sha256", "environment_sha256", "retention_class"),
    "request_verification": ("revision_id", "evidence_ids", "recipe_sha256"),
    "apply_verification": ("revision_id", "receipt_ref", "oracle_ref", "attestation_ref"),
    "invalidate_evidence": ("evidence_id", "reason", "evidence_refs"),
    "revise_claim": ("prior_revision_id", "transition", "revision"),
    "dispute_claim": ("revision_id", "reason"),
}

# ECMAScript WhiteSpace + LineTerminator: exactly what String.prototype.trim() strips.
_JS_TRIM = set("\t\n\v\f\r       　﻿") | {
    chr(c) for c in range(0x2000, 0x200B)
}
_SAFE = 2**53 - 1


class ManagedRefusal(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _bad(msg: str):
    raise ManagedRefusal("invalid_contract", msg)


def _u16len(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def _obj(x, ctx, keys):
    if not isinstance(x, dict):
        _bad(f"{ctx}: must be an object")
    for k in x:
        if k not in keys:
            _bad(f"{ctx}: unknown field {k!r}")
    for k in keys:
        if k not in x:
            _bad(f"{ctx}: missing field {k!r}")
    return x


def _id(x, ctx):
    if not isinstance(x, str) or not MANAGED_ID.fullmatch(x):
        _bad(f"{ctx}: must be an opaque id")
    return x


def _digest(x, ctx):
    if not isinstance(x, str) or not SHA256_HEX.fullmatch(x):
        _bad(f"{ctx}: must be 64 lowercase hex")
    return x


def _prose(x, ctx, limit=MAX_PROSE):
    if not isinstance(x, str) or all(c in _JS_TRIM for c in x) or _u16len(x) > limit:
        _bad(f"{ctx}: must be 1-{limit} characters")
    return x


def _ids(x, ctx, minimum):
    if not isinstance(x, list) or not minimum <= len(x) <= MAX_REFS:
        _bad(f"{ctx}: must list {minimum}-{MAX_REFS} ids")
    out = [_id(v, f"{ctx}[{i}]") for i, v in enumerate(x)]
    if len(set(out)) != len(out):
        _bad(f"{ctx}: duplicate id")
    return out


def _one_of(x, ctx, values):
    if not isinstance(x, str) or x not in values:
        _bad(f"{ctx}: unsupported value")
    return x


def _safe_nonneg_int(x):
    """JSON integers as JS sees them: 1.0 is 1, a bool is not a number."""
    if isinstance(x, bool):
        return None
    if isinstance(x, float):
        if not math.isfinite(x) or not x.is_integer():
            return None
        x = int(x)
    if not isinstance(x, int) or not 0 <= x <= _SAFE:
        return None
    return x


def _claim_revision(x, ctx):
    r = _obj(x, ctx, PAYLOAD_KEYS["register_claim"])
    revision_id = _id(r["revision_id"], f"{ctx}.revision_id")
    raw = r["requires"]
    if not isinstance(raw, list):
        _bad(f"{ctx}.requires: must be an array")
    if len(raw) > MAX_PREREQUISITES:
        _bad(f"{ctx}.requires: more than {MAX_PREREQUISITES} prerequisites")
    requires = []
    for i, e in enumerate(raw):
        edge = _obj(e, f"{ctx}.requires[{i}]", ("revision_id", "scope_digest"))
        requires.append({
            "revision_id": _id(edge["revision_id"], f"{ctx}.requires[{i}].revision_id"),
            "scope_digest": _digest(edge["scope_digest"], f"{ctx}.requires[{i}].scope_digest"),
        })
    if any(e["revision_id"] == revision_id for e in requires):
        _bad(f"{ctx}.requires: self edge")
    if len({e["revision_id"] for e in requires}) != len(requires):
        _bad(f"{ctx}.requires: duplicate edge")
    return {
        "claim_id": _id(r["claim_id"], f"{ctx}.claim_id"),
        "revision_id": revision_id,
        "proposition": _prose(r["proposition"], f"{ctx}.proposition", MAX_PROPOSITION),
        "scope_digest": _digest(r["scope_digest"], f"{ctx}.scope_digest"),
        "obligations": _ids(r["obligations"], f"{ctx}.obligations", 0),
        "requires": requires,
    }


def parse_payload(operation, x):
    ctx = f"payload({operation})"
    if operation == "register_claim":
        return _claim_revision(x, ctx)
    if operation == "register_evidence":
        r = _obj(x, ctx, PAYLOAD_KEYS[operation])
        size = _safe_nonneg_int(r["size_bytes"])
        if size is None:
            _bad(f"{ctx}.size_bytes: must be a nonnegative safe integer")
        media = r["media_type"]
        if not isinstance(media, str) or not MEDIA_TYPE.fullmatch(media):
            _bad(f"{ctx}.media_type: must be a lowercase type/subtype")
        loc = r["private_locator"]
        if not isinstance(loc, str) or _u16len(loc) > 512 or not LOCATOR.fullmatch(loc) or loc.startswith("file:"):
            _bad(f"{ctx}.private_locator: must be a durable scheme://locator, not a local path")
        return {
            "evidence_id": _id(r["evidence_id"], f"{ctx}.evidence_id"),
            "artifact_sha256": _digest(r["artifact_sha256"], f"{ctx}.artifact_sha256"),
            "size_bytes": size,
            "media_type": media,
            "private_locator": loc,
            "recipe_sha256": _digest(r["recipe_sha256"], f"{ctx}.recipe_sha256"),
            "environment_sha256": _digest(r["environment_sha256"], f"{ctx}.environment_sha256"),
            "retention_class": _one_of(r["retention_class"], f"{ctx}.retention_class", RETENTION_CLASSES),
        }
    if operation == "request_verification":
        r = _obj(x, ctx, PAYLOAD_KEYS[operation])
        return {
            "revision_id": _id(r["revision_id"], f"{ctx}.revision_id"),
            "evidence_ids": _ids(r["evidence_ids"], f"{ctx}.evidence_ids", 1),
            "recipe_sha256": _digest(r["recipe_sha256"], f"{ctx}.recipe_sha256"),
        }
    if operation == "apply_verification":
        r = _obj(x, ctx, PAYLOAD_KEYS[operation])
        return {k: _id(r[k], f"{ctx}.{k}") for k in PAYLOAD_KEYS[operation]}
    if operation == "invalidate_evidence":
        r = _obj(x, ctx, PAYLOAD_KEYS[operation])
        return {
            "evidence_id": _id(r["evidence_id"], f"{ctx}.evidence_id"),
            "reason": _prose(r["reason"], f"{ctx}.reason"),
            "evidence_refs": _ids(r["evidence_refs"], f"{ctx}.evidence_refs", 0),
        }
    if operation == "revise_claim":
        r = _obj(x, ctx, PAYLOAD_KEYS[operation])
        prior = _id(r["prior_revision_id"], f"{ctx}.prior_revision_id")
        revision = _claim_revision(r["revision"], f"{ctx}.revision")
        if revision["revision_id"] == prior:
            _bad(f"{ctx}: a revision must have a new revision_id")
        return {
            "prior_revision_id": prior,
            "transition": _one_of(r["transition"], f"{ctx}.transition", REVISION_TRANSITIONS),
            "revision": revision,
        }
    if operation == "dispute_claim":
        r = _obj(x, ctx, PAYLOAD_KEYS[operation])
        return {"revision_id": _id(r["revision_id"], f"{ctx}.revision_id"), "reason": _prose(r["reason"], f"{ctx}.reason")}
    _bad("command.operation: unknown operation")


def _h(v) -> str:
    return hashlib.sha256(canonical_bytes(v)).hexdigest()


def payload_digest(operation, payload) -> str:
    return _h({"domain": DOMAIN_PAYLOAD, "operation": operation, "payload": payload})


def parse_command(x, ingress_client_id):
    if not isinstance(x, dict):
        _bad("command: must be an object")
    p = x.get("protocol")
    if isinstance(p, bool) or p != MANAGED_PROTOCOL or _safe_nonneg_int(p) != MANAGED_PROTOCOL:
        raise ManagedRefusal("unsupported_version", "command: unsupported managed protocol")
    r = _obj(x, "command", COMMAND_KEYS)
    client_id = _id(r["client_id"], "command.client_id")
    if client_id != ingress_client_id:
        raise ManagedRefusal("forbidden", "command: client_id does not match the authenticated client")
    command_id = _id(r["command_id"], "command.command_id")
    prior = r["prior_command_id"]
    if prior is not None:
        _id(prior, "command.prior_command_id")
        if prior == command_id:
            _bad("command.prior_command_id: must differ from command_id")
    op = r["operation"]
    if not isinstance(op, str) or op not in MANAGED_OPERATIONS:
        _bad("command.operation: unknown operation")
    payload = parse_payload(op, r["payload"])
    claimed = _digest(r["payload_digest"], "command.payload_digest")
    if claimed != payload_digest(op, payload):
        _bad("command.payload_digest: does not match the canonical payload")
    return {
        "protocol": MANAGED_PROTOCOL,
        "client_id": client_id,
        "case_id": _id(r["case_id"], "command.case_id"),
        "source_event_id": _id(r["source_event_id"], "command.source_event_id"),
        "command_id": command_id,
        "prior_command_id": prior,
        "operation": op,
        "expected_head_digest": _digest(r["expected_head_digest"], "command.expected_head_digest"),
        "payload_digest": claimed,
        "payload": payload,
    }


def command_digest(cmd, log_id) -> str:
    if not isinstance(log_id, str) or not MANAGED_LOG_ID.fullmatch(log_id):
        _bad("log_id: not a managed log id")
    return _h({
        "domain": DOMAIN_COMMAND,
        "protocol": cmd["protocol"],
        "log_id": log_id,
        "operation": cmd["operation"],
        "source_event_id": cmd["source_event_id"],
        "expected_head_digest": cmd["expected_head_digest"],
        "payload_digest": cmd["payload_digest"],
    })


def effect_digest(cmd) -> str:
    return _h({
        "domain": DOMAIN_EFFECT,
        "client_id": cmd["client_id"],
        "source_event_id": cmd["source_event_id"],
        "operation": cmd["operation"],
        "payload_digest": cmd["payload_digest"],
    })


def receipt_signing_bytes(receipt) -> bytes:
    return (RECEIPT_DOMAIN + "\n").encode("utf-8") + canonical_bytes(receipt)
