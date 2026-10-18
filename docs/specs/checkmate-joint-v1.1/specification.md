# Checkmate and Stratum
Joint implementation specification version 1.1

## 1 Abstract

Make Checkmate a first class client of Stratum by implementing both sides of a shared claim and evidence contract. Checkmate owns research operations, artifacts, experiment budgets and human disclosure decisions. Stratum owns evidentiary admission, authenticated verification, claim dependencies, invalidation and the derived assurance presented by Checkmate. Neither project is complete at this boundary until the other can exercise and verify the contract.

The first release must demonstrate a full correction loop: register a scoped claim, preserve and check its evidence, derive its supported state, invalidate a supporting artifact, and show the resulting review state in the case, disclosure draft and efficacy projection. The demonstration uses synthetic fixtures based on the structure of the DaisyDisk investigation. It must not imply that the suspected privilege escalation has been reproduced.

Status is implementation proposal version 1.1 dated October 16 2026. The user established the architectural direction and required changes in both repositories. This document specifies the proposed engineering contract and release gates. It records no deployment, verification of the suspected vulnerability, or approval to disclose research.

## 2 Goals and scope

| Required outcome | Outside the first release |
| --- | --- |
| One Stratum derived assurance view used by Checkmate | A general autonomous research scheduler or an exploit framework |
| Receipt backed verification with a declared scope and oracle | Automatic proof of scientific truth or adequacy of every oracle |
| Durable delivery and deterministic correction propagation | Public research evidence or automatic publication |
| Versioned migration and tested recovery across both projects | A rewrite of historical verdicts or unconditional promotion of legacy evidence |

### Shared invariants

I1 Authority has one source. Checkmate stores historical observations and dispositions, but it does not maintain an independently editable current evidentiary verdict. Every supported conclusion names its Stratum log, claim revision, projection epoch, head digest and contract version.

I2 Recorded, reproducible, executed and adjudicated are distinct. A recipe, timestamp, signer name, passing package check or intact chain is insufficient to promote a research claim. Empirical verification requires a matching authenticated receipt and the profile requirements for that claim.

I3 Corrections have consequences. Invalidating evidence or retiring a required prerequisite removes the dependent conclusion from checked use, marks affected drafts for review and recalculates current efficacy eligibility. Historical events remain unchanged.

I4 Continuity survives failures. A local observation and its delivery intent commit together; a remote command and its acknowledgment commit together. Retries never create a second evidentiary operation. A cached projection exposes its cutoff and cannot authorize a new consequential action.

I5 Permission and evidence remain separate. A human may authorize a clearly labeled provisional disclosure. That authorization cannot turn a candidate into a verified result. Stratum support cannot itself authorize filing, publication or execution of a privileged experiment.

I6 Confidentiality persists across the integration. Checkmate cases map to opaque private Stratum log IDs. Neither default demo visibility nor an agent supplied published label may expose identifying research data.

## 3 Current implementation and gaps

Source baseline checked on October 16 2026: Checkmate main is 36a4ef374b39bbe9d3230fed039dec3932754391. Stratum main and the inspected local tracked files are d5a526b3bd57ead2bd0eb9217eef76f72e9276db. Reconfirm these revisions before implementation. The Stratum checkout contains preexisting untracked AGENTS.md and cli/mise.toml; leave them intact.

| Observed capability | Boundary gap | Required owner |
| --- | --- | --- |
| Checkmate records opaque phases and enum verdicts | An agent can record class closed with no phase evidence | Checkmate proposal path and Stratum admission |
| Checkmate chains records and anchors audit heads | Integrity does not establish artifact completeness or a valid experiment | Both artifact binding and receipt verification |
| Stratum v2 admits reproducible check bindings | Well formed recipes count without automatic execution | Stratum versioned evidence semantics |
| Stratum derives review from invalidated evidence refs | Arbitrary prerequisite claim propagation is absent | Stratum dependency contract and Checkmate consumers |
| Stratum exposes append and head APIs | Duplicate event IDs are refused rather than acknowledged idempotently | Stratum command persistence and Checkmate outbox |
| Checkmate gates filing authorization by human principal | Advisory published state can independently feed the public projection | Checkmate publication authority and release checks |

Earlier local review passed 28 existing Checkmate tests and four added probes. Those probes demonstrated closure without evidence, draft first with a null payload, agent designated advisory publication, and duplicate metric counting. These results establish the reviewed application behavior; they are not tests of the integration proposed here.

Stratum currently supports schema versions 1 and 2, a deterministic TypeScript projection with a Python reference, atomic log persistence and per log head digests. Its authority registry and signature backed authority are unfinished: signed attestations do not yet count as bound evidence, and v2 ratification and trust root revocation are refused. Its separate rechecker reruns same repository recipes and does not append its results as authority. The joint release must close the relevant gaps without treating planned registry behavior as available.

## 4 Proposed architecture and ownership

[Architecture figure in the DOCX: Checkmate commands, Stratum snapshots, retained private evidence and independent verifier.]

Figure 1  Research operations and evidentiary authority meet through durable commands and epoch pinned projections. The verifier reports to Stratum independently of the proposing agent. Raw artifacts stay in private durable storage.

