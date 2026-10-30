/**
 * schemas/managed-client.v1.schema.json and schemas/event.v3.schema.json are
 * hand-written, like event.v2. This keeps them from drifting: every enum,
 * pattern and strict key set must equal what managed.ts enforces, the receipt
 * fixtures must have exactly the schema's shape, and v3 must inherit v2's
 * definitions unchanged while staying unreadable (joint spec v1.1, WP01).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { canonicalBytes } from "../src/canonical.js";
import { SCHEMA_VERSIONS, SHA256_HEX } from "../src/contract.js";
import {
  FAILURE_CODES,
  MANAGED_ID,
  MANAGED_LIMITS,
  MANAGED_LOG_ID,
  MANAGED_OPERATIONS,
  PAYLOAD_KEYS,
  PROPOSED_EVENT_SCHEMA,
  receiptSigningBytes,
  RETENTION_CLASSES,
  REVISION_TRANSITIONS,
} from "../src/managed.js";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const read = (path: string) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")) as Json;
const mc = read("schemas/managed-client.v1.schema.json");
const v2 = read("schemas/event.v2.schema.json");
const v3 = read("schemas/event.v3.schema.json");
const rx = read("fixtures/managed-client-v1/receipts.json");
const defs = mc["$defs"] as Json;
const sorted = (xs: Iterable<unknown>) => [...xs].map(String).sort();
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
/** A def's own keys, following one $ref (register_claim's payload is the shared claim_revision). */
const deref = (d: Json): Json => (d["$ref"] ? defs[(d["$ref"] as string).split("/").pop()!] : d);

describe("managed-client.v1.schema.json agrees with managed.ts", () => {
  test("patterns are the decoder's regexes", () => {
    expect(defs.id.pattern).toBe(MANAGED_ID.source);
    expect(defs.sha256.pattern).toBe(SHA256_HEX.source);
    expect(defs.execution_receipt.properties.log_id.pattern).toBe(MANAGED_LOG_ID.source);
  });

  test("enums: operations, refusal codes, transitions, retention", () => {
    expect(defs.command.properties.operation.enum).toEqual([...MANAGED_OPERATIONS]);
    expect(sorted(defs.refusal.properties.code.enum)).toEqual(sorted(Object.keys(FAILURE_CODES)));
    expect(defs.payload_revise_claim.properties.transition.enum).toEqual([...REVISION_TRANSITIONS]);
    expect(defs.payload_register_evidence.properties.retention_class.enum).toEqual([...RETENTION_CLASSES]);
  });

  test("every operation's payload is a strict key set equal to PAYLOAD_KEYS", () => {
    for (const op of MANAGED_OPERATIONS) {
      const d = deref(defs[`payload_${op}`]);
      expect(d.additionalProperties, op).toBe(false);
      expect(sorted(Object.keys(d.properties)), op).toEqual(sorted(PAYLOAD_KEYS[op]));
      expect(sorted(d.required), op).toEqual(sorted(PAYLOAD_KEYS[op]));
    }
  });

  test("the command dispatches each operation to its payload def", () => {
    const dispatch = (defs.command.allOf as Json[]).map((b) => [b.if.properties.operation.const, b.then.properties.payload["$ref"]]);
    expect(dispatch).toEqual(MANAGED_OPERATIONS.map((op) => [op, `#/$defs/payload_${op}`]));
  });

  test("limits match MANAGED_LIMITS", () => {
    expect(defs.claim_revision.properties.requires.maxItems).toBe(MANAGED_LIMITS.requiredPrerequisitesPerRevision);
    expect(defs.claim_revision.properties.proposition.maxLength).toBe(MANAGED_LIMITS.maxPropositionLength);
    expect(defs.payload_invalidate_evidence.properties.reason.maxLength).toBe(MANAGED_LIMITS.maxProseLength);
  });
});

describe("receipt fixtures have exactly the schema's shape and the oracle's signing bytes", () => {
  for (const [name, def] of [["receipt", "execution_receipt"], ["oracle_result", "oracle_result"]] as const) {
    test(`${name} keys = ${def} required = properties`, () => {
      const d = defs[def] as Json;
      expect(d.additionalProperties).toBe(false);
      expect(sorted(Object.keys(rx[name]))).toEqual(sorted(d.required));
      expect(sorted(d.required)).toEqual(sorted(Object.keys(d.properties)));
    });
  }
  test("receipt binds its oracle result by digest", () => {
    expect(rx.receipt.oracle_sha256).toBe(sha256(canonicalBytes(rx.oracle_result)));
  });
  test("receipt digest and signing digest match the oracle", () => {
    expect(sha256(canonicalBytes(rx.receipt))).toBe(rx.receipt_sha256);
    expect(sha256(receiptSigningBytes(rx.receipt))).toBe(rx.signing_sha256);
  });
  test("rebinding client, log, revision, scope or policy changes the signed bytes (A04, structural half)", () => {
    expect(sorted((rx.rebound as Json[]).map((r) => r.field))).toEqual(
      sorted(["client_id", "log_id", "revision_id", "scope_digest", "policy_digest"]));
    for (const r of rx.rebound as Json[]) {
      const digest = sha256(receiptSigningBytes({ ...rx.receipt, [r.field]: r.value }));
      expect(digest, r.field).toBe(r.signing_sha256);
      expect(digest, r.field).not.toBe(rx.signing_sha256);
    }
  });
});

describe("event.v3.schema.json is v2 plus the schema-3 additions, and stays unreadable", () => {
  test("schema_version is the allocated 3, which no reader accepts", () => {
    expect(v3.properties.schema_version.const).toBe(PROPOSED_EVENT_SCHEMA);
    expect(SCHEMA_VERSIONS.has(PROPOSED_EVENT_SCHEMA)).toBe(false);
  });
  test("definitions inherited from v2 are unchanged", () => {
    for (const k of ["sha256", "reproducible_check", "signed_attestation"]) expect(v3.$defs[k], k).toEqual(v2.$defs[k]);
    for (const k of ["id", "type", "agent_id", "birth_status", "claim", "evidence", "targets", "is_trust_root", "timestamp"]) {
      expect(v3.properties[k], k).toEqual(v2.properties[k]);
    }
    expect(v3.required).toEqual([...v2.required, "requires"]);
  });
  test("v3 bindings are v2's plus executed_check, which wraps a recipe and adds the execution", () => {
    const refs = (v3.$defs.evidence.properties.binding.oneOf as Json[]).map((x) => x["$ref"]);
    expect(refs).toEqual([...(v2.$defs.evidence.properties.binding.oneOf as Json[]).map((x) => x["$ref"]), "#/$defs/executed_check"]);
    const ec = v3.$defs.executed_check as Json;
    expect(ec.additionalProperties).toBe(false);
    expect(ec.properties.recipe["$ref"]).toBe("#/$defs/reproducible_check");
    expect(sorted(ec.required)).toEqual(sorted(["type", "recipe", "receipt_sha256", "oracle_sha256", "attestation"]));
  });
  test("a v3 verification must contain an executed_check: a recipe alone cannot validate", () => {
    const rule = (v3.allOf as Json[]).find((b) => b.if.properties.type.const === "verification")!;
    expect(rule.then.properties.evidence.contains.properties.binding["$ref"]).toBe("#/$defs/executed_check");
  });
  test("required edges are typed, bounded, and separate from targets", () => {
    expect(v3.properties.requires.maxItems).toBe(MANAGED_LIMITS.requiredPrerequisitesPerRevision);
    expect(v3.$defs.required_edge).toEqual(defs.required_edge);
    expect(v3.properties.targets).toEqual(v2.properties.targets);
  });
});
