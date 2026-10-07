import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { canonicalize } from "../src/canonical.js";
import { chainDigest, chainLink, GENESIS_DIGEST } from "../src/chain.js";
import { ContractViolation } from "../src/contract.js";
import { loadLog, serializeLog } from "../src/serialize.js";
import { sha256Hex } from "../src/sha256.js";

const root = new URL("../../", import.meta.url);
const golden = JSON.parse(readFileSync(new URL("data/canonical.golden.json", root), "utf8")) as {
  cases: { name: string; value: unknown; canonical: string }[];
  refused: { name: string; value: unknown }[];
  traces: Record<string, { events: number; head_digest: string }>;
};

/** Normalized wire records — what a log's head digest is defined over. */
const wire = (name: string): unknown[] => serializeLog(loadLog(readTrace(name)));

const readTrace = (name: string): unknown[] =>
  readFileSync(new URL(`data/${name}`, root), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as unknown);

describe("RFC 8785 canonical bytes match the Python oracle (data/canonical.golden.json)", () => {
  for (const c of golden.cases) {
    test(c.name, () => expect(canonicalize(c.value)).toBe(c.canonical));
  }
  for (const r of golden.refused) {
    test(`refuses: ${r.name}`, () => expect(() => canonicalize(r.value)).toThrow(ContractViolation));
  }
  test("refuses non-finite numbers and lone surrogates", () => {
    expect(() => canonicalize(Number.NaN)).toThrow(ContractViolation);
    expect(() => canonicalize([Infinity])).toThrow(ContractViolation);
    expect(() => canonicalize("\ud800")).toThrow(ContractViolation);
    expect(() => canonicalize({ "\udc00": 1 })).toThrow(ContractViolation);
  });
});

describe("hash chain over persisted records (tp-009)", () => {
  for (const [name, want] of Object.entries(golden.traces)) {
    test(`${name} head digest is byte-identical across implementations`, () => {
      const recs = wire(name);
      expect(recs).toHaveLength(want.events);
      expect(chainDigest(recs)).toBe(want.head_digest);
    });
  }
  test("every live trace: TypeScript head digest == oracle head digest", () => {
    const names = readdirSync(new URL("data/", root)).filter((n) => n.endsWith("-trace.jsonl"));
    expect(names.length).toBeGreaterThan(0);
    const oracle = JSON.parse(
      execFileSync(
        "python3",
        ["-I", "-c",
         "import json,sys;sys.path.insert(0,sys.argv[1]);from canonical import log_digest;from tessera_projection import load_log;" +
         "print(json.dumps({n:log_digest(load_log([json.loads(l) for l in open(sys.argv[2]+'/'+n) if l.strip()])) for n in sys.argv[3:]}))",
         fileURLToPath(new URL("reference", root)), fileURLToPath(new URL("data", root)), ...names],
        { encoding: "utf8" },
      ),
    ) as Record<string, string>;
    for (const n of names) expect(chainDigest(wire(n)), n).toBe(oracle[n]);
  });
  test("any edit, deletion, or reorder changes the head", () => {
    const recs = readTrace("genesis-trace.jsonl") as Record<string, unknown>[];
    const head = chainDigest(recs);
    expect(chainDigest(recs.slice(0, -1))).not.toBe(head);
    expect(chainDigest([recs[1], recs[0], ...recs.slice(2)])).not.toBe(head);
    expect(chainDigest([{ ...recs[0], agent_id: "forged" }, ...recs.slice(1)])).not.toBe(head);
    expect(chainDigest([])).toBe(GENESIS_DIGEST);
  });
  test("link = sha256(prev ‖ JCS(record))", () => {
    const r = { b: 1, a: [true] };
    expect(chainLink(GENESIS_DIGEST, r)).toBe(
      createHash("sha256").update(GENESIS_DIGEST + '{"a":[true],"b":1}').digest("hex"),
    );
  });
});

describe("sha256 (tp-012)", () => {
  test("NIST FIPS 180-4 vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });
  test("agrees with node:crypto across block-boundary lengths and random inputs", () => {
    for (let n = 0; n < 300; n++) {
      const buf = randomBytes(n);
      expect(sha256Hex(buf)).toBe(createHash("sha256").update(buf).digest("hex"));
    }
    const big = randomBytes(100_000);
    expect(sha256Hex(big)).toBe(createHash("sha256").update(big).digest("hex"));
  });
});