| Component | Responsibility | Durable state |
| --- | --- | --- |
| Checkmate AuditCase | Case observations, claim proposals, experiment contracts and source outbox | Case events, chain and delivery intent |
| Checkmate LedgerHub | Case index, review tasks, disclosure approvals and current metric eligibility | Workflow events and projection receipts |
| Stratum managed client gate | Scoped actor authorization, idempotency, receipts and contract validation | Command journal and accepted events |
| Stratum core and reference | Status, authority, evidence review and required dependency projection | Replayable event and registry streams |
| Bounded verifier | Approved recipe execution and a separate semantic check | Artifact manifest and authenticated receipts |

### Work required at the boundary

| Gap | Stratum deliverable | Checkmate deliverable | Test |
| --- | --- | --- | --- |
| Receipt authority | Registered verifier identity and executed evidence admission | Submit artifacts and request checks without self certification | A03 A04 |
| Dependencies | Typed required edges and deterministic review propagation | Declare prerequisites and render affected conclusions | A05 A06 |
| Delivery | Atomic deduplication and head aware command acknowledgment | Transactional source outbox and reconciliation | A07 A08 |
| Snapshots | Single epoch read with events and projection digest | Monotonic cache and visible pending or stale state | A09 A10 |
| Historical correction | Legal transitions and preserved version semantics | Superseded labels and draft review tasks | A01 A11 |
| Privacy | Private managed namespace and blocked alternate write paths | Human publication approval bound to exact released fields | A12 A13 |
| Recovery | Replay and receipts that reproduce the same projection | Cache rebuild and side effect reconciliation | A08 A18 |
| Efficacy | Current claim eligibility and invalidation reason | Unique measurements and a frozen historical view | A14 A15 |

Stratum owns the shared schemas, canonical encodings, client policy profile and conformance fixtures. Checkmate pins a released contract version or immutable source revision. Checkmate must not copy a modified projection algorithm into its dashboard. Stratum keeps generic claim semantics independent of vulnerability terminology; the managed research profile supplies the domain obligations.

## 5 Request and correction lifecycle

1 Capture. Checkmate authenticates the actor, validates case membership and appends an observation plus outbox intent in one storage transaction. The response distinguishes recorded locally from acknowledged by Stratum. Source events carry stable IDs and full origin provenance; tool summaries remain supporting context rather than execution receipts.

2 Register. The dispatcher submits an immutable command through a scoped service binding to the Stratum managed client entrypoint. Stratum resolves the client and case server side, validates the requested operation and checks the expected head. The proposing agent cannot submit an authority level, verifier identity or successful receipt as trusted facts.

3 Prepare. A claim begins pending evidence and names its exact scope, acceptance obligations and required prerequisite revisions. Checkmate persists a bounded experiment plan with permitted inputs, resource limits, negative controls, stop conditions and a resume trigger. Approval to run is recorded separately from evidentiary promotion.

4 Execute. An independently authorized verifier resolves the approved recipe and rederives input hashes, target identity and environment. It runs within the recorded budget, preserves outputs, and emits an execution receipt and an oracle result. Unavailable, timed out, skipped and inconclusive remain distinct outcomes. The platform never executes arbitrary commands simply because they appeared in a claim or binding.

5 Admit. Stratum verifies receipt identity, policy membership, claim and scope binding, artifact availability, hashes, expected outcome and required controls. It appends the verification operation only when every required obligation is satisfied. Successful execution alone can leave the research claim pending or disputed if the oracle cannot support it.

6 Project. Stratum returns the current claim status, authority, direct evidence review, prerequisite blockers, checked use eligibility and snapshot identity. Checkmate stores that receipt and renders the corresponding dossier. Changes in a case can proceed while delivery is pending; verified badges, new efficacy promotions and consequential approval actions wait for a current acknowledged projection.

7 Correct. A verifier or human submits a scoped invalidation with a reason and evidence. Stratum applies the legal event transition and derives every affected prerequisite blocker. Checkmate refreshes the case, flags linked draft revisions and removes the affected measurement from current validated efficacy. It retains the prior publication and metric snapshots as historical records.

8 Recover. After timeout, restart or lost response, Checkmate queries by command ID and compares the canonical payload digest. It rebuilds its projection cache from a consistent Stratum snapshot. It never infers success from silence or reissues an external filing solely because its confirmation is missing.

## 6 Shared API and data contracts

### Versions and identity

Introduce managed client protocol 1 and the research claims profile 1 in Stratum. The transport protocol, client profile, event schema and verifier policy each have an explicit version. This design proposes event schema 3 for stronger evidence and dependency semantics; existing schema 1 and 2 replay must remain behaviorally unchanged. Publish event.v3.schema.json, managed-client.v1.schema.json and the research profile fixtures before wiring either client. Unsupported versions fail explicitly; there is no downgrade to schema 1 or 2 to obtain a successful verdict.

A case has one opaque private log named cm followed by a hyphen and a 32 character lowercase hexadecimal identifier. Reserve the complete cm namespace before provisioning. The first release restricts required claim dependencies to revisions in that same log; cross case links are navigational and cannot establish checked support. Claim IDs survive prose edits, but a materially changed proposition or scope creates a new immutable revision event. A lineage parent is not an evidentiary dependency.

