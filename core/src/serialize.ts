/**
 * Serialization — the persisted form — and replay. `seq` is intentionally
 * omitted from records; reload reassigns it by append order, proving the
 * log's order is self-describing. loadLog re-runs every guard, so a corrupt
 * persisted log fails ON LOAD, never silently in projection (SPEC §15).
 *
 * Wire format is snake_case, identical to the Python reference.
 */

import { Evidence, ParseError, Status, StratumEvent } from "./contract.js";
import { EpisodicLog } from "./log.js";

export interface EvidenceRecord {
  kind: string;
  ref: string;
  checked_at: string | null;
  signer: string | null;
}

export interface EventRecord {
  id: string;
  type: string;
  agent_id: string;
  schema_version: number;
  birth_status: string;
  claim: Record<string, unknown>;
  evidence: EvidenceRecord[];
  targets: string[];
  is_trust_root: boolean;
  timestamp: string | null;
}

export function eventToRecord(e: StratumEvent): EventRecord {
  return {
    id: e.id,
    type: e.type,
    agent_id: e.agentId,
    schema_version: e.schemaVersion,
    birth_status: e.birthStatus,
    claim: { ...e.claim },
    evidence: e.evidence.map((x) => ({
      kind: x.kind,
      ref: x.ref,
      checked_at: x.checkedAt,
      signer: x.signer,
    })),
    targets: [...e.targets],
    is_trust_root: e.isTrustRoot,
    timestamp: e.timestamp,
  };
}

const VALID_STATUS = new Set<string>(Object.values(Status));

function parseEvidence(x: unknown, ctx: string): Evidence {
  if (typeof x !== "object" || x === null) throw new ParseError(`${ctx}: evidence entry not an object`);
  const r = x as Record<string, unknown>;
  if (typeof r["kind"] !== "string") throw new ParseError(`${ctx}: evidence.kind must be a string`);
  if (typeof r["ref"] !== "string") throw new ParseError(`${ctx}: evidence.ref must be a string`);
  const checkedAt = r["checked_at"] ?? null;
  if (checkedAt !== null && typeof checkedAt !== "string") {
    throw new ParseError(`${ctx}: evidence.checked_at must be string or null`);
  }
  const signer = r["signer"] ?? null;
  if (signer !== null && typeof signer !== "string") {
    throw new ParseError(`${ctx}: evidence.signer must be string or null`);
  }
  return { kind: r["kind"], ref: r["ref"], checkedAt, signer };
}

export function recordToEvent(r: unknown): StratumEvent {
  if (typeof r !== "object" || r === null) throw new ParseError("record is not an object");
  const rec = r as Record<string, unknown>;
  const ctx = typeof rec["id"] === "string" ? `event ${rec["id"]}` : "event <no id>";

  if (typeof rec["id"] !== "string" || rec["id"].length === 0) {
    throw new ParseError(`${ctx}: id must be a non-empty string`);
  }
  if (typeof rec["type"] !== "string") throw new ParseError(`${ctx}: type must be a string`);
  if (typeof rec["agent_id"] !== "string") throw new ParseError(`${ctx}: agent_id must be a string`);
  if (typeof rec["schema_version"] !== "number") {
    throw new ParseError(`${ctx}: schema_version must be a number`);
  }
  if (typeof rec["birth_status"] !== "string" || !VALID_STATUS.has(rec["birth_status"])) {
    throw new ParseError(`${ctx}: birth_status ${JSON.stringify(rec["birth_status"])} invalid`);
  }
  const claim = rec["claim"] ?? {};
  if (typeof claim !== "object" || claim === null || Array.isArray(claim)) {
    throw new ParseError(`${ctx}: claim must be an object`);
  }
  const evidenceRaw = rec["evidence"] ?? [];
  if (!Array.isArray(evidenceRaw)) throw new ParseError(`${ctx}: evidence must be an array`);
  const targetsRaw = rec["targets"] ?? [];
  if (!Array.isArray(targetsRaw) || targetsRaw.some((t) => typeof t !== "string")) {
    throw new ParseError(`${ctx}: targets must be an array of strings`);
  }
  const timestamp = rec["timestamp"] ?? null;
  if (timestamp !== null && typeof timestamp !== "string") {
    throw new ParseError(`${ctx}: timestamp must be string or null`);
  }

  return {
    id: rec["id"],
    type: rec["type"],
    agentId: rec["agent_id"],
    schemaVersion: rec["schema_version"],
    seq: -1,
    birthStatus: rec["birth_status"] as Status,
    claim: { ...(claim as Record<string, unknown>) },
    evidence: evidenceRaw.map((x, i) => parseEvidence(x, `${ctx} evidence[${i}]`)),
    targets: [...(targetsRaw as string[])],
    isTrustRoot: rec["is_trust_root"] === true,
    timestamp,
  };
}

export function serializeLog(log: EpisodicLog): EventRecord[] {
  return log.eventsUpto().map(eventToRecord);
}

/** Reconstruct purely from persisted records; every guard re-runs. */
export function loadLog(records: readonly unknown[]): EpisodicLog {
  const log = new EpisodicLog();
  for (const r of records) log.append(recordToEvent(r));
  return log;
}
