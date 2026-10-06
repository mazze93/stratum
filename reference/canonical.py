"""
canonical.py — RFC 8785 (JCS) canonical bytes + the persisted-record hash chain.
================================================================================
Reference twin of core/src/canonical.ts and core/src/chain.ts (ADR-003 §5, §8).
Both implementations must emit byte-identical output; data/canonical.golden.json
pins them, tested from both sides.

Stdlib only (hashlib, json). Fail-closed: non-finite numbers, integers outside
the IEEE-754 safe range, lone surrogates and non-JSON values are refused.
"""

from __future__ import annotations

import hashlib
import json
import math

GENESIS_DIGEST = "0" * 64
_SAFE = 2**53 - 1


class CanonicalError(ValueError):
    pass


def _str(s: str) -> str:
    if any(0xD800 <= ord(c) <= 0xDFFF for c in s):
        # Python strs hold code points; a surrogate code point is a lone one.
        raise CanonicalError("canonical: lone surrogate")
    # ensure_ascii=False + Python's escapes (\" \\ \b \f \n \r \t, \u00xx
    # lowercase for other controls) match ES JSON.stringify exactly.
    return json.dumps(s, ensure_ascii=False)


def _es_number(x: float) -> str:
    """ES Number::toString (ECMA-262 §6.1.6.1.20) from Python's shortest repr."""
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    r = repr(abs(x))                      # shortest round-trip digits, like ES
    mant, _, exp = r.partition("e")
    exp_i = int(exp) if exp else 0
    if "." in mant:
        ip, fp = mant.split(".")
    else:
        ip, fp = mant, ""
    digits = (ip + fp).lstrip("0")
    lead_zeros = len(ip + fp) - len((ip + fp).lstrip("0"))
    # value = 0.digits × 10^n  (ES's n): position of the decimal point
    n = len(ip) - lead_zeros + exp_i
    digits = digits.rstrip("0")
    k = len(digits)
    if k <= n <= 21:
        out = digits + "0" * (n - k)
    elif 0 < n <= 21:
        out = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        out = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        out = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return sign + out


def _num(x) -> str:
    if isinstance(x, bool):
        raise CanonicalError("canonical: bool reached the number path")
    if isinstance(x, int):
        if abs(x) > _SAFE:
            raise CanonicalError("canonical: integer outside the safe range")
        return str(x)
    if not math.isfinite(x):
        raise CanonicalError("canonical: non-finite number")
    if x.is_integer() and abs(x) > _SAFE:
        raise CanonicalError("canonical: integer outside the safe range")
    return _es_number(x)


def canonicalize(v) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return _num(v)
    if isinstance(v, str):
        return _str(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(canonicalize(x) for x in v) + "]"
    if isinstance(v, dict):
        if any(not isinstance(k, str) for k in v):
            raise CanonicalError("canonical: object keys must be strings")
        for k in v:
            _str(k)  # validate before sorting: a lone surrogate can't be UTF-16-encoded
        # RFC 8785 §3.2.3: sort by UTF-16 code units (big-endian bytes order identically)
        keys = sorted(v, key=lambda k: k.encode("utf-16-be"))
        return "{" + ",".join(_str(k) + ":" + canonicalize(v[k]) for k in keys) + "}"
    raise CanonicalError(f"canonical: {type(v).__name__} is not a JSON value")


def canonical_bytes(v) -> bytes:
    return canonicalize(v).encode("utf-8")


def chain_link(prev: str, record) -> str:
    """link(prev, record) = sha256_hex(utf8(prev) ‖ JCS(record)) — after claude-stamp."""
    return hashlib.sha256((prev + canonicalize(record)).encode("utf-8")).hexdigest()


def chain_digest(records) -> str:
    """Head digest of a record sequence, hashed exactly as given. For a log's
    content address use log_digest, which hashes the normalized wire records."""
    prev = GENESIS_DIGEST
    for r in records:
        prev = chain_link(prev, r)
    return prev


def log_digest(log) -> str:
    """Content address of a log as the contract sees it: the chain over its
    normalized wire records (serialize_log), so a trace file and a Durable
    Object seeded from it agree even when the file carries extra fields."""
    from tessera_projection import serialize_log
    return chain_digest(serialize_log(log))