| Record | Required fields | Binding rule |
| --- | --- | --- |
| Command | protocol, client_id, case_id, source_event_id, command_id, operation, expected_head_digest, payload_digest, payload | Server resolves managed log and actor; digest covers canonical semantic payload |
| Command result | command_id, payload_digest, event_ids, accepted_seq, accepted_head_digest, disposition | Same command and bytes return the original result |
| Claim revision | claim_id, revision_id, proposition, scope_digest, obligations, requires, source_event_id | Required edges pin exact same log revision IDs |
| Scope manifest | target digest and version, configuration, OS and architecture, input corpus, inclusions, exclusions | Canonical digest defines the tested perimeter |
| Evidence manifest | evidence_id, artifact digest, size, media type, private locator, recipe and environment digests, retention class | Locator must resolve to immutable bytes; scratch paths cannot be sole storage |
| Execution receipt | receipt_id, claim revision, scope, recipe, input and output digests, actual exit, resource use, outcome, verifier identity | Authenticated against the registry and matching approved recipe |
| Oracle result | oracle version and digest, predicate, required controls, observed result, limitations | Passing process exit does not substitute for a supported predicate |
| Projection snapshot | log_id, event_schema, profile_version, policy_digest, epoch, head_digest, projection_digest, claims | All fields describe one consistent epoch |
| Disclosure revision | body digest, exact destination, claim revisions, evidence cutoff, projection identity, human authorization | Any material change requires renewed review |

### Managed operations

The proposed Stratum service interface exposes provisionCase, submitCommand, getCommandResult and getCaseSnapshot. Checkmate exposes claim proposal, evidence registration, verification request, correction proposal and projection reads through its existing REST and MCP authentication boundary. Method names are proposed contracts, not currently callable APIs. Both transports must call the same handlers and conformance tests.

The command operation set is register_claim, register_evidence, request_verification, apply_verification, invalidate_evidence, revise_claim and dispute_claim. Verification requests queue work but do not promote claims. apply_verification requires a registered verifier receipt. Human authority actions require their own registry capability. Agents may propose a correction or dispute, but cannot forge a human decision or verifier acknowledgment.

Canonical command identity covers protocol version, managed log, operation, source event ID, expected head and payload using Stratum canonical JSON and SHA 256. A head conflict is not an automatic rebase: reevaluate, issue a new command ID with prior_command_id, and retain the same source event identity. Stratum additionally enforces one accepted semantic effect per client, source event and operation; a prior equivalent acceptance returns its original result, while a changed effect requires a new source event. Semantic effect identity excludes expected head, retry metadata and command ID, but includes the normalized operation payload. This prevents a lost acknowledgment followed by a rebased retry from duplicating work.

A snapshot request takes an optional known head digest. A response is either unchanged, a complete snapshot, or an explicit integrity or compatibility failure. The snapshot includes all managed claim entries, their supporting and blocking references and the immutable policy and event cutoff. Do not compose multiple unpinned latest reads. Existing generic projection output alone is insufficient because it omits the complete managed claim and receipt contract.

Both adapters use stable refusal codes: invalid_contract and unsupported_version are terminal until corrected; unauthorized and forbidden never trigger credential escalation; head_conflict requires reevaluation; idempotency_conflict requires operator review; dependency_blocked and evidence_rejected preserve the proposal; unavailable is retryable within the delivery budget. HTTP adapters map malformed input to 400, unauthenticated to 401, denied capability to 403, semantic conflict to 409 and temporary service failure to 503. RPC returns the same typed codes. Error details exclude confidential payloads.

### Evidence and signature admission

In schema 3, a bare reproducible_check is a recipe and cannot validate an empirical claim. Add an executed_check binding containing the recipe, execution receipt, oracle result and authenticated attestation references. The receipt signature covers domain separation string stratum execution receipt 1 plus the canonical receipt, including client, log, claim revision, scope, recipe, artifact manifest, oracle and policy digests. Reusing a receipt for a different claim, scope, log or policy fails.

Implement the relevant ADR 003 authority registry work in Stratum rather than creating a second Checkmate signer list. Registry state is derived from an append only policy stream with an explicitly pinned bootstrap, key identities, capabilities, log and predicate scope, validity epochs, revocations and quorum policy. Registry changes require authority under the preceding policy. A typed signer name or checked_at timestamp is metadata. Checkmate agents receive proposal capability, never verifier or registry administration capability.

Bootstrap identities and thresholds are explicit operational trust assumptions. Record the chosen policy and its digest at provisioning; do not fabricate keys or count one identity twice. A single operator policy must be labeled as such. If the registry is unavailable, a signature cannot be verified, or its policy history cannot be replayed, evidence remains unadjudicated. No full cryptographic assurance is claimed from a service token alone.

Execution and oracle receipts reference preserved private artifacts. The oracle must state the limited predicate it checked and discriminate a relevant negative control. Deterministic reports may use expected output digests; variable logs are retained by actual digest and judged through a stable result schema. Synthetic fixture results may validate only claims explicitly scoped to those fixtures; they cannot promote a real target claim. Premerged source checks remain exploratory until repeated against the retained main revision. Authoritative source checks bind to reachable main revisions or their actual merge commits; immutable third party target artifacts use content identity rather than an invented repository commit.

