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
    targets: [],
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
      targets: [],
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
      { id: "x", type: "decision", agent_id: "t", schema_version: 1, birth_status: "pending_evidence", evidence: [], targets: [] },
      { id: "x", type: "decision", agent_id: "t", schema_version: 1, birth_status: "pending_evidence", evidence: [], targets: [] },
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

  test("pre-chain storage is backfilled once, all-or-nothing", () => {
    const { store, p } = seeded();
    const want = p.headDigest;
    for (const r of store.rows) r.chain = null;
    const reloaded = new PersistentLog(store);
    expect(reloaded.headDigest).toBe(want);
    expect(store.rows.every((r) => r.chain !== null)).toBe(true);
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
