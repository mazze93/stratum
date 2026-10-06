import { describe, expect, test } from "vitest";
import { ContractViolation, recordToEvent, serializeLog } from "@stratum/core";
import { PersistentLog, type EventStore } from "../src/persist.js";

/**
 * In-memory store with real rollback semantics (snapshot, restore on throw),
 * matching what ctx.storage.transactionSync documents. failInsertAt makes the
 * Nth insert (0-based, counted across the store's life) throw.
 */
class FakeStore implements EventStore {
  rows: { seq: number; id: string; record: string }[] = [];
  inserts = 0;
  failInsertAt: number | null = null;

  readAll(): unknown[] {
    return [...this.rows].sort((a, b) => a.seq - b.seq).map((r) => JSON.parse(r.record));
  }
  insert(seq: number, id: string, record: string): void {
    const n = this.inserts++;
    if (n === this.failInsertAt) throw new Error("injected storage failure");
    if (this.rows.some((r) => r.seq === seq || r.id === id)) throw new Error("UNIQUE constraint");
    this.rows.push({ seq, id, record });
  }
  transaction<T>(fn: () => T): T {
    const snapshot = [...this.rows];
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
