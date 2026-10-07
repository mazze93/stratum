/**
 * Serialization — the persisted form — and replay. `seq` is intentionally
 * omitted from records; reload reassigns it by append order, proving the
 * log's order is self-describing. loadLog re-runs every guard, so a corrupt
 * persisted log fails ON LOAD, never silently in projection (SPEC §15).
 *
 * Wire format is snake_case, identical to the Python reference.
 */

import {
  Binding,
  Evidence,
  GIT_OBJECT_ID,
  isRepoRelativePath,
  ParseError,
  SCHEMA_VERSIONS,
  SHA256_HEX,
  Status,
  StratumEvent,
} from "./contract.js";
import { EpisodicLog } from "./log.js";

export type BindingRecord =
  | {
      type: "reproducible_check";
      command: string;
      repo: string;
      commit: string;
      expect_exit: number;
      inputs?: { id: string; sha256: string }[];
      output_sha256?: string;
      output_path?: string;
    }
  | {
      type: "signed_attestation";
      subject_sha256: string;
      predicate: string;
      key_id: string;
      signature: string;
    };

export interface EvidenceRecord {
  kind: string;
  ref: string;
  checked_at: string | null;
  signer: string | null;
  /** present only on v2 evidence that carries one — v1 wire bytes are unchanged */
  binding?: BindingRecord;
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
      ...(x.binding ? { binding: bindingToRecord(x.binding) } : {}),
    })),
    targets: [...e.targets],
    is_trust_root: e.isTrustRoot,
    timestamp: e.timestamp,
  };
}

function bindingToRecord(b: Binding): BindingRecord {
  if (b.type === "signed_attestation") {
    return {
      type: b.type,
      subject_sha256: b.subjectSha256,
      predicate: b.predicate,
      key_id: b.keyId,
      signature: b.signature,
    };
  }
  return {
    type: b.type,
    command: b.command,
    repo: b.repo,
    commit: b.commit,
    expect_exit: b.expectExit,
    ...(b.inputs.length > 0 ? { inputs: b.inputs.map((i) => ({ id: i.id, sha256: i.sha256 })) } : {}),
    ...(b.outputSha256 !== null ? { output_sha256: b.outputSha256, output_path: b.outputPath! } : {}),
  };
}

const VALID_STATUS = new Set<string>(Object.values(Status));

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Strict: unknown keys refused, every field re-derived and format-checked. */
function onlyKeys(r: Record<string, unknown>, allowed: readonly string[], ctx: string): void {
  for (const k of Object.keys(r)) {
    if (!allowed.includes(k)) throw new ParseError(`${ctx}: unknown field ${JSON.stringify(k)}`);
  }
}

