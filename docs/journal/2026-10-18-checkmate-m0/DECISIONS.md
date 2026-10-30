# DECISIONS — Checkmate × Stratum joint M0

Append-only. `date · decision · why · how to reverse`.

---

**2026-10-18 · Load-bearing assumption: the work does not already exist, and the
baselines are where the spec says.** Checked: Stratum `main` = `d5a526b`, equal
to the spec's pinned baseline; no `schemas/event.v3*`, `managed-client*`,
`fixtures/` or `decisions/` exist; ADR-003 phases 1–2 merged, phase 3
(registry/signing) not built — matches spec §3. Checkmate `main` = `753bfaa`,
28 commits past the spec's `36a4ef3`: publication authority (A12) already
closed and deployed (`931adb65`); probes still reproduce A01, A02, A14.
· Why: session-journal Phase 0. · Reverse: n/a (a check).

**2026-10-18 · Authoritative spec = bundle v1.1, not the inbox v1 docx.** The
inbox `…Specification.docx` (530k) lacks the handoff XML part and fails the
validator; the `stratum-checkmate/` copy (622k) is v1.1 (adds §13
`@stratum/decisions`) and passes. · Why: the validator and the contract digest
bind v1.1. · Reverse: n/a.

**2026-10-18 · Distribution = vendored `npm pack` tarball in Checkmate,
pinned by sha256 + Stratum revision; CI verifies the digest.** mazze chose it
over GitHub Packages / a source copy. · Why: Stratum is a private monorepo and
npm cannot install a git subdirectory; a tarball needs no registry token in
either CI. · Reverse: publish to npm.pkg.github.com and swap the dependency
spec; digests stay the identity.

**2026-10-18 · Trace events are authored as `agent_id: claude`, never as mazze.**
`tp-000` was written as a ratified mazze event; this burst will not mint human
authority on mazze's behalf — that is the defect class the spec exists to
remove. · Why: I5/R40. · Reverse: mazze may append a ratification event.

**2026-10-30 · Resume check (Phase 0 of a new session): the 2026-10-18 plan and
WIP still apply; one state record is stale.** Checked: this branch merges clean
onto Stratum `main` `8e7e854`, which is one commit past the `d5a526b` baseline
(the AGENTS.md pointer, #93). The WIP commit `97b80e6` adds only
`core/src/managed.ts` and `reference/managed.py`, marked unverified, while
`handoff-state.json` still says WP01 `not_started`. Checkmate `main` moved too:
PR #13 (`0e452cf`) shipped `src/stratum.ts`, a read-only adapter on the shared
bearer, which C1/C2's planned `src/stratum-client.ts` must reconcile with, not
duplicate. That touches the C phases, not S1. Authorization: mazze's 2026-10-18
"Go: all of M0", plus "begin the work" (2026-10-30); this resume waits for go.
· Why: session-journal Phase 0. · Reverse: n/a (a check).

**2026-10-30 · S1a: the Python oracle generates the managed fixture bundle; both
sides reproduce it.** `scripts/render-managed-fixtures.py` renders
`fixtures/managed-client-v1/` (13 valid commands, 32 refusals, 3 reader cases)
from `reference/managed.py`. Every case also names the code its author expects,
and rendering aborts if the oracle disagrees. `manifest.json` pins each file by
SHA-256 and gives a bundle digest over the canonical `{bundle, files}`
(`b862c042…`). Negative control: corrupting one expected digest and one code in
a copy failed 3 TS tests and the Python staleness check; restored, all green.
· Why: R09/R31, same pattern as `data/canonical.golden.json`. · Reverse: delete
the bundle and its two tests; nothing consumes it yet.

**2026-10-30 · C04's `source_event_id` rides on the command envelope (C01), not
inside the claim-revision payload.** The WIP payload omits it and the spec
lists it on both records. The command already binds it into the command and
effect digests, so a second copy in the payload could only disagree. The
schema-3 event record will carry it when M1 writes events. · Why: one source of
truth per field. · Reverse: add it to `PAYLOAD_KEYS.register_claim` and require
it to equal the envelope's value; digests change, so a new bundle.

**2026-10-30 · The receipt-signing separator is a single `\n` after
`stratum execution receipt 1`.** The spec names the domain string but not the
join. The WIP chose a newline (SSHSIG-style framing), and the test pins the exact
bytes on both sides. · Reverse: change both implementations and the pinned bytes
before any verifier signs (M2).

**2026-10-30 · S1b: schema field names allocated here; NEEDS MAZZE REVIEW before
any producer emits them.** The spec names what each record holds but not its
field names or enums. These were chosen in this burst, are pinned by
`core/test/managed-schema.test.ts`, and change only with a new bundle digest.
- `execution_receipt` (C05): `receipt_id, client_id, log_id, revision_id,
  scope_digest, recipe_sha256, manifest_sha256, environment_sha256, inputs[],
  outputs[], exit_code (null if not completed), resources{wall_ms,
  max_rss_bytes}, outcome, verifier_key_id, policy_digest, oracle_sha256`.
  `outcome` ∈ completed / timed_out / unavailable / skipped is the EXECUTION
  outcome only, per §5 step 4 ("unavailable, timed out, skipped and
  inconclusive remain distinct"). Inconclusive is an oracle result, not a run outcome.
- `oracle_result` (C05): `oracle_version, oracle_sha256, predicate,
  controls[≥1]{id, kind: negative|positive, expected, observed}, result:
  supported|unsupported|inconclusive, limitations[]`. At least one control is
  required because a passing exit code is not a supported predicate.
- `acknowledgment` (C03) and `refusal` follow the spec's field lists verbatim.
- event v3: v2 + top-level `requires[]` (typed edges, ≤32, separate from
  `targets`) + optional `revision{claim_id, scope_digest, obligations,
  source_event_id}` (C04; the event id is the revision id) + an `executed_check`
  binding `{recipe: reproducible_check, receipt_sha256, oracle_sha256,
  attestation: signed_attestation}`. A v3 `verification` must contain an
  `executed_check`: that is the structural form of "a bare reproducible_check is
  a recipe" (§6, WP01 exit criterion).
- Not decided here: dependency-depth enforcement (needs the log, M2), the
  research profile's obligation catalogue (fixture obligations are placeholders),
  and how `attestation` is verified (registry, M2).
· Why: WP01 must freeze these before M1 wires either client. · Reverse: edit
the schemas and fixtures; nothing reads or emits v3, so no stored data depends
on them.
