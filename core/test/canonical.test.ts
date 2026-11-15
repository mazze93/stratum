import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { canonicalize } from "../src/canonical.js";
import { anchorVerdict, chainDigest, chainLink, GENESIS_DIGEST } from "../src/chain.js";
import { ContractViolation } from "../src/contract.js";
import { loadLog, serializeLog } from "../src/serialize.js";
import { sha256Hex } from "../src/sha256.js";

const root = new URL("../../", import.meta.url);
const golden = JSON.parse(readFileSync(new URL("data/canonical.golden.json", root), "utf8")) as {
  cases: { name: string; value: unknown; canonical: string }[];
  refused: { name: string; value: unknown }[];
  traces: Record<
    string,
    { events: number; head_digest: string; prefix_digests: Record<string, string> }
  >;
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

describe("anchorVerdict — how a log relates to an anchor (R2, ADR-004)", () => {
  const recs = wire("genesis-trace.jsonl") as Record<string, unknown>[];
  const at = (n: number) => chainDigest(recs.slice(0, n));

  test("golden prefix digests are byte-identical across implementations", () => {
    const want = golden.traces["genesis-trace.jsonl"]!.prefix_digests;
    expect(Object.keys(want).sort()).toEqual(["1", "10"]);
    for (const [n, head] of Object.entries(want)) {
      expect(at(Number(n)), `row ${n}`).toBe(head);
      expect(anchorVerdict(recs, { rows: Number(n), head })).toBe("extends");
    }
  });
  test("extends at every prefix, including the empty one and the head", () => {
    for (let n = 0; n <= recs.length; n++) {
      expect(anchorVerdict(recs, { rows: n, head: at(n) }), `row ${n}`).toBe("extends");
    }
    expect(anchorVerdict([], { rows: 0, head: GENESIS_DIGEST })).toBe("extends");
  });
  test("truncated when the anchor is past this log's head (a dropped tail)", () => {
    const head = at(recs.length);
    expect(anchorVerdict(recs.slice(0, -1), { rows: recs.length, head })).toBe("truncated");
    expect(anchorVerdict(recs, { rows: recs.length + 1, head })).toBe("truncated");
  });
  test("forked for a one-byte change in a middle record", () => {
    const head = at(recs.length);
    const edited = recs.map((r, i) =>
      i === 9 ? { ...r, agent_id: `${String(r.agent_id)}x` } : r,
    );
    expect(anchorVerdict(edited, { rows: recs.length, head })).toBe("forked");
    // the prefix before the edit still extends
    expect(anchorVerdict(edited, { rows: 9, head: at(9) })).toBe("extends");
  });
  test("forked for a recomputed chain over an edited record (same length)", () => {
    const edited = [{ ...recs[0]!, agent_id: "forged" }, ...recs.slice(1)];
    expect(anchorVerdict(edited, { rows: 1, head: at(1) })).toBe("forked");
    expect(anchorVerdict(recs, { rows: 1, head: chainDigest(edited.slice(0, 1)) })).toBe("forked");
  });
  test("refuses a nonsense row count", () => {
    for (const rows of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => anchorVerdict(recs, { rows, head: GENESIS_DIGEST })).toThrow(RangeError);
    }
  });
  test("the TypeScript verdict equals the oracle's at every row of every live trace", () => {
    const names = readdirSync(new URL("data/", root)).filter((n) => n.endsWith("-trace.jsonl"));
    const oracle = JSON.parse(
      execFileSync(
        "python3",
        ["-I", "-c",
         "import json,sys;sys.path.insert(0,sys.argv[1]);from canonical import chain_digest;from tessera_projection import load_log,serialize_log;" +
         "out={}\nfor n in sys.argv[3:]:\n w=serialize_log(load_log([json.loads(l) for l in open(sys.argv[2]+'/'+n) if l.strip()]))\n out[n]=[chain_digest(w[:k]) for k in range(len(w)+1)]\nprint(json.dumps(out))",
         fileURLToPath(new URL("reference", root)), fileURLToPath(new URL("data", root)), ...names],
        { encoding: "utf8" },
      ),
    ) as Record<string, string[]>;
    for (const n of names) {
      const w = wire(n);
      oracle[n]!.forEach((head, k) => {
        expect(anchorVerdict(w, { rows: k, head }), `${n} row ${k}`).toBe("extends");
      });
    }
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
