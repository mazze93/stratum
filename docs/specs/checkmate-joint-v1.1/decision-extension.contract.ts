/** Proposed v1 contract surface only. Implement in Stratum; consume unchanged in Checkmate. */
export type Brand<T, N extends string> = T & { readonly __brand: N };
export type Digest = Brand<string, "sha256-lower-hex">;
export type RevisionId = Brand<string, "claim-revision-id">;
export type EvidenceId = Brand<string, "evidence-id">;
export type LogId = Brand<string, "private-managed-log-id">;
export type Json = null | boolean | number | string | readonly Json[] |
  { readonly [key: string]: Json };

export interface SnapshotCutoff {
  readonly log_id: LogId;
  readonly epoch: number; // runtime: nonnegative safe integer
  readonly head_digest: Digest;
  readonly policy_digest: Digest;
  readonly profile_id: string;
  readonly profile_version: number;
}
export interface SnapshotBasis extends SnapshotCutoff {
  readonly projection_digest: Digest;
}
export interface DecisionContext {
  readonly snapshot_cutoff: SnapshotCutoff;
  readonly facts_digest: Digest; // normalized facts, excluding derived decisions
  readonly claim_revision: RevisionId;
  readonly scope_digest: Digest;
  readonly kernel_version: string;
  readonly extension_id: string;
  readonly extension_version: string;
  readonly extension_artifact_digest: Digest;
  readonly input_schema_id: string;
  readonly output_schema_id: string;
}
export type ReasonCode =
  | "not_current" | "not_validated" | "authority_not_verified"
  | "receipt_missing" | "receipt_invalid" | "artifact_unavailable"
  | "scope_mismatch" | "obligation_unsatisfied" | "dependency_blocked"
  | "evidence_under_review" | "registry_under_review"
  | "policy_unavailable" | "extension_unsupported" | "digest_mismatch"
  | "input_invalid" | "limit_exceeded" | "profile_unconfigured"
  | "insufficient_samples" | "missing_value" | "unit_mismatch"
  | "numeric_range" | "denominator_zero";
export interface DecisionBasis {
  readonly context: DecisionContext;
  readonly evidence_refs: readonly EvidenceId[];
  readonly dependency_refs: readonly RevisionId[];
  readonly obligation_ids: readonly string[];
  readonly limitations: readonly string[];
  readonly may_authorize_publication: false;
}
export type RawClaimStatus = "asserted" | "pending_evidence" | "validated" |
  "contradicted" | "superseded" | "ratified" | "disputed" | "rejected";
export type Authority = "authoritative_verified" | "authoritative_axiomatic" |
  "authoritative_provisional" | "narrative";
export interface EligibilityFacts {
  readonly current_revision: boolean;
  readonly raw_status: RawClaimStatus;
  readonly authority: Authority;
  readonly matching_admitted_receipts: readonly string[];
  readonly required_receipt_count: number; // runtime: positive safe integer
  readonly all_obligations_satisfied: boolean;
  readonly under_review: boolean;
  readonly registry_under_review: boolean;
  readonly blocked_by: readonly RevisionId[];
  readonly available_evidence_refs: readonly EvidenceId[];
}
export interface EvidenceEligibilityInput {
  readonly kind: "evidence_eligibility";
  readonly context: DecisionContext;
  readonly facts: EligibilityFacts;
  readonly policy_parameters: Readonly<Record<string, Json>>;
}
export type EvidenceEligibilityResult = DecisionBasis & (
  | { readonly kind: "evidence_eligibility"; readonly outcome: "eligible";
      readonly reasons: readonly []; readonly checked_use_eligible: true }
  | { readonly kind: "evidence_eligibility";
      readonly outcome: "ineligible" | "needs_review" | "indeterminate";
      readonly reasons: readonly ReasonCode[]; readonly checked_use_eligible: false }
);

export interface MeasurementFact {
  readonly measurement_id: string; // stable identity from case/experiment/method/revision/category
  readonly outcome_category: string;
  readonly method_id: string;
  readonly method_version: string;
  readonly claim_revision: RevisionId;
  readonly acknowledged_checked_use_eligible: boolean;
  readonly values: Readonly<Record<string, {
    readonly value: number | null;
    readonly unit: string;
  }>>;
  readonly evidence_refs: readonly EvidenceId[];
}
export interface ScoreDimensionPolicy {
  readonly dimension_id: string;
  readonly meaning: string;
  readonly unit: string;
  readonly minimum: number; // runtime: safe integers throughout; maximum >= minimum
  readonly maximum: number;
  readonly method_id: string;
  readonly method_version: string;
  readonly parameters: Readonly<Record<string, Json>>;
  readonly permitted_outcome_categories: readonly string[];
  readonly minimum_sample_count: number;
  readonly denominator_definition: string;
  readonly missing_value_rule: "abstain";
}
export interface ScoreInput {
  readonly kind: "score";
  readonly context: DecisionContext;
  readonly measurements: readonly MeasurementFact[];
  readonly dimensions: readonly ScoreDimensionPolicy[];
}
export interface ScoredDimension {
  readonly dimension_id: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly unit: string;
  readonly method_id: string;
  readonly method_version: string;
  readonly sample_count: number;
  readonly denominator: number;
  readonly measurement_ids: readonly string[];
  readonly limitations: readonly string[];
}
export type ScoreResult = DecisionBasis & (
  | { readonly kind: "score"; readonly outcome: "scored";
      readonly dimensions: readonly ScoredDimension[]; readonly reasons: readonly [] }
  | { readonly kind: "score"; readonly outcome: "abstained";
      readonly dimensions: readonly []; readonly reasons: readonly ReasonCode[] }
);
export interface InputByKind {
  readonly evidence_eligibility: EvidenceEligibilityInput;
  readonly score: ScoreInput;
}
export interface ResultByKind {
  readonly evidence_eligibility: EvidenceEligibilityResult;
  readonly score: ScoreResult;
}
export type DecisionKind = keyof InputByKind;
export interface ExtensionManifest<K extends DecisionKind> {
  readonly id: string;
  readonly version: string;
  readonly artifact_digest: Digest;
  readonly kind: K;
  readonly input_schema_id: `${K}.input.v${number}`;
  readonly output_schema_id: `${K}.result.v${number}`;
  readonly compatible_policy_versions: readonly number[];
  readonly limits: { readonly maximum_input_items: number; readonly maximum_steps: number };
}
export interface DecisionExtension<K extends DecisionKind> {
  readonly manifest: ExtensionManifest<K>;
  readonly evaluate: (input: InputByKind[K]) => ResultByKind[K];
}
export type RegisteredExtension = {
  readonly [K in DecisionKind]: DecisionExtension<K>
}[DecisionKind];
export interface EvaluationEnvelope<K extends DecisionKind> {
  readonly context: DecisionContext;
  readonly input_digest: Digest;
  readonly result: ResultByKind[K];
  readonly result_digest: Digest; // canonical result only; excludes this digest field
  // Attached after the projection digest is computed. Never hash this wrapper into itself.
  readonly acknowledged_snapshot: SnapshotBasis | null; // null for an unadmitted preview
}
// The implementation must reject unknown JSON at runtime, then dispatch a compiled allowlist.
// It must not return a transport acknowledgement, authority grant or publication permission.
export declare function evaluate<K extends DecisionKind>(
  extension: DecisionExtension<K>, input: InputByKind[K]
): EvaluationEnvelope<K>;
