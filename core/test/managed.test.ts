/**
 * Managed client protocol 1 — the TS port must reproduce every digest and
 * refusal code in fixtures/managed-client-v1/, which the Python oracle
 * generates (scripts/render-managed-fixtures.py). The bundle is pinned by
 * manifest.json; a fixture change means a new bundle digest, never a local
 * edit to make this side pass (R09, R31).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { canonicalBytes } from "../src/canonical.js";
import {
  commandDigest,
  effectDigest,
  FAILURE_CODES,
  MANAGED_OPERATIONS,
  ManagedRefusal,
  parseCommand,
  PROPOSED_EVENT_SCHEMA,
  RECEIPT_DOMAIN,
  receiptSigningBytes,
  SERVICE_METHODS,
} from "../src/managed.js";
import { SCHEMA_VERSIONS } from "../src/contract.js";
import { recordToEvent } from "../src/serialize.js";

const dir = new URL("../../fixtures/managed-client-v1/", import.meta.url);
const bytes = (name: string) => readFileSync(new URL(name, dir));
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const manifest = JSON.parse(bytes("manifest.json").toString("utf8")) as {
  bundle: string;
  files: Record<string, string>;
  bundle_digest: string;
};
const fx = JSON.parse(bytes("commands.json").toString("utf8")) as {
  log_id: string;
  constants: {
    operations: string[];
    service_methods: string[];
    failure_codes: Record<string, { http: number; handling: string }>;
    proposed_event_schema: number;
    receipt_domain: string;
  };
  valid: { name: string; ingress_client_id: string; command: unknown; expect: Record<string, string> }[];
  invalid: { name: string; ingress_client_id: string; command: unknown; expect_code: string }[];
  readers: { name: string; record: unknown }[];
  non_managed_log_id: { log_id: string; expect_code: string };
};

const refusalCode = (f: () => unknown): string | null => {
  try {
    f();
  } catch (e) {
    if (e instanceof ManagedRefusal) return e.code;
    throw e;
  }
  return null;
};

describe("fixture bundle integrity", () => {
  test("every file matches its manifest digest", () => {
    for (const [name, digest] of Object.entries(manifest.files)) expect(sha256(bytes(name))).toBe(digest);
  });
  test("bundle digest covers the bundle name and every file digest", () => {
    expect(sha256(canonicalBytes({ bundle: manifest.bundle, files: manifest.files }))).toBe(manifest.bundle_digest);
  });
});

describe("constants agree with the oracle", () => {
  test("operations, service methods, refusal codes, schema allocation, receipt domain", () => {
    expect([...MANAGED_OPERATIONS]).toEqual(fx.constants.operations);
    expect([...SERVICE_METHODS]).toEqual(fx.constants.service_methods);
    expect(FAILURE_CODES).toEqual(fx.constants.failure_codes);
    expect(PROPOSED_EVENT_SCHEMA).toBe(fx.constants.proposed_event_schema);
    expect(RECEIPT_DOMAIN).toBe(fx.constants.receipt_domain);
  });
});

describe("valid commands: identical payload, command and effect digests", () => {
  for (const c of fx.valid) {
    test(c.name, () => {
      const cmd = parseCommand(c.command, c.ingress_client_id);
      expect(cmd.payload_digest).toBe(c.expect["payload_digest"]);
      expect(commandDigest(cmd, fx.log_id)).toBe(c.expect["command_digest"]);
      expect(effectDigest(cmd)).toBe(c.expect["effect_digest"]);
    });
  }
});

describe("invalid commands: identical refusal codes", () => {
  for (const c of fx.invalid) {
    test(c.name, () => expect(refusalCode(() => parseCommand(c.command, c.ingress_client_id))).toBe(c.expect_code));
  }
  test("a command digest refuses a non-managed log id", () => {
    const cmd = parseCommand(fx.valid[0]!.command, fx.valid[0]!.ingress_client_id);
    expect(refusalCode(() => commandDigest(cmd, fx.non_managed_log_id.log_id))).toBe(fx.non_managed_log_id.expect_code);
  });
});

describe("C02 identity rules hold in the TS port, not only in the fixture", () => {
  const byName = new Map(fx.valid.map((c) => [c.name, c]));
  const digests = (name: string) => {
    const c = byName.get(name)!;
    const cmd = parseCommand(c.command, c.ingress_client_id);
    return { command: commandDigest(cmd, fx.log_id), effect: effectDigest(cmd) };
  };
  const base = digests("register_evidence: minimal valid command");
  test("a rebased retry is a new command with the same effect", () => {
    const retry = digests("rebased retry: new command id and head, same effect");
    expect(retry.command).not.toBe(base.command);
    expect(retry.effect).toBe(base.effect);
  });
  test("a changed payload is a changed effect", () => {
    expect(digests("changed effect under the same source event").effect).not.toBe(base.effect);
  });
  test("the command digest is bound to the server-resolved log", () => {
    const c = byName.get("register_evidence: minimal valid command")!;
    const cmd = parseCommand(c.command, c.ingress_client_id);
    expect(commandDigest(cmd, `cm-${"0".repeat(32)}`)).not.toBe(base.command);
  });
});

describe("schema 3 is allocated, not readable (A11 reader gate)", () => {
  test("SCHEMA_VERSIONS does not include the proposed schema", () => {
    expect(SCHEMA_VERSIONS.has(PROPOSED_EVENT_SCHEMA)).toBe(false);
  });
  for (const c of fx.readers) {
    test(c.name, () => expect(() => recordToEvent(c.record)).toThrow(/unsupported/));
  }
});

test("receipt signing bytes are the domain, a newline, then canonical bytes", () => {
  const receipt = { b: 1, a: "x" };
  const expected = new TextEncoder().encode(`${RECEIPT_DOMAIN}\n{"a":"x","b":1}`);
  expect(receiptSigningBytes(receipt)).toEqual(expected);
});
