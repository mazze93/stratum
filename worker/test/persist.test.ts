import { describe, expect, test } from "vitest";
import {
  chainDigest,
  ContractViolation,
  GENESIS_DIGEST,
  recordToEvent,
  serializeLog,
} from "@stratum/core";
import { PersistentLog, type EventStore } from "../src/persist.js";

/**
 * In-memory store with real rollback semantics (snapshot, restore on throw),
 * matching what ctx.storage.transactionSync documents. failInsertAt makes the
 * Nth insert (0-based, counted across the store's life) throw.
 */
class FakeStore implements EventStore {
  rows: { seq: number; id: string; record: string; chain: string | null }[] = [];
  inserts = 0;
  failInsertAt: number | null = null;

  readAll() {
    return [...this.rows]
      .sort((a, b) => a.seq - b.seq)
      .map((r) => ({ seq: r.seq, record: JSON.parse(r.record) as unknown, chain: r.chain }));
  }
  insert(seq: number, id: string, record: string, chain: string): void {
    const n = this.inserts++;
    if (n === this.failInsertAt) throw new Error("injected storage failure");
    if (this.rows.some((r) => r.seq === seq || r.id === id)) throw new Error("UNIQUE constraint");
    this.rows.push({ seq, id, record, chain });
  }
  setChain(seq: number, chain: string): void {
    const row = this.rows.find((r) => r.seq === seq);
    if (row === undefined) throw new Error("no such row");
    row.chain = chain;
  }
  transaction<T>(fn: () => T): T {
    const snapshot = this.rows.map((r) => ({ ...r }));
    try {
      return fn();
    } catch (e) {
      this.rows = snapshot;
      throw e;
    }
  }
}

const decision = (id: string) =>
  recordToEvent({
    id,
    type: "decision",
    agent_id: "t",
    schema_version: 1,
    birth_status: "pending_evidence",
    evidence: [],
    targets: [], is_trust_root: false,
  });

describe("PersistentLog — memory is never ahead of storage (tp-001)", () => {
  test("a committed append is in both memory and storage", () => {
    const store = new FakeStore();
    const p = new PersistentLog(store);
    p.append(decision("d-1"));
    expect(store.rows.map((r) => r.id)).toEqual(["d-1"]);
    expect(p.log.head).toBe(0);
  });

  test("storage failure after the guards pushed: cache dropped, retry succeeds", () => {
    const store = new FakeStore();
    const p = new PersistentLog(store);
    p.append(decision("d-1"));
    store.failInsertAt = 1;
    expect(() => p.append(decision("d-2"))).toThrow("injected storage failure");
    // Storage rolled back; memory rebuilt from it — not left holding d-2.
    expect(store.rows.map((r) => r.id)).toEqual(["d-1"]);
    expect(p.log.head).toBe(0);
    expect(p.log.has("d-2")).toBe(false);
    // The pre-fix bug: a stale cache would reject this as a duplicate id.
    p.append(decision("d-2"));
    expect(store.rows.map((r) => r.id)).toEqual(["d-1", "d-2"]);
    expect(serializeLog(p.log).map((r) => r.id)).toEqual(["d-1", "d-2"]);
  });

  test("a guard violation writes nothing and keeps the cache", () => {
    const store = new FakeStore();
    const p = new PersistentLog(store);
    p.append(decision("d-1"));
    const cached = p.log;
    expect(() => p.append(decision("d-1"))).toThrow(ContractViolation);
    expect(store.rows).toHaveLength(1);
    expect(p.log).toBe(cached);
  });

  test("seed is all-or-nothing: a mid-seed failure leaves storage empty", () => {
    const store = new FakeStore();
    const p = new PersistentLog(store);
    const records = ["s-1", "s-2", "s-3"].map((id) => ({
      id,
      type: "decision",
      agent_id: "t",
      schema_version: 1,
      birth_status: "pending_evidence",
      evidence: [],
      targets: [], is_trust_root: false,
    }));
    store.failInsertAt = 2;
    expect(() => p.seedIfEmpty(records)).toThrow("injected storage failure");
    expect(store.rows).toHaveLength(0);
    expect(p.log.head).toBe(-1);
    store.failInsertAt = null;
    expect(p.seedIfEmpty(records)).toBe(true);
    expect(store.rows.map((r) => r.id)).toEqual(["s-1", "s-2", "s-3"]);
    expect(p.seedIfEmpty(records)).toBe(false);
  });

  test("an invalid seed is refused before any write", () => {
    const store = new FakeStore();
    const p = new PersistentLog(store);
    const bad = [
      { id: "x", type: "decision", agent_id: "t", schema_version: 1, birth_status: "pending_evidence", evidence: [], targets: [], is_trust_root: false },
      { id: "x", type: "decision", agent_id: "t", schema_version: 1, birth_status: "pending_evidence", evidence: [], targets: [], is_trust_root: false },
    ];
    expect(() => p.seedIfEmpty(bad)).toThrow(ContractViolation);
    expect(store.inserts).toBe(0);
  });
});