### Status and dependency projection

Retain Stratum status names and the distinction between authoritative_verified, authoritative_axiomatic, authoritative_provisional and narrative. Invalidation of evidence can leave raw status validated while authority becomes provisional and under_review is true. Checkmate must consume these fields together. It must not rewrite that result to pending_evidence, which is currently an entry status, or display validated alone as sufficient.

Correction commands preserve legal transitions. A validated revision can be superseded while its replacement begins pending evidence. A pending or disputed revision is rejected or disputed as permitted by the existing transition system, then linked to a new pending revision; it must not receive an illegal supersession marker. These related events commit as one command. A historical asserted or ratified record follows its own versioned rules and cannot be silently converted into empirical verification.

Schema 3 adds typed required dependency edges separate from targets and revision lineage. Each edge names a prerequisite revision and its scope digest. Stratum rejects unknown revisions, forward references, self edges, cycles and scope mismatches. Use versioned limits of 32 prerequisites per revision and depth 8 for the first profile. Exceeding a limit returns a visible refusal rather than dropping edges.

Stratum derives blocked_by over the complete required dependency closure at the requested epoch. A required prerequisite that is unverified, under review, contradicted, rejected, superseded or policy invalidated makes checked_use_eligible false for its dependent. This condition is derived in Stratum, not through best effort background invalidation fan out. Replacing a prerequisite requires a new dependent revision or an explicitly reviewed rebind event. A future replacement must not silently inherit the old evidence.

checked_use_eligible is true only for a current validated revision with verified authority, admitted matching receipts, satisfied profile obligations, healthy required dependencies and no unresolved evidence or registry review. It is an assurance field, not a permission to publish or execute. TypeScript and the Python reference must derive the same status, authority, dependency blockers and eligibility for every fixture and epoch.

## 7 Consistency delivery and replay

Checkmate stores source event and outbox intent in the owning AuditCase transaction. Existing blockConcurrencyWhile serialization is not proof of atomic commit; introduce explicit atomic persistence and fault injection tests. Retrying a delivered command changes delivery metadata, not the immutable source event. The hub consumes acknowledged case projection receipts without becoming a second delivery authority.

Stratum serializes managed commands in the owning log Durable Object. Deduplication is checked before expected head comparison and capacity rejection: a retry of a committed operation still returns its acknowledgment after the head advances or the log fills. Same command ID with different canonical payload returns a conflict and a reviewable incident. A batch validates in memory, then persists events, chain links and acknowledgment in one transaction; storage failure discards the speculative cache.

| Failure or race | Required behavior | Owner |
| --- | --- | --- |
| Response lost after remote commit | Lookup or retry returns the original acknowledgment; one event set | Both |
| Local event transaction fails | Neither event nor outbox row survives | Checkmate |
| Remote batch write fails | No partial event set or acknowledgment; cache reloads | Stratum |
| Two commands use the same expected head | One wins; the other receives head conflict and requires reevaluation | Stratum |
| Snapshots arrive out of order | Never regress the cache or overwrite a newer accepted epoch | Checkmate |
| A newer local correction is not yet acknowledged | Mark affected claim and drafts pending reconciliation immediately | Checkmate |
| Stratum unavailable | Capture observations; refuse new verified promotions or approval consumption | Both |
| Old reader encounters new event version | Explicit incompatibility; never reinterpret as old semantics | Stratum |

Dispatch is at least once; semantic operations are idempotent. Use Durable Object alarms with bounded exponential retry and jitter. After ten failed attempts, expose a stalled delivery incident while retaining the command for operator recovery. Do not keep a browser or a short background request alive as the delivery mechanism. Reconciliation compares source IDs, command digests and acknowledged remote events, not just row counts.

A cache can rebuild completely from immutable Stratum events, registry history, artifact manifests and the shared projection implementation. A retained head digest is an integrity checkpoint; it does not by itself prove append extension or prevent tail truncation. Recovery verifies the retained prefix or an equivalent consistency proof. A divergent or shorter log fails closed and requires investigation; it is never silently reseeded.

All migrated events retain original IDs, source chain position, original actor class and the source time as provenance. Stratum assigns current logical sequence at import. The importer identity must not be mistaken for the original observer, and a historical observation time must not be represented as an authenticated original signing time.

## 8 Security privacy and disclosure

Use a named Cloudflare service binding for Checkmate to Stratum managed operations. Do not place a general STRATUM_TOKEN in the browser, MCP configuration or agent context. A distinct verifier submits signed receipts under its own scoped identity. Stratum derives the authenticated client and allowed operation at ingress; caller supplied agent_id, principal headers, authority labels or receipt fields cannot widen permissions.

Reserve managed log writes across every path. Generic event append, seed, import, CLI and administrative convenience routes must reject direct writes to managed logs unless they enter the same authorized command gate. Private read permissions also apply to event detail, export, projection, registry context and diagnostic errors. Provisioning cannot select demo or playground logs. Test neighboring paths and both direct and gateway routes.

