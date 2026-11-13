# Stratum HTTP API

The wire contract every ingress client writes against. Each statement below cites
the source line that makes it true, read at `fe353a6` (main, 2026-11-06). When the
source and this page disagree, the source wins and this page is the bug.

The Worker (`worker/src/index.ts`) is a thin Hono adapter. Correctness lives in one
Durable Object per log (`worker/src/do.ts`), which runs every contract guard in
`core/` before anything persists.

## Base and log ids

- Every log route is `/api/logs/{logId}/…`. The id is in the **path**
  (`worker/src/index.ts:52-60`).
- A log id matches `^[a-z0-9][a-z0-9-]{0,63}$` (`worker/src/auth.ts:9`). Anything
  else is `400 {"error":"invalid log id"}` before auth runs (`worker/src/index.ts:54`).

## Auth

- Header: `Authorization: Bearer <token>`, exact prefix `Bearer ` with one space
  (`worker/src/auth.ts:16-18`). The token is the Worker secret `STRATUM_TOKEN`
  (`worker/src/env.ts:7-8`). There is one token; it gates every private read and
  every write. A narrower, per-writer token does not exist yet.
- Comparison is digest-to-digest, so it leaks no timing signal
  (`worker/src/auth.ts:19-29`).
- Visibility (`worker/src/auth.ts:1-7, 32-36`):

| Log | Read | Write |
|---|---|---|
| `demo` | public | token |
| `playground-*` | public | public (capped) |
| anything else | token | token |

- Any non-GET request counts as a write (`worker/src/index.ts:56`). A refused
  check is `401 {"error":"unauthorized"}` (`worker/src/index.ts:58`).

## Endpoints

| Method and path | Returns | Source |
|---|---|---|
| `GET /api/health` | `{"ok":true,"service":"stratum","version":"0.4.0"}` | `index.ts:26-28` |
| `POST /api/playground` | `201 {"log":"playground-xxxxxxxx","events":N}`; unauthenticated callers are rate-gated (5 per IP per hour, 200 per day) and get `429` with `Retry-After` | `index.ts:34-50`, `gate-policy.ts:7-8` |
| `GET /api/logs/{logId}/projection[?epoch=N]` | the Tessera projection; `N` is an integer `>= -1`, omitted means head; a bad `N` is `400` | `index.ts:62-72` |
| `GET /api/logs/{logId}/events` | every event record, in append order | `index.ts:74-76` |
| `GET /api/logs/{logId}/events/{eventId}` | `{record, status, authority, under_review, evidence_refs, revision_chain}`, or `404 {"error":"unknown event"}` | `index.ts:83-89`, `do.ts:43-50, 148-160` |
| `GET /api/logs/{logId}/head` | `{events, head, head_digest}`, the content address of the log at its head (tp-009) | `index.ts:78-81`, `do.ts:182-186` |
| `POST /api/logs/{logId}/events` | append one event; see below | `index.ts:91-101` |
| `POST /api/logs/{logId}/seed` | seed an **empty** log from an array of records; always needs the token, even on a playground; `201` seeded, `200` already non-empty (no change) | `index.ts:103-119`, `do.ts:162-180` |

## Appending an event

```
POST /api/logs/{logId}/events
Authorization: Bearer <token>
Content-Type: application/json

<one event record>
```

### Responses

| Status | Body | When | Source |
|---|---|---|---|
| `201` | `{ok:true, event, seq, head, head_digest}` | appended | `index.ts:100`, `do.ts:120-128` |
| `400` | `{error}` | body is not JSON, or the record fails to parse | `index.ts:93-97`, `do.ts:132` |
| `401` | `{error:"unauthorized"}` | token missing or wrong for this log | `index.ts:58` |
| `409` | `{error}` | a contract guard refused it, **including a duplicate id** | `do.ts:133-135`, `core/src/log.ts:49-51` |
| `413` | `{error}` | the log is at its 5000-event cap | `do.ts:33, 117-119`, `index.ts:23-24` |
| `500` | `{error, kind:"load_failure"}` | the stored log itself fails the contract on load; the message says why | `errors.ts:13-23`, `index.ts:123` |
| `500` | `{error:"internal error", kind:"internal"}` | anything else | `errors.ts:20-22` |

`409` covers both a duplicate id and every other guard refusal. A client that
retries an append and gets `409` cannot tell from the status alone whether its
first attempt landed. Read `GET …/events/{id}` and compare the stored record
with the one you sent: equal means it already landed; different, or `404`,
means a real refusal.

### The record

Snake case, parsed by `recordToEvent` (`core/src/serialize.ts:209-261`). The
Python oracle (`reference/tessera_projection.py`) defines the semantics; the
TypeScript port must match it byte for byte on the golden trace.

| Key | Required | Type and rule | Source |
|---|---|---|---|
| `id` | yes | non-empty string, unique in the log | `serialize.ts:214-216`, `log.ts:49-51` |
| `type` | yes | one of the ten types below | `serialize.ts:217`, `log.ts:52-54` |
| `agent_id` | yes | string (who wrote it) | `serialize.ts:218` |
| `schema_version` | yes | `1` or `2`, **per event**; anything else is refused | `contract.ts:118`, `serialize.ts:219-222` |
| `birth_status` | yes, **on every event** | one of the eight statuses; markers conventionally use `asserted` | `serialize.ts:223-225` |
| `claim` | no (defaults to `{}`) | an object; prose goes in `claim.narrative`; never authoritative | `serialize.ts:226-229` |
| `evidence` | yes | an array (may be empty) of evidence entries | `serialize.ts:232-233` |
| `targets` | yes | an array of event ids (strings) | `serialize.ts:234-237` |
| `is_trust_root` | yes | boolean | `serialize.ts:238-240` |
| `timestamp` | no | string or null; metadata, ignored by every projection path | `serialize.ts:241-244` |

