/**
 * schema_version 2 evidence binding (ADR-003 §3) — 1:1 twin of
 * reference/test_binding.py. If a test here disagrees with its Python twin,
 * the Python wins.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  Authority,
  ContractViolation,
  ParseError,
  Status,
  authorityOf,
  chainDigest,
  loadLog,
  projectTessera,
  recordToEvent,
  serializeLog,
} from "../src/index.js";

const root = new URL("../../", import.meta.url);
const FIXTURE = new URL("core/test/fixtures/binding-v2.jsonl", root);
const C = "0123456789abcdef0123456789abcdef01234567";

const CHECK = {
  type: "reproducible_check", command: "npm test", repo: "github.com/mazze93/stratum",
  commit: C, expect_exit: 0,
};
const ATTEST = {
  type: "signed_attestation", subject_sha256: "c".repeat(64), predicate: "p",
  key_id: "k1", signature: "c2ln",
};

type Rec = Record<string, unknown>;
const rec = (
  id: string, type: string,
  o: { sv?: unknown; birth?: string; ev?: Rec[]; targets?: string[]; root?: boolean } = {},
): Rec => ({
  id, type, agent_id: "t", schema_version: "sv" in o ? o.sv : 2, birth_status: o.birth ?? "pending_evidence",
  claim: {}, evidence: o.ev ?? [], targets: o.targets ?? [], is_trust_root: o.root ?? false,
  timestamp: null,
});
const ev = (binding?: unknown, checkedAt: string | null = "2026-10-06T20:00:00Z", signer: string | null = "claude"): Rec => ({
  kind: "test_exit", ref: "npm test", checked_at: checkedAt, signer,
  ...(binding !== undefined ? { binding } : {}),
});

function expectRefused(records: Rec[], kind: typeof ContractViolation, match: string): void {
  let err: unknown = null;
  try { loadLog(records); } catch (e) { err = e; }
  expect(err, `expected refusal: ${match}`).toBeInstanceOf(kind);
  expect(String((err as Error).message)).toContain(match);
}

describe("v2 evidence binding (ADR-003 §3)", () => {
  test("test_v2_checked_at_alone_cannot_validate", () => {
    expectRefused(
      [rec("d", "decision"), rec("v", "verification", { birth: "asserted", ev: [ev()], targets: ["d"] })],
      ContractViolation, "no bound evidence",
    );
  });

  test("test_v2_reproducible_check_validates", () => {
    const log = loadLog([
      rec("d", "decision"),
      rec("v", "verification", { birth: "asserted", ev: [ev(CHECK, null, null)], targets: ["d"] }),
    ]);
    expect(log.statusAt("d", log.head)).toBe(Status.Validated);
    expect(authorityOf(log, "d", log.head)).toBe(Authority.Verified);
  });

  test("test_v2_attestation_cannot_validate_before_registry", () => {
    expectRefused(
      [rec("d", "decision"), rec("v", "verification", { birth: "asserted", ev: [ev(ATTEST)], targets: ["d"] })],
      ContractViolation, "no bound evidence",
    );
  });

  test("test_v1_checked_at_still_validates", () => {
    const log = loadLog([
      rec("d", "decision", { sv: 1 }),
      rec("v", "verification", { sv: 1, birth: "asserted", ev: [ev()], targets: ["d"] }),
    ]);
    expect(log.statusAt("d", log.head)).toBe(Status.Validated);
  });

  test("test_v1_evidence_cannot_carry_a_binding", () => {
    expectRefused([rec("d", "decision", { sv: 1, ev: [ev(CHECK)] })], ParseError, "requires schema_version 2");
  });

  test("test_unknown_schema_version_fails_closed", () => {
    for (const sv of [0, 3, "2", true, null]) {
      expectRefused([rec("d", "decision", { sv })], ParseError, "unsupported");
    }
  });

  test("test_malformed_bindings_rejected", () => {
    const bad: [unknown, string][] = [
      [{ ...CHECK, commit: C.slice(0, 12) }, "git object id"],
      [{ ...CHECK, commit: C.toUpperCase() }, "git object id"],
      [{ ...CHECK, command: "" }, "command"],
      [{ ...CHECK, repo: "" }, "repo"],
      [{ ...CHECK, expect_exit: 256 }, "expect_exit"],
      [{ ...CHECK, expect_exit: -1 }, "expect_exit"],
      [{ ...CHECK, expect_exit: true }, "expect_exit"],
      [{ ...CHECK, expect_exit: 0.5 }, "expect_exit"],
      [{ ...CHECK, output_sha256: "z".repeat(64) }, "output_sha256"],
      [{ ...CHECK, inputs: [{ id: "x", sha256: "A".repeat(64) }] }, "inputs[0].sha256"],
      [{ ...CHECK, inputs: [{ id: "", sha256: "a".repeat(64) }] }, "inputs[0].id"],
      [{ ...CHECK, inputs: [{ id: "x", sha256: "a".repeat(64), extra: 1 }] }, "unknown field"],
      [{ ...CHECK, verified: true }, "unknown field"],
      [{ ...ATTEST, subject_sha256: "c".repeat(63) }, "subject_sha256"],
      [{ ...ATTEST, key_id: "" }, "key_id"],
      [{ ...CHECK, output_sha256: "b".repeat(64) }, "go together"],
      [{ ...CHECK, output_path: "out.json" }, "go together"],
      [{ ...CHECK, output_sha256: "b".repeat(64), output_path: "../escape.json" }, "output_path"],
      [{ ...CHECK, output_sha256: "b".repeat(64), output_path: "/etc/passwd" }, "output_path"],
      [{ type: "vibes" }, "unknown binding type"],
      ["npm test", "binding must be an object"],
    ];
    for (const [b, why] of bad) {
      expectRefused([rec("d", "decision", { ev: [ev(b)] })], ParseError, why);
    }
  });

  test("test_v2_authority_acts_refused_until_registry", () => {
    expectRefused([rec("r", "decision", { birth: "ratified", root: true })], ContractViolation, "authority registry");
    expectRefused(
      [rec("d", "decision", { birth: "asserted" }), rec("x", "ratification", { birth: "asserted", targets: ["d"] })],
      ContractViolation, "authority registry",
    );
    const v1Root = rec("r", "decision", { sv: 1, birth: "ratified", root: true });
    const sigs = ["A", "B"].map((a) => ({ kind: "policy_authority", ref: a, checked_at: "t", signer: a }));
    expectRefused(
      [v1Root, rec("x", "trust_root_revoked", { birth: "asserted", ev: sigs, targets: ["r"] })],
      ContractViolation, "authority registry",
    );
  });

  test("test_binding_round_trips_and_v1_wire_is_unchanged", () => {
    const recs = readFileSync(FIXTURE, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as unknown);
    const log = loadLog(recs);
    const again = loadLog(JSON.parse(JSON.stringify(serializeLog(log))) as unknown[]);
    expect(projectTessera(again)).toEqual(projectTessera(log));
    expect(chainDigest(serializeLog(again))).toBe(chainDigest(serializeLog(log)));
    const v1 = serializeLog(log).find((r) => r.id === "f-v1-ok")!;
    expect(v1.evidence.every((e) => !("binding" in e))).toBe(true);
  });

  test("test_strict_required_fields_match_typescript", () => {
    for (const k of ["evidence", "targets", "is_trust_root"]) {
      const r = rec("d", "decision");
      delete r[k];
      expect(() => recordToEvent(r), k).toThrow(ParseError);
    }
  });
});

describe("cross-implementation: the v2 fixture", () => {
  test("projection and head digest are byte-identical to the oracle", () => {
    const recs = readFileSync(FIXTURE, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as unknown);
    const log = loadLog(recs);
    const oracle = JSON.parse(
      execFileSync(
        "python3",
        ["-I", "-c",
         "import json,sys;sys.path.insert(0,sys.argv[1]);" +
         "from tessera_projection import load_log,project_tessera;from canonical import log_digest;" +
         "l=load_log([json.loads(x) for x in open(sys.argv[2]) if x.strip()]);" +
         "print(json.dumps({'p':project_tessera(l),'d':log_digest(l)}))",
         fileURLToPath(new URL("reference", root)), fileURLToPath(FIXTURE)],
        { encoding: "utf8" },
      ),
    ) as { p: unknown; d: string };
    expect(projectTessera(log)).toEqual(oracle.p);
    expect(chainDigest(serializeLog(log))).toBe(oracle.d);
  });
});
