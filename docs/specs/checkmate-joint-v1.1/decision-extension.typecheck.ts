import { evaluate } from "./decision-extension.contract";
import type {
  DecisionExtension, EvidenceEligibilityInput, EvidenceEligibilityResult,
  ScoreInput, ScoreResult, ExtensionManifest
} from "./decision-extension.contract";

declare const evidenceExtension: DecisionExtension<"evidence_eligibility">;
declare const scoreExtension: DecisionExtension<"score">;
declare const evidenceInput: EvidenceEligibilityInput;
declare const scoreInput: ScoreInput;

const validEvidence: EvidenceEligibilityResult = evidenceExtension.evaluate(evidenceInput);
const validScore: ScoreResult = scoreExtension.evaluate(scoreInput);
evaluate(evidenceExtension, evidenceInput);
evaluate(scoreExtension, scoreInput);

// @ts-expect-error evidence evaluator cannot accept scoring input
evidenceExtension.evaluate(scoreInput);
// @ts-expect-error scoring evaluator cannot accept evidence input
scoreExtension.evaluate(evidenceInput);
// @ts-expect-error dispatch must preserve the input/extension relationship
evaluate(evidenceExtension, scoreInput);
// @ts-expect-error evidence result cannot be used as a score
const wrongResult: ScoreResult = validEvidence;
// @ts-expect-error an evidence extension cannot be registered as a score extension
const wrongExtension: DecisionExtension<"score"> = evidenceExtension;
// @ts-expect-error contexts and input facts are readonly
evidenceInput.context.snapshot_cutoff.epoch = 99;
const invalidManifest: ExtensionManifest<"evidence_eligibility"> = {
  ...evidenceExtension.manifest,
  // @ts-expect-error input schema ID must match the extension kind
  input_schema_id: "score.input.v1"
};
if (validEvidence.outcome === "eligible") {
  const trueOnly: true = validEvidence.checked_use_eligible;
} else {
  const falseOnly: false = validEvidence.checked_use_eligible;
}
// @ts-expect-error even a valid score cannot grant publication permission
const publicationPermission: true = validScore.may_authorize_publication;
void invalidManifest;
