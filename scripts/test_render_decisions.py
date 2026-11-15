#!/usr/bin/env python3
"""Regression tests for v2 bindings, v1 metadata and Markdown evidence cells."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("render_decisions", ROOT / "scripts/render-decisions.py")
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class RendererTest(unittest.TestCase):
    def test_v2_timestamp_alone_is_not_checked(self):
        self.assertFalse(renderer.checked_evidence({"schema_version": 2}, {"checked_at": "typed"}))

    def test_v2_binding_counts_without_timestamp(self):
        evidence = {"ref": "check", "checked_at": None, "binding": {
            "type": "reproducible_check", "command": "npm test", "commit": "a" * 40, "expect_exit": 0}}
        self.assertTrue(renderer.checked_evidence({"schema_version": 2}, evidence))
        self.assertIn("expect exit 0", renderer.evidence_detail({"schema_version": 2}, evidence))

    def test_v1_timestamp_semantics_are_preserved(self):
        self.assertTrue(renderer.checked_evidence({"schema_version": 1}, {"checked_at": ""}))
        self.assertFalse(renderer.checked_evidence({"schema_version": 1}, {"checked_at": None}))

    def test_real_ingress_bound_verification_is_rendered(self):
        lines = []
        renderer.render_trace(ROOT / "data/ingress-trace.jsonl", "Ingress", "", lines.append)
        table = "\n".join(lines).split("## Checked-evidence ledger")[1]
        self.assertIn("ig-005", table)
        self.assertIn("3553a6c01da6c9db6a78fe53277d9d3a62070068", table)
        self.assertNotIn("No checked", table)

    def test_attestation_is_not_checked_before_registry(self):
        evidence = {"ref": "claim", "binding": {"type": "signed_attestation",
            "subject_sha256": "a" * 64, "key_id": "key"}}
        self.assertFalse(renderer.checked_evidence({"schema_version": 2}, evidence))
        self.assertIn("registry not implemented", renderer.evidence_detail({"schema_version": 2}, evidence))

    def test_table_cells_cannot_split_rows(self):
        self.assertEqual(renderer.table_cell("a | b\nc"), "a &#124; b c")


if __name__ == "__main__":
    unittest.main()
