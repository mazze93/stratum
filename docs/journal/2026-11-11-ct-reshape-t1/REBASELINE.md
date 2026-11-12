# ct-reshape re-baseline and T1 checkpoint

Last updated: 2026-11-11. Inputs: the 2026-10-21 decision-council report on
the cognitive-topology reshape, and the spec as published in
`mazze93/mazze-leczzare-blog` at `8e1a2e3`
(`public/cognitive-topology/reshape/cognitive-topology-reshape.spec.md`,
spec version 0.6.0). Stratum source read at `fe353a6`.

The spec lives in the blog repo, which this session could only read, so the
re-baseline is recorded here instead of edited into the spec. Port it across
when the spec is next revised.

## Which spec the council read

The council worked from the 0.3.0 draft. The published spec is 0.6.0, and two
of the council's five re-baseline items are already fixed there:

| Council item | In 0.6.0 | Action |
|---|---|---|
| Drop the phantom T6 | Already gone; no T6 anywhere | none |
| Fix "five tiers" | Already says "Four authority tiers" (§4), matching `core/src/contract.ts:26-35` | none |
| Replace `packages/*` | Still there: §12 handoff lists `packages/worker + packages/core` | Read as `worker/`, `core/`, `cli/`, `reference/`, `atrium/public` |
| Split T3 out | Still there: T3 reduces the `memory` skill toward ContextSynapse | Held. T3 is a different integration, not ingress |
| State status honestly | Contradictory; see below | Needs Mazze |

## Status: the spec disagrees with itself

- The spec header (lines 4-5) says: Draft, "awaits ratification of its content
  before execution. Never yet posted to the ledger."
- The blog's `CHANGELOG.md` (line 39) says 0.6.0 was **ratified 2026-09-06**.
- The blog's `cognitive-topology-trace.jsonl` holds `ct-001`, a `ratification`
  by `mazze` quoting "Ratified. Genesis." from 2026-09-06.

Both cannot be true. Until Mazze says which is, T1 is built against the
Stratum source, not against the spec's claims, and T2 to T5 stay held.

## Where 0.6.0 §5 is wrong against source

§5 is headed "CONFIRMED from source". Four statements in it are not:

1. **`birth_status`** is described as "originating/invalidation only". It is
   required on every record (`core/src/serialize.ts:223-225`). Markers
   conventionally carry `asserted`.
2. **Evidence `kind`** is given as an enum
   (`test_exit|diff_sha|file_hash|signed_approval|policy_authority`). There is
   no enum on the wire (`serialize.ts:192-193`); the blog trace's own `ct-012`
   already uses kinds outside it.
3. **`schema_version`** is "the one fill-in", set to 1. It is per event and may
   be 1 or 2 (`contract.ts:118`). Under v2, `checked_at` counts for nothing and
   only a `reproducible_check` binding makes evidence checked
   (`contract.ts:134-155`). Automated verifications should be v2.
4. **Idempotency.** "dup id → 409" is true, but every guard refusal is also 409
   (`worker/src/index.ts:23-24`, `core/src/log.ts:49-51`), so a retry cannot
   tell "already landed" from "refused" by status alone. The client has to
   read the event back.

Also: T1's file target `plugins/topology-core/lib/stratum.<ext>` has no home.
The plugin source is in no GitHub repo (its CHANGELOG puts it at
`~/code/cognitive-topology`, local). T1 shipped upstream instead; see ig-002.

### ct-012 would launder a typed timestamp

The blog trace's `ct-012` is a v1 `verification` whose evidence is two
`file_hash` entries with `ref: "…@main"` and a typed `checked_at`. No digest,
no commit. Posted as is, it would fold `ct-011` to `authoritative_verified` on
a timestamp a model typed, which is exactly what the council's Skeptic named
as the failure. Rewrite it as a v2 verification with a binding before it is
posted (`stratum verify ct-011 --run "<check>"`).

## The council's envelope table against source

| Row | Council said | Source says |
|---|---|---|
| Path | probably `/api/logs/{logId}/events` | **Confirmed.** `worker/src/index.ts:91-101` |
| Auth | Bearer, header name undocumented | **Confirmed.** `Authorization: Bearer <token>`, digest compare, one token for every write and private read (`worker/src/auth.ts:15-36`) |
| Enum | ten names, wire spelling unseen | **Confirmed**, snake_case (`core/src/contract.ts:59-75`) |
| Body keys | unseen | `id, type, agent_id, schema_version, birth_status, claim, evidence, targets, is_trust_root`, optional `timestamp`. `birth_status` on every event. Unknown keys dropped, not refused (`serialize.ts:209-261`) |
| Versioning | per event or per log unknown | **Per event**, 1 or 2; above 2 refused (tp-002 holds) |
| Errors | 409, 400, 401 | Confirmed, plus 413 at 5000 events, 404 on an unknown event, 500 `load_failure`. **409 is ambiguous** (see above) |

The full reference is `docs/API.md`.

## What T1 delivered

- `docs/API.md`: the upstream HTTP reference, every line cited.
- `cli/lib/ingress.mjs` and `stratum emit`: one zero-dependency ingress module.
  Recorded as ig-000 to ig-004 in `data/ingress-trace.jsonl`.
- No worker or core change. The council's Scope Auditor condition did not trip.

Council conditions, each with the test that pins it (`cli/test/ingress.test.ts`):

| Condition | How it holds |
|---|---|
| `checked_at` only from deterministic code | A caller cannot supply evidence, `checked_at`, `binding` or `signer`. Verifications run the check in-process and bind the observed exit at HEAD (v2). A failing exit records nothing. |
| Ratification only on a human gesture | Needs an interactive terminal and the event id typed back; otherwise exit 4 and the command to run |
| Prose only in `claim` | `narrative` is the only free text accepted |
| Fabricated exit code cannot produce checked evidence | `exit_code` is an unknown field; `exit 1` with `expect_exit 0` is "check failed … nothing recorded" |
| Masking before canonicalization (secure-pride) | Masked names never reach the outbox, terminal, id or wire; a binding holding one is refused |
| Unset config | No-op with the notice; `--required` exits 3 |
| Configured but unreachable | Queued in the outbox; "N event(s) unrecorded" shown until `stratum outbox --flush` drains it |
| T2 to T5 | Held |
| Narrower token | ig-004, proposed, awaiting Mazze; no code |

Seven mutants of the module were each caught by the suite.

## Open, for Mazze

1. Is ct-reshape 0.6.0 Draft or ratified?
2. Where does the cognitive-topology plugin source live, and should it go on
   GitHub so T2 can repoint it at `stratum emit`?
3. ig-004: ratify or drop the narrower write-only token.
4. A `temenos` log already exists in production (tp-021's shadow lists it with
   `demo`, `workspace` and `macos-vuln-pipeline`), so cognitive-topology is
   likely not the first ingress client. The council listed that as something that
   would change its call. It does not change T1, which serves every client, but
   it reorders the case for T2 against R5 (Temenos to v2).
