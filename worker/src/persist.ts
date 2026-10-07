/**
 * Atomic persistence for one log — storage-agnostic so it can be tested with
 * a fault-injecting store (the gate-policy.ts pattern). ADR-003 §2 / tp-001.
 *
 * Invariant: the in-memory EpisodicLog is never ahead of storage. Every write
 * runs inside the store's transaction; memory is kept only if the transaction
 * commits. If storage throws after the guards already pushed into memory, the
 * cache is dropped and the next read rebuilds it from storage via loadLog —
 * which re-runs every guard. Storage is the truth; the cache is disposable.
 */

import {
  EpisodicLog,
  eventToRecord,
  loadLog,
  serializeLog,
  type StratumEvent,
} from "@stratum/core";

export interface EventStore {
  /** Every persisted record, in seq order. */
  readAll(): unknown[];
  insert(seq: number, id: string, record: string): void;
  /** Run fn atomically: a throw rolls back every write made inside it. */
  transaction<T>(fn: () => T): T;
}

export class PersistentLog {
  private cache: EpisodicLog | null = null;

  constructor(private readonly store: EventStore) {}

  get log(): EpisodicLog {
    if (this.cache === null) this.cache = loadLog(this.store.readAll());
    return this.cache;
  }

  /**
   * Guard, persist, and only then keep. A guard violation throws before the
   * push, so memory is untouched; a storage failure throws after it, so the
   * cache is discarded rather than left ahead of the store.
   */
  append(event: StratumEvent): StratumEvent {
    const log = this.log;
    const before = log.head;
    try {
      return this.store.transaction(() => {
        const sequenced = log.append(event);
        this.store.insert(sequenced.seq, sequenced.id, JSON.stringify(eventToRecord(sequenced)));
        return sequenced;
      });
    } catch (e) {
      if (log.head !== before) this.cache = null;
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
    this.store.transaction(() => {
      for (const record of serializeLog(seeded)) {
        this.store.insert(seeded.get(record.id).seq, record.id, JSON.stringify(record));
      }
    });
    this.cache = seeded;
    return true;
  }
}