describe("PersistentLog — hash chain in storage (tp-009)", () => {
  const seeded = () => {
    const store = new FakeStore();
    const p = new PersistentLog(store);
    for (const id of ["c-1", "c-2", "c-3"]) p.append(decision(id));
    return { store, p };
  };

  test("head digest is the core chain over the normalized wire records", () => {
    const { store, p } = seeded();
    expect(p.headDigest).toBe(chainDigest(serializeLog(p.log)));
    expect(store.rows.at(-1)!.chain).toBe(p.headDigest);
    expect(new PersistentLog(new FakeStore()).headDigest).toBe(GENESIS_DIGEST);
  });

  test("a coherent edit in storage fails closed on the next load", () => {
    const { store } = seeded();
    const row = store.rows[1]!;
    row.record = row.record.replace('"agent_id":"t"', '"agent_id":"forged"');
    expect(() => new PersistentLog(store).log).toThrow(/chain break at seq 1/);
  });

  test("a reorder is caught", () => {
    const { store } = seeded();
    const swapped = new FakeStore();
    swapped.rows = [store.rows[1]!, store.rows[0]!, store.rows[2]!].map((r, i) => ({ ...r, seq: i }));
    expect(() => new PersistentLog(swapped).log).toThrow(ContractViolation);
  });

  test("LIMIT, pinned: dropping the tail is NOT detectable locally — a prefix is a valid chain", () => {
    // Only an off-system witness of the head digest (an anchor) catches this.
    // ADR-003 §8; tp-012 corrects tp-009's wording.
    const { store, p } = seeded();
    const fullHead = p.headDigest;
    store.rows.pop();
    const truncated = new PersistentLog(store);
    expect(truncated.log.head).toBe(1);
    expect(truncated.headDigest).not.toBe(fullHead);
  });

  test("migrateLegacy chains a pre-chain table to the same head", () => {
    const { store, p } = seeded();
    const want = p.headDigest;
    for (const r of store.rows) r.chain = null;
    const migrated = new PersistentLog(store);
    store.transaction(() => migrated.migrateLegacy());
    expect(migrated.headDigest).toBe(want);
    expect(store.rows.every((r) => r.chain !== null)).toBe(true);
  });

  test("touchstone P2: editing a row then nulling every chain is a break, not a backfill", () => {
    const { store } = seeded();
    store.rows[1]!.record = store.rows[1]!.record.replace('"agent_id":"t"', '"agent_id":"forged"');
    for (const r of store.rows) r.chain = null;
    expect(() => new PersistentLog(store).log).toThrow(/chain break at seq 0/);
  });

  test("touchstone P3: deleting a middle row and renumbering is a break", () => {
    const { store } = seeded();
    store.rows.splice(1, 1);
    store.rows[1]!.seq = 1;
    expect(() => new PersistentLog(store).log).toThrow(/chain break at seq 1/);
  });

  test("touchstone P1: a large-magnitude number persists and chains (no deploy-day brick)", () => {
    const store = new FakeStore();
    const p = new PersistentLog(store);
    const big = recordToEvent({
      id: "big", type: "decision", agent_id: "t", schema_version: 1,
      birth_status: "pending_evidence", claim: { ns: 1730000000000000000, sci: 1e300 },
      evidence: [], targets: [], is_trust_root: false,
    });
    expect(() => p.append(big)).not.toThrow();
    expect(new PersistentLog(store).headDigest).toBe(p.headDigest);
  });

  test("a partly unchained store is a break, not a backfill", () => {
    const { store } = seeded();
    store.rows[2]!.chain = null;
    expect(() => new PersistentLog(store).log).toThrow(/chain break at seq 2/);
  });

  test("append returns the new head; a rolled-back append leaves the head unchanged", () => {
    const { store, p } = seeded();
    const before = p.headDigest;
    store.failInsertAt = store.inserts;
    expect(() => p.append(decision("c-4"))).toThrow("injected storage failure");
    expect(p.headDigest).toBe(before);
    const { chain } = p.append(decision("c-4"));
    expect(chain).toBe(p.headDigest);
    expect(chain).toBe(chainDigest(serializeLog(p.log)));
  });
});