Artifacts remain private. Stratum stores opaque references and integrity metadata where possible; public aggregates never include scope manifests, raw receipts, targets, identities, private URLs or undisclosed IDs. A failed secret scan or redaction changes the package and its digest; it does not edit a previously reviewed package in place. Backups include manifests, registry history, operation receipts and required artifact bytes; no report is complete while its sole draft lives in a temporary scratchpad.

### Human authority at the release boundary

Before enabling new publication or metric consumers, close the existing advisory publication path. Advisory creation and lifecycle updates must not make data public merely through state published. Require a human publication event bound to the exact approved fields and their digest. An upstream publication receipt may establish a claim about disclosure state but is not blanket consent to republish additional private data.

Filing and publication authorizations bind the destination, reviewed content digest, claim revision set, provisional qualifications, projection epoch and head, policy digest, expiry and a single use nonce. Immediately before consuming authorization, fetch a current consistent snapshot and compare it to the approved basis. Any head change requires renewed review in the first release. This conservative rule may block on unrelated events; relax it only through a versioned dependency scoped policy with tests.

An agent cannot mark an advisory published, replace a reviewed report body or change destination using an earlier authorization. A human may approve communication of an unresolved concern when the exact uncertainty is included in the reviewed text. That exception changes communication permission only. It does not generate a validated claim or a real bug efficacy result.

External filing cannot be made atomic with a Stratum append. Record an intent and destination idempotency key before the external action, retain the external receipt and reconcile uncertain outcomes before retrying. New evidence after dispatch produces a follow up review task; it cannot retroactively prevent a message already sent. Public projections carry an evidence cutoff and refresh or suppress affected current assertions when reconciliation is pending. Historical published snapshots remain attributable to their original cutoff.

## 9 Operational readiness and acceptance

### Experiment bounds and stopping rules

Checkmate owns the operational state active, paused or completed and a structured stop reason. These states never stand in for Stratum claim status. Each experiment records a falsifier or supporting observation, maximum duration and resource budget, allowed target and input set, stop on control failure, and a resume trigger. The runner enforces those limits and reports actual consumption. A budget exhausted run can stop while its claim remains inconclusive.

A failed negative control, wrong target revision, missing artifact or invalid verifier policy prevents promotion and opens review. A newly interesting branch becomes a linked experiment or case with its own scope and budget. It cannot silently enlarge the parent claim. No real privileged helper invocation is required to satisfy the first integration milestone.

### Required conformance scenarios

| Test | Scenario | Passing result |
| --- | --- | --- |
| A01 | Agent proposes class closed without evidence | Historical proposal preserved; checked use remains false |
| A02 | Draft is first phase with null payload | No completed validation stages or verified badge inferred |
| A03 | Well formed recipe but no execution receipt | Stratum refuses verification; both clients show pending evidence |
| A04 | Receipt forged, replayed or bound to wrong scope | No authority change; precise safe refusal |
| A05 | Evidence invalidation below an eligible claim | Direct and dependent checked use become false at the next epoch |
| A06 | Prerequisite superseded or dependency cycle attempted | Dependent blocked; cycle refused without partial persistence |
| A07 | Concurrent duplicate command and altered replay | One operation; identical acknowledgment or payload conflict |
| A08 | Crash at every local and remote commit boundary | No orphan event, partial batch or lost acknowledged operation |
| A09 | Delayed snapshot follows newer acknowledgment | Cache does not regress; cutoff remains explicit |
| A10 | Stratum offline or a local correction queued | Capture continues; current promotion and approval use stop |
| A11 | Schema 1 and 2 traces replay under new reader | Existing status and authoritative fingerprints unchanged |
| A12 | Agent creates or changes advisory to published | No identifying public output without exact human approval |
| A13 | Alternate append, seed or public log mapping used | Managed policy cannot be bypassed; no data exposure |
| A14 | Same method measurement submitted twice | One stable measurement identity and one current contribution |
| A15 | Supporting claim or verifier policy invalidated | Current efficacy retracts eligibility; historical cutoff retained |
| A16 | Target, input, output or oracle bytes substituted | Digest or predicate check fails; recipe alone cannot pass |
| A17 | Verifier key revoked or wrong predicate capability | New receipt refused; affected prior evidence enters explicit review |
| A18 | Delete caches and restore from retained evidence | Same canonical snapshot digest and review state reproduced |
| A19 | Bounded synthetic correction scenario runs end to end | Case, Stratum, draft and metric agree before and after correction |
| A20 | Human review races with claim or content change | Authorization consumption refused or external uncertainty reconciled |

Efficacy measurements have stable identities over case, experiment, method or skill identity and version, claim revision and outcome category. Repeated transport submissions do not add observations. Current validated counts require checked_use_eligible at the displayed cutoff; candidate observations and process corrections are separate counts. Distinguish an unsupported assurance corrected, an unsupported vulnerability claim corrected, a harness defect found and a confirmed vulnerability. Credit the actual initiating source or reviewer; an agent repair prompted by a human reference is not an independent agent discovery.

### Signals and initial targets

