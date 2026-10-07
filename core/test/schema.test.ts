/**
 * schemas/event.v2.schema.json is the normative wire contract consumers
 * validate against (ADR-003 §3, tp-011). It is hand-written, so this test
 * keeps it from drifting from the parsers: every enum, pattern, and strict
 * key set in the schema must equal what core actually enforces.
 */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  GIT_OBJECT_ID,
  isRepoRelativePath,
  KNOWN_TYPES,
  ParseError,
  SCHEMA_VERSIONS,
  SHA256_HEX,
  Status,
  recordToEvent,
} from "../src/index.js";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const schema = JSON.parse(
  readFileSync(new URL("../../schemas/event.v2.schema.json", import.meta.url), "utf8"),
) as Json;
const defs = schema["$defs"] as Json;

const sorted = (xs: Iterable<unknown>) => [...xs].map(String).sort();

describe("event.v2.schema.json agrees with the parsers", () => {
  test("enums: type, schema_version, birth_status", () => {
    expect(sorted(schema.properties.type.enum)).toEqual(sorted(KNOWN_TYPES));
    expect(sorted(schema.properties.schema_version.enum)).toEqual(sorted(SCHEMA_VERSIONS));
    expect(sorted(schema.properties.birth_status.enum)).toEqual(sorted(Object.values(Status)));
  });

  test("patterns are the parser's regexes", () => {
    expect(defs.sha256.pattern).toBe(SHA256_HEX.source);
    expect(defs.reproducible_check.properties.commit.pattern).toBe(GIT_OBJECT_ID.source);
  });

  test("required top-level fields are exactly the ones the parser refuses to default", () => {
    const base: Json = {
      id: "x", type: "decision", agent_id: "a", schema_version: 2,
      birth_status: "asserted", evidence: [], targets: [], is_trust_root: false,
    };
    expect(sorted(schema.required)).toEqual(sorted(Object.keys(base)));
    expect(() => recordToEvent(base)).not.toThrow();
    for (const k of schema.required as string[]) {
      const r = { ...base };
      delete r[k];
      expect(() => recordToEvent(r), `missing ${k}`).toThrow(ParseError);
    }
  });

  test("output_path: the schema's pattern agrees with the parser, and the pair is mutual", () => {
    const rc = defs.reproducible_check as Json;
    expect(rc.dependentRequired).toEqual({ output_sha256: ["output_path"], output_path: ["output_sha256"] });
    const re = new RegExp(rc.properties.output_path.pattern as string);
    const samples = ["out.json", "reports/vitest.json", "a/b/c.txt", ".hidden", "a..b/c",
      "", "/abs", "../up", "a/../b", "a/./b", "./a", "a//b", "a/", "a\\b", "a\u0000b"];
    for (const s of samples) expect(re.test(s), JSON.stringify(s)).toBe(isRepoRelativePath(s));
  });

  test("binding key sets are strict in both places", () => {
    const ev = (binding: Json): Json => ({
      id: "x", type: "decision", agent_id: "a", schema_version: 2, birth_status: "asserted",
      evidence: [{ kind: "k", ref: "r", checked_at: null, signer: null, binding }],
      targets: [], is_trust_root: false,
    });
    const full: Record<string, Json> = {
      reproducible_check: {
        type: "reproducible_check", command: "c", repo: "r", commit: "a".repeat(40),
        expect_exit: 0, inputs: [], output_sha256: "b".repeat(64), output_path: "reports/out.json",
      },
      signed_attestation: {
        type: "signed_attestation", subject_sha256: "c".repeat(64), predicate: "p", key_id: "k", signature: "s",
      },
    };
    for (const [name, sample] of Object.entries(full)) {
      const d = defs[name] as Json;
      expect(d.additionalProperties).toBe(false);
      expect(sorted(Object.keys(d.properties))).toEqual(sorted(Object.keys(sample)));
      expect(() => recordToEvent(ev(sample))).not.toThrow();
      expect(() => recordToEvent(ev({ ...sample, extra: 1 }))).toThrow(ParseError);
      for (const k of d.required as string[]) {
        const b = { ...sample };
        delete b[k];
        expect(() => recordToEvent(ev(b)), `${name} missing ${k}`).toThrow(ParseError);
      }
    }
  });
});
