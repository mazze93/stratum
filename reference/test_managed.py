"""
test_managed.py — managed client protocol 1 against its own fixture bundle.

fixtures/managed-client-v1/ is rendered from this oracle, so passing here
proves the bundle is current and self-consistent; the cross-implementation
proof is core/test/managed.test.ts reproducing the same values.

Run:  python3 test_managed.py
"""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import managed as m
from canonical import canonical_bytes
from tessera_projection import ParseError, record_to_event

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "fixtures" / "managed-client-v1"
MANIFEST = json.loads((DIR / "manifest.json").read_text())
FX = json.loads((DIR / "commands.json").read_text())


def _code(f):
    try:
        f()
    except m.ManagedRefusal as e:
        return e.code
    return None


def test_bundle_is_current():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "render-managed-fixtures.py"), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_manifest_digests():
    for name, digest in MANIFEST["files"].items():
        assert hashlib.sha256((DIR / name).read_bytes()).hexdigest() == digest, name
    bundle = {"bundle": MANIFEST["bundle"], "files": MANIFEST["files"]}
    assert hashlib.sha256(canonical_bytes(bundle)).hexdigest() == MANIFEST["bundle_digest"]


def test_valid_commands():
    for c in FX["valid"]:
        cmd = m.parse_command(c["command"], c["ingress_client_id"])
        assert cmd["payload_digest"] == c["expect"]["payload_digest"], c["name"]
        assert m.command_digest(cmd, FX["log_id"]) == c["expect"]["command_digest"], c["name"]
        assert m.effect_digest(cmd) == c["expect"]["effect_digest"], c["name"]


def test_invalid_commands():
    for c in FX["invalid"]:
        assert _code(lambda: m.parse_command(c["command"], c["ingress_client_id"])) == c["expect_code"], c["name"]
    cmd = m.parse_command(FX["valid"][0]["command"], FX["valid"][0]["ingress_client_id"])
    nm = FX["non_managed_log_id"]
    assert _code(lambda: m.command_digest(cmd, nm["log_id"])) == nm["expect_code"]


def test_schema_3_is_not_readable():
    assert m.PROPOSED_EVENT_SCHEMA not in {1, 2}
    for c in FX["readers"]:
        try:
            record_to_event(c["record"])
        except ParseError:
            continue
        raise AssertionError(f"reader accepted: {c['name']}")


def test_receipt_signing_bytes():
    assert m.receipt_signing_bytes({"b": 1, "a": "x"}) == b'stratum execution receipt 1\n{"a":"x","b":1}'


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)}/{len(tests)} managed-protocol properties hold.")
