# Checkmate review evidence — 2026-10-16

Scope: assessment of orchestration, stopping rules, durable evidence, and bounded validation. Production records, configuration, and the existing repository checkout were not modified.

## Source identity

Authenticated GitHub metadata reports mazze93/checkmate as PRIVATE. Remote main resolved to 36a4ef374b39bbe9d3230fed039dec3932754391 (2026-10-13). The source was downloaded into a separate review directory. Newer successful Actions runs inspected were pull-request runs, not proof of a newer deployed main revision.

## Live observation

Browser navigation to https://checkmate.mazzeleczzare.com/public returned a page generated 2026-10-16 09:03 UTC:

- 6 audits: class already closed 2; inconclusive 1; open 1; partially held 1; claim failed 1.
- The page reported Chain intact, 145 links, head 0d247b95592b1ce44bff65d18e89f962112d9ecfa8830b5a080e076c959b1476.
- 0 advisories filed through the human-authorized gate; 11 process incidents.
- 17 outcome records across 10 unlisted methods/skills: false positive emitted 1; false positive caught 5; real bug 7; inconclusive 1; harness bug found 1; class already closed 2.

These are application-reported aggregates, not independently reproduced research results or independent chain verification. The web fetch initially returned older October 14 content; the browser observation above supersedes that dated snapshot. The root dashboard redirected to Cloudflare Access and was not authenticated or exercised.

## Local runtime validation

Installed the snapshot's locked dependencies with npm ci --ignore-scripts --no-audit --no-fund. Node v26.12.0, Vitest v4.1.11. No production credentials were used.

Command from the snapshot root:

    npx vitest run test/review-probes.test.ts test/ledger.test.ts test/public.test.ts test/security-regressions.test.ts

Result: 4 test files passed; 32 tests passed (28 existing plus 4 added review probes). Tests use the repository's Cloudflare Workers runtime and local Durable Objects, not production. The full application suite, typecheck, deployment dry run, authenticated dashboard, vulnerability PoCs, backups, witness installations, and production revision identity were not verified in this review.

The accompanying checkmate-review-probes.test.ts can be placed under test/review-probes.test.ts in the identified revision. It imports the existing test/helpers.ts.

Probe results:

1. Agent sets class-closed/no-action immediately after audit creation: accepted with HTTP 200, zero phase records, and a valid local chain.
2. Agent appends draft as first phase with null payload: accepted; currentPhase becomes draft; phasesRecorded contains only draft.
3. Agent creates a synthetic draft advisory and changes state to published with a synthetic advisory ID: accepted; public-projection includes its identifying metadata without human publication approval, below the aggregate threshold.
4. Agent submits the same skill metric twice: both accepted; aggregate total and real-bug count become two.

Source locations:

- src/agent.ts: handleCreate (191), handlePhase (219), handleVerdict (272).
- src/hub.ts: handleSkillMetric (361), handleAdvisoryState (451), handleAuthorizeFiling (546), handleConfirmFiling (594), publicProjection (655), efficacy (740).
- src/types.ts: phase payload is opaque; audit header has no required experiment-budget, pause/resume, evidence-binding, or verification-scope contract.
- public/app.js: gameState (83), attentionRank (221), phase progress bar (256).
- hooks/checkmate-tooluse.mjs: optional audit selection, minimal descriptors, 2.5-second timeout, fail-open exit, no durable retry spool.
- docs/journal/PLAN.md and CHECKPOINT.md: P4 dogfooding remains unchecked; richer RSA efficacy analysis is a candidate; old first-audit/empty-index statements conflict with current public counts.

## Interpretation

Checkmate implements shared research state, append-only provenance, process vocabulary, explicit non-success outcomes, and a human authorization workflow. It does not yet enforce evidence-backed completion or bounded experiment execution. Integrity of recorded statements is a separate assurance from completeness of capture, correctness of an experiment, validity of a conclusion, or independent upstream acceptance.

Recommended order: close advisory publication authority gap; add evidence-backed adjudication distinct from recorded verdicts; add bounded experiment records and pause/resume criteria; preserve content-addressed artifacts and execution/verifier receipts; add capture-gap visibility and metric deduplication; reconcile current operational status with historical journal notes.