function parseBinding(x: unknown, ctx: string): Binding {
  if (typeof x !== "object" || x === null || Array.isArray(x)) {
    throw new ParseError(`${ctx}: binding must be an object`);
  }
  const r = x as Record<string, unknown>;
  if (r["type"] === "reproducible_check") {
    onlyKeys(r, ["type", "command", "repo", "commit", "expect_exit", "inputs", "output_sha256", "output_path"], ctx);
    if (!nonEmpty(r["command"])) throw new ParseError(`${ctx}: command must be a non-empty string`);
    if (!nonEmpty(r["repo"])) throw new ParseError(`${ctx}: repo must be a non-empty string`);
    if (typeof r["commit"] !== "string" || !GIT_OBJECT_ID.test(r["commit"])) {
      throw new ParseError(`${ctx}: commit must be a full 40- or 64-hex git object id`);
    }
    const ex = r["expect_exit"];
    if (typeof ex !== "number" || !Number.isInteger(ex) || ex < 0 || ex > 255) {
      throw new ParseError(`${ctx}: expect_exit must be an integer 0..255`);
    }
    const inputsRaw = r["inputs"] ?? [];
    if (!Array.isArray(inputsRaw)) throw new ParseError(`${ctx}: inputs must be an array`);
    const inputs = inputsRaw.map((i, n) => {
      if (typeof i !== "object" || i === null || Array.isArray(i)) {
        throw new ParseError(`${ctx}: inputs[${n}] must be an object`);
      }
      const ir = i as Record<string, unknown>;
      onlyKeys(ir, ["id", "sha256"], `${ctx} inputs[${n}]`);
      if (!nonEmpty(ir["id"])) throw new ParseError(`${ctx}: inputs[${n}].id must be a non-empty string`);
      if (typeof ir["sha256"] !== "string" || !SHA256_HEX.test(ir["sha256"])) {
        throw new ParseError(`${ctx}: inputs[${n}].sha256 must be 64 lowercase hex`);
      }
      return { id: ir["id"], sha256: ir["sha256"] };
    });
    const out = r["output_sha256"] ?? null;
    if (out !== null && (typeof out !== "string" || !SHA256_HEX.test(out))) {
      throw new ParseError(`${ctx}: output_sha256 must be 64 lowercase hex`);
    }
    const outPath = r["output_path"] ?? null;
    if ((out === null) !== (outPath === null)) {
      // a digest without its file can't be re-checked; a file without a digest pins nothing
      throw new ParseError(`${ctx}: output_sha256 and output_path go together`);
    }
    if (outPath !== null && !isRepoRelativePath(outPath)) {
      throw new ParseError(`${ctx}: output_path must be a repo-relative path inside the checkout`);
    }
    return {
      type: "reproducible_check",
      command: r["command"],
      repo: r["repo"],
      commit: r["commit"],
      expectExit: ex,
      inputs,
      outputSha256: out,
      outputPath: outPath,
    };
  }
  if (r["type"] === "signed_attestation") {
    onlyKeys(r, ["type", "subject_sha256", "predicate", "key_id", "signature"], ctx);
    if (typeof r["subject_sha256"] !== "string" || !SHA256_HEX.test(r["subject_sha256"])) {
      throw new ParseError(`${ctx}: subject_sha256 must be 64 lowercase hex`);
    }
    if (!nonEmpty(r["predicate"])) throw new ParseError(`${ctx}: predicate must be a non-empty string`);
    if (!nonEmpty(r["key_id"])) throw new ParseError(`${ctx}: key_id must be a non-empty string`);
    if (!nonEmpty(r["signature"])) throw new ParseError(`${ctx}: signature must be a non-empty string`);
    return {
      type: "signed_attestation",
      subjectSha256: r["subject_sha256"],
      predicate: r["predicate"],
      keyId: r["key_id"],
      signature: r["signature"],
    };
  }
  throw new ParseError(`${ctx}: unknown binding type ${JSON.stringify(r["type"])}`);
}

function parseEvidence(x: unknown, ctx: string, schemaVersion: number): Evidence {
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
  if (r["binding"] !== undefined && r["binding"] !== null) {
    if (schemaVersion < 2) throw new ParseError(`${ctx}: binding requires schema_version 2`);
    return { kind: r["kind"], ref: r["ref"], checkedAt, signer, binding: parseBinding(r["binding"], `${ctx} binding`) };
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
  if (typeof rec["schema_version"] !== "number" || !SCHEMA_VERSIONS.has(rec["schema_version"])) {
    // fail-closed on versions this build doesn't know (ADR-003 §3)
    throw new ParseError(`${ctx}: schema_version ${JSON.stringify(rec["schema_version"])} unsupported`);
  }
  if (typeof rec["birth_status"] !== "string" || !VALID_STATUS.has(rec["birth_status"])) {
    throw new ParseError(`${ctx}: birth_status ${JSON.stringify(rec["birth_status"])} invalid`);
  }
  const claim = rec["claim"] ?? {};
  if (typeof claim !== "object" || claim === null || Array.isArray(claim)) {
    throw new ParseError(`${ctx}: claim must be an object`);
  }
  // evidence, targets and is_trust_root are REQUIRED, as in the oracle — a
  // lenient default here let TS accept logs the reference rejects (touchstone).
  const evidenceRaw = rec["evidence"];
  if (!Array.isArray(evidenceRaw)) throw new ParseError(`${ctx}: evidence must be an array`);
  const targetsRaw = rec["targets"];
  if (!Array.isArray(targetsRaw) || targetsRaw.some((t) => typeof t !== "string")) {
    throw new ParseError(`${ctx}: targets must be an array of strings`);
  }
  if (typeof rec["is_trust_root"] !== "boolean") {
    throw new ParseError(`${ctx}: is_trust_root must be a boolean`);
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
    evidence: evidenceRaw.map((x, i) =>
      parseEvidence(x, `${ctx} evidence[${i}]`, rec["schema_version"] as number),
    ),
    targets: [...(targetsRaw as string[])],
    isTrustRoot: rec["is_trust_root"],
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
