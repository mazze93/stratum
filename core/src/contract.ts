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

/**
 * ADR-003 §3 (tp-002, tp-011). A v2 binding is what makes evidence
 * re-checkable rather than merely asserted: a pinned recipe anyone can re-run
 * and compare, or an artifact digest signed by a registered authority key.
 */
export interface ReproducibleCheck {
  readonly type: "reproducible_check";
  readonly command: string;
  readonly repo: string;
  /** 40-hex (SHA-1) or 64-hex (SHA-256) git object id the check ran against */
  readonly commit: string;
  readonly expectExit: number;
  /** optional; shaped like Temenos's provenance envelope inputs[] */
  readonly inputs: readonly { readonly id: string; readonly sha256: string }[];
  /** optional; MUST digest deterministic output (a report file), never raw logs */
  readonly outputSha256: string | null;
}

export interface SignedAttestation {
  readonly type: "signed_attestation";
  readonly subjectSha256: string;
  readonly predicate: string;
  readonly keyId: string;
  readonly signature: string;
}

export type Binding = ReproducibleCheck | SignedAttestation;

export const SHA256_HEX = /^[0-9a-f]{64}$/;
export const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export const SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1, 2]);

export interface Evidence {
  readonly kind: string;
  readonly ref: string;
  /**
   * v1: null means CITED, not CHECKED — and only checked evidence counts.
   * v2: metadata only. No v2 guard reads it (ADR-003 §3): a typed timestamp
   * cannot tell "checked" from "cited", which is the defect v2 exists to fix.
   */
  readonly checkedAt: string | null;
  /** v1: a name, not a signature. v2: metadata only. */
  readonly signer: string | null;
  /** v2 only; null for every v1 evidence entry */
  readonly binding?: Binding | null;
}

export const isChecked = (e: Evidence): boolean => e.checkedAt !== null;

/**
 * v2 I1 currency: evidence counts toward validation only if it carries a
 * binding that can count. A reproducible_check counts once well-formed (the
 * parser enforced that). A signed_attestation counts only when its key is a
 * live registry member and the signature verifies — the registry lands in
 * phase 3, so until then an attestation is parsed but never counts.
 */
export const countsAsBound = (e: Evidence): boolean => e.binding?.type === "reproducible_check";

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

export const hasBoundEvidence = (e: StratumEvent): boolean => e.evidence.some(countsAsBound);

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