describe("PersistentLog.chainAt — the anchor point (R2, ADR-004)", () => {
  const build = (n: number) => {
    const store = new FakeStore();
    const p = new PersistentLog(store);
    for (let i = 1; i <= n; i++) p.append(decision(`a-${i}`));
    return { store, p };
  };

  test("chainAt(n) equals chainDigest of the first n wire records, for every n", () => {
    const { store, p } = build(6);
    const wire = serializeLog(p.log);
    for (let n = 1; n <= wire.length; n++) {
      expect(p.chainAt(n), `row ${n}`).toBe(chainDigest(wire.slice(0, n)));
      expect(p.chainAt(n)).toBe(store.rows[n - 1]!.chain); // the stored value
    }
    expect(p.chainAt(wire.length)).toBe(p.headDigest);
  });

  test("a fresh load (no cache) answers the same, and a seeded log too", () => {
    const { store, p } = build(4);
    const reloaded = new PersistentLog(store);
    for (let n = 1; n <= 4; n++) expect(reloaded.chainAt(n)).toBe(p.chainAt(n));

    const seededStore = new FakeStore();
    const seeded = new PersistentLog(seededStore);
    expect(seeded.seedIfEmpty(serializeLog(p.log))).toBe(true);
    for (let n = 1; n <= 4; n++) expect(seeded.chainAt(n)).toBe(p.chainAt(n));
  });

  test("null past the head: the anchor is ahead of this log", () => {
    const { p } = build(3);
    expect(p.chainAt(4)).toBeNull();
    expect(new PersistentLog(new FakeStore()).chainAt(1)).toBeNull();
  });

  test("a tampered stored chain makes chainAt throw: load fails closed first", () => {
    const { store } = build(3);
    store.rows[0]!.chain = "f".repeat(64);
    expect(() => new PersistentLog(store).chainAt(3)).toThrow(/chain break at seq 0/);
  });

  test("tracks appends and survives a rolled-back append", () => {
    const { store, p } = build(2);
    const at2 = p.chainAt(2);
    store.failInsertAt = store.inserts;
    expect(() => p.append(decision("a-3"))).toThrow("injected storage failure");
    expect(p.chainAt(3)).toBeNull();
    const { chain } = p.append(decision("a-3"));
    expect(p.chainAt(3)).toBe(chain);
    expect(p.chainAt(2)).toBe(at2);
  });

  test("refuses a nonsense row number", () => {
    const { p } = build(1);
    for (const n of [0, -1, 1.5, Number.NaN]) expect(() => p.chainAt(n)).toThrow(RangeError);
  });
});
