/**
 * Event Epistemic Contract — types, transition ontology, errors.
 *
 * TypeScript runtime port of reference/tessera_projection.py (v3, epoch-pure,
 * replay-proven). The Python is the semantics oracle: any divergence is a bug
 * HERE, decided by the reference. See docs/MEMORY_MODEL.md.
 *
 * PERIMETER (stated, not fixed): this contract guarantees provenance and
 * internal consistency. It does NOT guarantee a passing check is meaningful,
 * that evidence points at the right artifact, or that the judgment behind a
 * decision is sound. See MEMORY_MODEL §Perimeter.
 */

export const Status = {
  Asserted: "asserted",
  PendingEvidence: "pending_evidence",
  Validated: "validated",
  Contradicted: "contradicted",
  Superseded: "superseded",
  Ratified: "ratified",
  Disputed: "disputed",
  Rejected: "rejected",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const Authority = {
  /** trusted because EVIDENCE was checked */
  Verified: "authoritative_verified",
  /** trusted because an AUTHORITY declared it — carries no checked evidence by nature */
  Axiomatic: "authoritative_axiomatic",
  /** pending, or under live invalidation review */
  Provisional: "authoritative_provisional",
  /** LLM gloss; never canonical */
  Narrative: "narrative",
} as const;
export type Authority = (typeof Authority)[keyof typeof Authority];

/**
 * Status space is a labeled transition system: guarded edges, cycles,
 * terminal sinks. PENDING_EVIDENCE is an entry (birth) status only — nothing
 * transitions into it, so it is deliberately absent as a target.
 */
export const TRANSITIONS: Readonly<Record<Status, ReadonlySet<Status>>> = {
  [Status.Asserted]: new Set([Status.Ratified, Status.Disputed]),
  [Status.PendingEvidence]: new Set([Status.Validated, Status.Rejected, Status.Disputed]),
  [Status.Validated]: new Set([Status.Contradicted, Status.Superseded]),
  [Status.Contradicted]: new Set([Status.Ratified]),
  [Status.Superseded]: new Set(),
  [Status.Ratified]: new Set([Status.Contradicted]),
  [Status.Disputed]: new Set([Status.Validated, Status.Rejected]),
  [Status.Rejected]: new Set(),
};

/**
 * Every reachable status must be driveable by a marker type, or the fold is
 * underdetermined. Ten event types total: 2 originating + 1 evidence-scoped
 * + 7 transition markers.
 */
export const TRANSITION_EFFECT: Readonly<Record<string, Status>> = {
  verification: Status.Validated,
  supersession: Status.Superseded,
  contradiction: Status.Contradicted,
  ratification: Status.Ratified,
  rejection: Status.Rejected,
  dispute: Status.Disputed,
  trust_root_revoked: Status.Contradicted,
};

export const ORIGINATING: ReadonlySet<string> = new Set(["decision", "foreclosure"]);
export const EVIDENCE_SCOPED: ReadonlySet<string> = new Set(["invalidation"]);
export const KNOWN_TYPES: ReadonlySet<string> = new Set([
  ...ORIGINATING,
  ...EVIDENCE_SCOPED,
  ...Object.keys(TRANSITION_EFFECT),
]);

export const OVERTURNED: ReadonlySet<Status> = new Set([
  Status.Contradicted,
  Status.Superseded,
  Status.Rejected,
]);

export const QUORUM = 2;
export const MAX_CHAIN_DEPTH = 8;

export interface Evidence {
  readonly kind: string;
  readonly ref: string;
  /** null means CITED, not CHECKED — and only checked evidence counts, everywhere */
  readonly checkedAt: string | null;
  readonly signer: string | null;
}

export const isChecked = (e: Evidence): boolean => e.checkedAt !== null;

export interface StratumEvent {
  readonly id: string;
  readonly type: string;
  readonly agentId: string;
  readonly schemaVersion: number;
  /** assigned at append; -1 before */
  readonly seq: number;
  readonly birthStatus: Status;
  readonly claim: Readonly<Record<string, unknown>>;
  readonly evidence: readonly Evidence[];
  readonly targets: readonly string[];
  readonly isTrustRoot: boolean;
  /** metadata only; ignored by every projection path */
  readonly timestamp: string | null;
}

export const hasCheckedEvidence = (e: StratumEvent): boolean =>
  e.evidence.some(isChecked);

export class ContractViolation extends Error {
  override name = "ContractViolation";
}
export class ChainDepthExceeded extends ContractViolation {
  override name = "ChainDepthExceeded";
}
export class IncompleteProjection extends ContractViolation {
  override name = "IncompleteProjection";
}
export class ReinterpretationError extends ContractViolation {
  override name = "ReinterpretationError";
}
export class ParseError extends ContractViolation {
  override name = "ParseError";
}