Unknown top-level keys and unknown evidence keys are dropped, not refused. Only
a `binding` object is parsed strictly (`serialize.ts:111-115, 117-187`).

**Types** (`contract.ts:59-75`): originating `decision`, `foreclosure`;
evidence-scoped `invalidation`; markers `verification`, `supersession`,
`contradiction`, `ratification`, `rejection`, `dispute`, `trust_root_revoked`.

**Statuses** (`contract.ts:14-23`): `asserted`, `pending_evidence`, `validated`,
`contradicted`, `superseded`, `ratified`, `disputed`, `rejected`.

### Evidence entries

```json
{ "kind": "test_exit", "ref": "npm test", "checked_at": null, "signer": null, "binding": { … } }
```

- `kind` and `ref` are any strings; there is no kind enum on the wire
  (`serialize.ts:192-193`).
- `checked_at` and `signer` are string or null (`serialize.ts:194-201`).
- `binding` is allowed only when `schema_version` is 2 (`serialize.ts:202-205`).

### What counts as checked: v1 against v2

This is the line that decides whether a client strengthens the contract or
launders prose into the verified tier.

- **v1:** evidence counts when `checked_at` is not null (`contract.ts:146`). That
  is a typed timestamp. The server enforces that one is present, never that a
  check happened (tp-007 forecloses guards re-running checks).
- **v2:** `checked_at` and `signer` are metadata (`contract.ts:134-141`). Evidence
  counts only when it carries a well-formed `reproducible_check` binding
  (`contract.ts:148-155`): the command, the full git commit it ran against, the
  expected exit code, and optional input and output digests
  (`serialize.ts:122-169`). A `signed_attestation` parses but does not count until
  the authority registry exists.

A binding is still the writer's statement, but it is a re-checkable one:
`scripts/recheck-bindings.py` re-runs it at the pinned commit. Write
verifications as v2 with a binding. `stratum verify <id> --run "<cmd>"` does
exactly that (`cli/bin/stratum.mjs:187-228, 292-313`).

### Guards (409)

Run at the one door, in `core/src/log.ts`:

- **Originating** (`decision`, `foreclosure`; `log.ts:70-93`): birth status is
  `asserted`, `pending_evidence` or `ratified`; `ratified` needs
  `is_trust_root: true`; a v2 `ratified` birth is refused until the authority
  registry exists; at most one target.
- **Invalidation** (`log.ts:95-102`): birth `asserted` or `pending_evidence`;
  exactly one target, which names an evidence ref.
- **Markers** (`log.ts:104-157`): exactly one target; the transition from the
  target's current status must be legal (`contract.ts:43-52`):

| From | To |
|---|---|
| `asserted` | `ratified`, `disputed` |
| `pending_evidence` | `validated`, `rejected`, `disputed` |
| `validated` | `contradicted`, `superseded` |
| `contradicted` | `ratified` |
| `ratified` | `contradicted` |
| `disputed` | `validated`, `rejected` |
| `superseded`, `rejected` | (terminal) |

- **I1** (`log.ts:114-127`): a transition to `validated` needs checked evidence
  on the verification itself (v1), or bound evidence (v2).
- **v2 authority acts** (`log.ts:128-134`): a v2 `ratification` or
  `trust_root_revoked` is refused until the registry exists. Ratify with v1.
- **Quorum** (`log.ts:135-151`): `ratified → contradicted` only through
  `trust_root_revoked`, carrying at least two distinct checked `policy_authority`
  signers.
- **Chain depth** (`log.ts:152-156`): supersession or contradiction is refused past
  depth 8.

So a fact you want verified must be born `pending_evidence`. Nothing reaches
`validated` from `asserted`.

## Reading back: the projection

`GET …/projection` returns (`core/src/projection.ts:21-48`):

```
{ epoch,
  authoritative: { recent_decisions: [{id, authority, status, revision_chain, narrative}],
                   foreclosed_options: [{id, authority, status, active, narrative}] },
  narrative_only: { current_goal, next_action, warnings } }
```

Authority (`projection.ts:50-57`): `authoritative_provisional` while under review
or pending; `authoritative_axiomatic` when ratified; `authoritative_verified` when
validated; `narrative` otherwise. The projection has no slot for `hard_stops` or
`open_questions`.

## Client rules that follow from the source

1. Use a deterministic `id`, so a retry re-sends the same id and can never create
   a second event. Resolve a `409` on retry by reading the event back.
2. Never send prose anywhere but `claim.narrative`.
3. Never type a v1 `checked_at`. Verify with a v2 `reproducible_check` binding
   produced by the code that ran the check.
4. Ratify with v1 and only on a human's own act.
5. Never send a bearer token over plain http (the CLI refuses it,
   `cli/bin/stratum.mjs:100-109`).
6. Never probe a production log with writes; use a `playground-*` log.

The ingress module that implements these rules is `cli/lib/ingress.mjs`, reached
from the shell as `stratum emit`.