Proposed engineering targets, not measured service promises: under healthy conditions, 95 percent of managed commands acknowledge within 10 seconds; foreground private dossier views refresh within 30 seconds; any verified promotion or authorization consumption requires a current snapshot regardless of cache age. Warn after 60 seconds of pending delivery and raise a stalled incident after ten failed attempts. A digest conflict, forged receipt acceptance, unauthorized publication or projection regression is release blocking.

Track command ID and case ID, pending outbox age, stalled commands, head conflicts, policy and schema incompatibility, receipt rejection reason, artifact resolution failure, blocked claims, draft review tasks and metric eligibility changes. Keep secrets and research payloads out of operational logs. Expose capture coverage separately: optional minimal tool capture is not a completeness guarantee, and dropped or unacknowledged capture must be visible.

Validation gates for implementation include Checkmate typecheck, relevant Worker runtime tests and bundle dry run; Stratum workspace checks, runtime tests, Python reference tests, trace validation, schema fixtures and byte identical cross implementation projection. Add real fault injection and simultaneous process tests where the claim concerns concurrency. Passing existing unit tests alone does not establish the cross service behavior.

## 10 Alternatives and tradeoffs

| Alternative | Useful property | Reason not selected |
| --- | --- | --- |
| Mirror every Checkmate event into generic Stratum append | Fast initial export | Does not close receipt, dependency, actor or retry gaps |
| Embed a fork of Stratum in Checkmate | One service boundary | Creates a second authority implementation and complicates upgrades |
| Maintain current verdicts independently in both stores | Simple local editing | Corrections and outages can produce conflicting truth |
| Treat receipts or human signatures as automatic correctness | Easy promotion rule | Authenticity and execution do not establish an adequate semantic oracle |
| Block every exploratory write on Stratum availability | Immediate remote ordering | Unnecessarily stops research capture; the outbox supports safe continuity |

The selected remote boundary adds versioning, registry and recovery work. The payoff is explicit ownership: Checkmate remains usable for capture while Stratum decides checked support through one replayable contract. A privileged administrator who compromises the registry and both stores can still undermine the system; independent retained checkpoints improve detection but do not remove that trust assumption.

## 11 Deployment inputs and limits

The architecture is sufficiently specified to begin local work. The following are required deployment inputs, not unresolved reasons to postpone contract tests: the approved bootstrap registry policy and operator identities; permitted verifier keys and predicates; private artifact storage and backup destination; and the one initial case selected for canary migration. Obtain and record them through the existing secret safe provisioning workflow. This document does not manufacture key material, retention commitments or a production access decision.

First release limits are explicit: same log required dependencies, 32 prerequisites per revision, depth 8, existing 5000 event log cap unless changed through a tested capacity migration, and human reviewed provisional communication. Reaching a cap refuses new work visibly while existing acknowledgments remain retrievable. Do not rotate into an unlinked log or truncate history to recover capacity.

Do not treat the proposed event schema 3 as already supported. The first implementation milestone must allocate it, freeze its canonical schemas and add reader compatibility tests before any producer emits it. Preserve the existing decision that historical verified status is not retroactively rewritten. No unrelated authority or historical parser proposal is silently adopted through this integration.

## 12 Joint implementation handoff

### Implementation sequence

| Step | Changes in both repositories | Joint exit criterion |
| --- | --- | --- |
| M0 | Contract and baseline. Stratum schemas and fixtures; Checkmate pinned consumer and baseline negative tests | Both repos validate identical fixture digests; no new event version emitted |
| M1 | Durable boundary. Stratum managed namespace, actor gate, atomic commands and snapshots; Checkmate source outbox and monotonic cache | A07 A08 A09 A10 A13 pass across real local Workers |
| M2 | Evidence authority. Stratum registry, schema 3 binding and dependency projection in TypeScript and Python; Checkmate manifests and bounded verifier adapter | A03 A04 A05 A06 A16 A17 pass with negative controls |
| M3 | Research consumers. Checkmate current verdict, stage rendering, drafts, approvals and unique efficacy; Stratum complete managed claim projection | A01 A02 A12 A14 A15 A20 pass through REST and MCP |
| M4 | Migration and recovery. Immutable import and provenance on both sides, shadow comparison, backup restore and rollback compatibility | A11 A18 A19 pass; one case canary and operator release decision |

### Repository work map

Checkmate existing touchpoints: src/agent.ts for proposals and case persistence; src/hub.ts for projection receipts, filings, publication and metrics; src/index.ts and src/mcp.ts for principal aware API parity; src/types.ts for the new records; public/app.js for status and review; hooks/checkmate-tooluse.mjs for acknowledgment and capture health. Proposed new modules include src/stratum-client.ts, src/outbox.ts and a version pinned contract adapter. New tests belong beside the existing ledger, public and security regression suites.

Stratum existing touchpoints: core/src/contract.ts, log.ts, projection.ts and serialize.ts for versioned evidence and dependency semantics; worker/src/do.ts and persist.ts for transactional commands and acknowledgments; worker/src/index.ts and auth.ts for the protected namespace and client gate; reference/tessera_projection.py for the semantics oracle. Add registry, managed client and receipt modules without placing vulnerability specific labels in core. Extend schemas, core and Worker tests, Python reference tests and shared replay fixtures together.

