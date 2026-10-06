/**
 * Atomic, hash-chained persistence for one log — storage-agnostic so it can be
 * tested with a fault-injecting store (the gate-policy.ts pattern).
 * ADR-003 §2 / tp-001 (atomicity), §8 / tp-009 (chain).
 *
 * Invariant 1: the in-memory EpisodicLog is never ahead of storage. Every
 * write runs inside the store's transaction; memory is kept only if the
 * transaction commits. If storage throws after the guards already pushed into
 * memory, the cache is dropped and the next read rebuilds it from storage via
 * loadLog — which re-runs every guard. Storage is the truth.
 *
 * Invariant 2: every row carries chain = link(prev, record), and the chain is
 * re-walked on every load. A break fails closed (ContractViolation): guards
 * catch an incoherent log; the chain catches a coherent one that was edited,
 * reordered, or had rows removed from the middle. It CANNOT catch a dropped
 * tail — a prefix is a valid chain — so only an off-system witness of the
 * head digest (an anchor) closes that. See ADR-003 §8.
 */

import {
  chainLink,
  ContractViolation,
  EpisodicLog,
  eventToRecord,
  GENESIS_DIGEST,
  loadLog,
  serializeLog,
  type StratumEvent,
} from "@stratum/core";

export interface StoredRow {
  seq: number;
  record: unknown;
  /** null only for rows written before the chain existed (backfilled once) */
  chain: string | null;
}

export interface EventStore {
  /** Every persisted row, in seq order. */
  readAll(): StoredRow[];
  insert(seq: number, id: string, record: string, chain: string): void;
  setChain(seq: number, chain: string): void;
  /** Run fn atomically: a throw rolls back every write made inside it. */
  transaction<T>(fn: () => T): T;
}

export class PersistentLog {
  private cache: { log: EpisodicLog; head: string } | null = null;

  constructor(private readonly store: EventStore) {}

  get log(): EpisodicLog {
    return this.load().log;
  }

  /** Content address of the log at its head (GENESIS_DIGEST when empty). */
  get headDigest(): string {
    return this.load().head;
  }

  private load(): { log: EpisodicLog; head: string } {
    if (this.cache !== null) return this.cache;
    const rows = this.store.readAll();
    const log = loadLog(rows.map((r) => r.record));
    const links: string[] = [];
    let prev = GENESIS_DIGEST;
    for (const record of serializeLog(log)) links.push((prev = chainLink(prev, record)));

    const unchained = rows.filter((r) => r.chain === null).length;
    if (unchained === rows.length && rows.length > 0) {
      // Storage from before the chain existed: backfill, all-or-nothing.
      this.store.transaction(() => rows.forEach((r, i) => this.store.setChain(r.seq, links[i]!)));
    } else {
      rows.forEach((r, i) => {
        if (r.chain !== links[i]) {
          throw new ContractViolation(`chain break at seq ${r.seq}: stored log was altered`);
        }
      });
    }
    this.cache = { log, head: prev };
    return this.cache;
  }

  /**
   * Guard, persist, and only then keep. A guard violation throws before the
   * push, so memory is untouched; a storage failure throws after it, so the
   * cache is discarded rather than left ahead of the store.
   */
  append(event: StratumEvent): { event: StratumEvent; chain: string } {
    const state = this.load();
    const before = state.log.head;
    try {
      const out = this.store.transaction(() => {
        const sequenced = state.log.append(event);
        const record = eventToRecord(sequenced);
        const chain = chainLink(state.head, record);
        this.store.insert(sequenced.seq, sequenced.id, JSON.stringify(record), chain);
        return { event: sequenced, chain };
      });
      state.head = out.chain;
      return out;
    } catch (e) {
      if (state.log.head !== before) this.cache = null;
      throw e;
    }
  }

  /**
   * Seed an empty store from a full record array: validated as a whole by
   * loadLog first, then written in ONE transaction — all rows or none.
   * Returns false (and writes nothing) if the store is not empty.
   */
  seedIfEmpty(records: readonly unknown[]): boolean {
    if (this.log.head >= 0) return false;
    const seeded = loadLog(records);
    let prev = GENESIS_DIGEST;
    const rows = serializeLog(seeded).map((record) => {
      prev = chainLink(prev, record);
      return { seq: seeded.get(record.id).seq, id: record.id, record, chain: prev };
    });
    this.store.transaction(() => {
      for (const r of rows) this.store.insert(r.seq, r.id, JSON.stringify(r.record), r.chain);
    });
    this.cache = { log: seeded, head: prev };
    return true;
  }
}
