/**
 * Tessera projection — a pure function of the log at an epoch. This is
 * ADR-001 Option C made executable: authoritative fields are projections of
 * the append-only graph and cannot be hallucinated; prose fields are marked
 * narrative-only and are never canonical.
 *
 * Output shape (snake_case keys) is byte-compatible with the Python
 * reference; the golden-file test enforces it.
 */

import {
  Authority,
  IncompleteProjection,
  OVERTURNED,
  ReinterpretationError,
  Status,
  StratumEvent,
} from "./contract.js";
import { EpisodicLog } from "./log.js";

export interface DecisionEntry {
  id: string;
  authority: Authority;
  status: Status;
  revision_chain: string[];
  narrative: unknown;
}

export interface ForeclosureEntry {
  id: string;
  authority: Authority;
  status: Status;
  active: boolean;
  narrative: unknown;
}

export interface Tessera {
  epoch: number;
  authoritative: {
    recent_decisions: DecisionEntry[];
    foreclosed_options: ForeclosureEntry[];
  };
  narrative_only: {
    current_goal: string | null;
    next_action: string | null;
    warnings: string[];
  };
}

export function authorityOf(log: EpisodicLog, eventId: string, epoch: number): Authority {
  if (log.underReview(eventId, epoch)) return Authority.Provisional;
  const st = log.statusAt(eventId, epoch);
  if (st === Status.Ratified) return Authority.Axiomatic; // authority-declared, NOT evidence-checked
  if (st === Status.Validated) return Authority.Verified; // evidence-checked
  if (st === Status.PendingEvidence) return Authority.Provisional;
  return Authority.Narrative;
}

export function revisionChain(log: EpisodicLog, event: StratumEvent): string[] {
  const chain = [event.id];
  const seen = new Set([event.id]);
  let cursor = event;
  let parent = log.lineageParent(cursor);
  while (parent !== null && log.has(parent) && !seen.has(parent)) {
    cursor = log.get(parent);
    seen.add(cursor.id);
    chain.push(cursor.id);
    parent = log.lineageParent(cursor);
  }
  return chain.reverse();
}

export function projectTessera(log: EpisodicLog, epoch?: number): Tessera {
  const e = epoch ?? log.head;
  const events = log.eventsUpto(e).sort((a, b) => a.seq - b.seq);
  const recent_decisions: DecisionEntry[] = [];
  const foreclosed_options: ForeclosureEntry[] = [];

  for (const ev of events) {
    if (ev.type === "decision") {
      recent_decisions.push({
        id: ev.id,
        authority: authorityOf(log, ev.id, e),
        status: log.statusAt(ev.id, e),
        revision_chain: revisionChain(log, ev),
        narrative: ev.claim["narrative"] ?? null,
      });
    } else if (ev.type === "foreclosure") {
      const st = log.statusAt(ev.id, e);
      foreclosed_options.push({
        id: ev.id,
        authority: authorityOf(log, ev.id, e),
        status: st,
        active: !OVERTURNED.has(st),
        narrative: ev.claim["narrative"] ?? null,
      });
    }
  }

  return {
    epoch: e,
    authoritative: { recent_decisions, foreclosed_options },
    narrative_only: { current_goal: null, next_action: null, warnings: [] },
  };
}

/** Fail-closed: raise rather than default when a field has no backing event. */
export function requireAuthoritative(
  log: EpisodicLog,
  fieldKind: "decision" | "foreclosure",
  eventId: string,
  epoch?: number,
): DecisionEntry | ForeclosureEntry {
  const proj = projectTessera(log, epoch);
  const bucket =
    fieldKind === "decision"
      ? proj.authoritative.recent_decisions
      : proj.authoritative.foreclosed_options;
  for (const entry of bucket) {
    if (entry.id === eventId) return entry;
  }
  throw new IncompleteProjection(
    `no backing event for authoritative ${fieldKind} ${JSON.stringify(eventId)}`,
  );
}

// -- I4 fingerprint (used by the replay round-trip test) ---------------------

export type Fingerprint = Record<string, unknown[]>;

export function authoritativeFingerprint(projection: Tessera): Fingerprint {
  const out: Fingerprint = {};
  for (const d of projection.authoritative.recent_decisions) {
    out[`decision:${d.id}`] = [d.authority, d.status, [...d.revision_chain]];
  }
  for (const f of projection.authoritative.foreclosed_options) {
    out[`foreclosure:${f.id}`] = [f.authority, f.status, f.active];
  }
  return out;
}

export function assertNoReinterpretation(oldFp: Fingerprint, newFp: Fingerprint): void {
  for (const [key, oldVal] of Object.entries(oldFp)) {
    if (!(key in newFp)) {
      throw new ReinterpretationError(`I4: authoritative field ${key} dropped on replay`);
    }
    if (JSON.stringify(newFp[key]) !== JSON.stringify(oldVal)) {
      throw new ReinterpretationError(
        `I4: ${key} reinterpreted ${JSON.stringify(oldVal)} -> ${JSON.stringify(newFp[key])}`,
      );
    }
  }
}