Publish one immutable shared contract fixture bundle from Stratum, identified by digest and source revision, and consume that exact bundle in Checkmate CI. It must contain valid commands and receipts, invalid signatures, replay conflicts, dependency graphs, historical traces and expected projections. Neither repository may change a fixture expectation locally to make its side pass.

### First demonstrable result

Use a private synthetic case with a static observation, an authentication interpretation and a stronger impact claim. Admit only what the fixture and oracle establish. Then invalidate the interpretation evidence. Demonstrate the dependent impact claim entering review in Stratum, the Checkmate dossier showing the blocker, the linked draft requiring review and the current efficacy projection losing its qualifying contribution. Replay the same inputs through TypeScript and Python and restore both caches from durable state. Store the complete run receipt with source revisions and artifact digests.

### Migration rollout and rollback

Inventory historical records and freeze their source heads. Import observations as historical pending evidence with original provenance; do not translate a legacy class closed or real bug label into new verified authority. Preserve old verdicts as reported history. Keep shadow results beside the legacy view until differences have explanations, then switch the canary case to the Stratum derived view. Reconcile metrics from stable measurement identities rather than raw submission counts.

Deploy compatible Stratum readers before Checkmate producers. During canary, keep the existing publication path closed until its independent authority defect is repaired. Record actual deployment revisions and run direct private, anonymous, agent and verifier probes. A successful CI gateway check is not proof of the direct production boundary. Expansion requires all joint gates, a restore exercise and a reviewed migration report; elapsed time alone is not a release criterion.

Rollback disables new authoritative commands and approval consumption while retaining capture and the outbox. Preserve all new events, receipts and artifacts. Stratum may roll back only to a build that understands every persisted event version; otherwise use a forward fix or the last compatible reader. A code rollback does not restore Durable Object data. Do not return the UI to unqualified legacy verdicts, rewrite history or retry uncertain external filings automatically.

### Definition of done

Both repositories pass the same contract suite, the synthetic correction loop works through the real service boundary, legacy traces retain their prior semantics, forged or mismatched evidence cannot promote a claim, and loss or restart of either side does not produce contradictory authority. The handoff includes exact merged revisions, deployed versions when authorized, acceptance receipts, known limitations and a recovery record. A working Checkmate adapter against a mock Stratum server, or a new Stratum API without its Checkmate consumer, is not completion.

### First actions for the next session

Reconfirm repository instructions, dirty state and current main revisions. Read this specification with Stratum MEMORY_MODEL.md and ADR 003, then preserve the current review probes as negative controls. Implement M0 as paired contract changes and fixture tests before modifying either current verdict path. Follow each repository journal and trace conventions, use separate reviewable milestones against main, and preserve unrelated work. The authorization in this chat is to prepare this document; implementation, deployment and external disclosure remain separate actions.

### Source references and verification perimeter

S1 Checkmate source baseline: https://github.com/mazze93/checkmate/tree/36a4ef374b39bbe9d3230fed039dec3932754391. Repository is private. Relevant files are agent.ts, hub.ts, types.ts, mcp.ts, index.ts, chain.ts, public/app.js and hooks/checkmate-tooluse.mjs.

S2 Stratum source baseline: https://github.com/mazze93/stratum/tree/d5a526b3bd57ead2bd0eb9217eef76f72e9276db. Read docs/MEMORY_MODEL.md, docs/ADR-003-trust-primitives.md, core/src/contract.ts, core/src/log.ts, core/src/projection.ts, worker/src/do.ts, worker/src/persist.ts, worker/src/auth.ts and scripts/recheck-bindings.py.

S3 Checkmate review evidence: checkmate-review-evidence-2026-10-16.md and checkmate-review-probes.test.ts in this chat outputs. The pasted DaisyDisk session supplies a workflow example; its static findings and suspected exploit are not independently confirmed by this specification.

This preparation checked source and remote revision metadata and inspected the retained template. It did not modify either repository, execute the proposed integration, inspect current registry deployment, rerun Stratum tests, exercise authenticated production research, or send any disclosure. All new API names, fields, policy rules, thresholds and milestones in this document are specified work unless explicitly described as existing behavior.

## 13 Shared decision extension

Add a Stratum owned TypeScript workspace package named @stratum/decisions, accessible to Stratum and Checkmate through the same pinned release or immutable source artifact. This is new specified work. The package provides shared contracts, runtime schemas and a deterministic evaluation kernel for evidence eligibility and scoring. Checkmate must consume this package rather than maintain a parallel scoring or evidence rule implementation. Stratum core remains independent of research domain labels.

### Package boundary and typed contracts

Publish contracts, kernel and schemas as explicit package exports. Compile a fixed registry of approved extension implementations into the deployment. Each extension has a stable ID, semantic version, content digest, kind, input schema ID, output schema ID and policy compatibility declaration. The first release supports evidence_eligibility and score. A discriminated type map ties each kind to its input and result types; an evidence evaluator cannot be registered as a scoring evaluator. The companion decision-extension.contract.ts is the proposed type surface, not a completed library.

Validate every untrusted JSON input and result at runtime against the versioned schemas. TypeScript brands, readonly fields and compiler checks improve integration but do not authenticate facts. Stratum resolves current policy, admitted receipts, artifact bindings and dependency state itself before authoritative admission. Checkmate server preflight and browser previews use the same evaluator, show their snapshot basis and remain advisory. An agent supplied eligible result or a cached preview cannot grant claim authority.

| Contract | Required content | Consumer rule |
| --- | --- | --- |
| Decision context | Log and event cutoff, normalized facts digest, claim revision, scope, profile and policy digests, kernel and extension identity | Never combine facts from different epochs or policies |
| Evidence result | Eligible, ineligible, needs review or indeterminate; reason codes, obligations, evidence and dependency references | Stratum recomputes and admits; Checkmate renders the acknowledged result |
| Score result | Scored or abstained; dimensions, integer value and scale, unit, method, sample count, denominator and limitations | A score cannot change eligibility, severity, publication permission or evidentiary status |
| Evaluation envelope | Canonical input and result digests, extension artifact digest, policy digest and snapshot basis | Persist the basis with each decision; include it in cache keys and replay fixtures |

### Deterministic evaluation and scoring meaning

The kernel is pure and synchronous. It performs no network access, filesystem access, clock reads, random sampling, dynamic code loading or authority mutation. It receives immutable, already normalized facts and a policy at an explicit cutoff. It uses Stratum canonical encoding, stable ordering and bounded integer arithmetic. Profiles declare finite input and evaluation limits, within the existing event and dependency bounds. Exceeding a limit returns indeterminate without a partial positive result. Node and Worker executions of the same supported input must produce byte identical canonical results. Avoid a digest cycle: the decision context binds event cutoff and normalized core facts digest, excluding derived decisions. Hash the canonical result without its digest or the final snapshot wrapper. Compute the completed projection digest, excluding its own digest and transport wrappers, then attach that acknowledged snapshot to the evaluation envelope. An unadmitted preview has no acknowledged snapshot.

Evidence eligibility preserves the conjunctive gate in section 6: a current validated revision, verified authority, matching admitted receipts, satisfied obligations, healthy required dependencies and no unresolved evidence or registry review. Extensions may add profile obligations but cannot relax that minimum. A numeric score never substitutes for any conjunct, a negative control or an independent verifier. Generic evidence semantics and the corresponding Python reference must remain equivalent.

A scoring profile declares what each dimension measures, its unit, integer scale, explicit method and weights if used, eligible input categories, minimum sample requirement, denominator and treatment of missing values. There is no default confidence percentage, severity model or aggregate weight set. The initial library may return abstained until a reviewed profile exists. Zero is a measured value; absent, insufficient or incompatible evidence returns abstained with a reason. Reject nonfinite numbers, out of range values, denominator zero and unit mismatches. Do not average distinct outcome categories or claim probabilities from a ranking score.

Current efficacy scoring uses the deduplicated measurement identity and the current acknowledged eligibility cutoff. Candidate observations, process corrections and confirmed target findings retain their separate categories. Each scored dimension records contributing references and limitations. Evidence invalidation, prerequisite correction, policy revocation or a changed method makes the old result historical and requires a newly based evaluation. Retain prior inputs, policy artifacts and results for replay rather than editing the earlier score.

### Policy release and joint delivery

Stratum owns the extension allowlist and policy history. Package version and policy version are distinct. Record the canonical extension manifest and artifact digest in the policy stream and pin them in the case snapshot. Reusing an ID and version with different bytes, an unknown extension, unsupported schema, unavailable policy or inconsistent digest refuses authoritative admission and yields an explicit indeterminate preview. Never fall back to a weaker evaluator or fetch arbitrary code named in a claim. Keep prior deterministic evaluators available for historical replay; current eligibility always uses the active policy cutoff.

Extend M0 with the shared package contract, runtime schemas, negative compile tests and one immutable decision fixture bundle consumed by both repositories. M2 implements the evidence kernel and Python parity with registry and dependency admission. M3 wires Checkmate preflight, UI and efficacy scoring; a scoring profile is activated only after its meaning and sample rules are reviewed and fixture tested. An independently passing package build is insufficient: both consumers must run the same artifact and fixtures, with policy mismatch and correction behavior demonstrated across the real boundary.

### Additional acceptance scenarios

| Test | Scenario | Passing result |
| --- | --- | --- |
| A21 | Wrong extension kind, input or result type and malformed JSON | Negative compile fixtures fail as intended; runtime boundaries reject invalid shapes |
| A22 | Identical decision inputs in both clients and Python reference | Same pinned artifact and canonical result; evidence and scoring fixture parity |
| A23 | High score or caller supplied eligible preview without admission | No claim promotion, efficacy qualification or publication authorization |
| A24 | Node and Worker replay, excessive inputs or impure extension | Deterministic bounded results; unsupported behavior fails the release gate |
| A25 | Unknown policy, version or same version with changed extension bytes | No permissive fallback; old results remain replayable and current use stops |
| A26 | Insufficient samples, missing values, invalid units or numeric range | Abstention or precise refusal; zero remains distinct from missing |
| A27 | Experiment exceeds budget or negative control fails | Runner stops and retains consumption and stop evidence; no promotion |
| A28 | Artifact unavailable or retained log has a shorter or divergent tail | Recovery refuses success; private evidence and consistency obligations remain open |

