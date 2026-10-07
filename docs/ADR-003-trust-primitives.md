# ADR-003 — Bound evidence, an authority registry, atomic persistence

**Status:** Proposed — phased; one phase per PR (see §6)
**Date:** 2026-10-06
**Relates to:** `MEMORY_MODEL.md` §1, §5, §7, §10 (rev 3 → rev 4 as phases land); `TRUST.md` §1
**Trace:** `data/trust-trace.jsonl` (`tp-*`) — this ADR's decisions, recorded as they are made

## 1. Context — what rev 3 actually trusts

Rev 3 says "only checked evidence counts, everywhere." The code checks whether
`checked_at` is a non-null string, and the quorum check counts distinct `signer`
strings. Both are **assertions by the writer**:

- `checked_at` is a timestamp the author typed. No re-runnable recipe and no
  digest connects it to the check it names. "I checked it at 17:27" and
  "I didn't check it" look the same apart from one string.
- `signer` is a name, not a signature. Two `policy_authority` entries with
  different `signer` strings satisfy QUORUM, even if one process typed both.
- MEMORY_MODEL §7 already names an **authority registry** as the answer, and
  §10 says to build it on the same `EpisodicLog`. It was never built. Quorum
  today checks only that the signer strings are distinct, not that they map to
  real keys.

Separately, `StratumLogDO.appendEvent` updates the in-memory log *before* the
SQL insert. If the insert throws, the cache and the store disagree until the
DO is evicted. `seedIfEmpty` runs its inserts in a loop with no explicit
transaction.

So the contract's apex rule ("cited ≠ checked") is enforced against a field
that cannot tell the two apart. This ADR closes that gap as far as a pure,
synchronous guard can, and states the remaining perimeter.

## 2. Decision A — atomic persistence (Worker)

- Every DO write runs inside `ctx.storage.transactionSync()`. A thrown callback
  rolls back, and Cloudflare documents this for SQLite-backed DOs. Implicit
  write coalescing makes a run of writes atomic only when nothing throws partway.
  A caught exception mid-loop would still commit the rows before it.
- Memory changes only after storage commits. If the transaction throws, the
  cache is dropped (`this.log = null`) and the next call rebuilds it from
  storage through `loadLog`, which re-runs every guard. Storage is the truth.
  The cache can never be ahead of it.
- Atomic seed: all rows go in one transaction, or none do.
- The persistence step moves into a storage-agnostic function so a fault-injecting
  fake store can test it without workerd (the same pattern as `gate-policy.ts`).

**Scope:** "persistence" means the Worker. The `data/*.jsonl` traces are
written by hand or by script, reviewed in PRs, and validated in CI. Making
their writers atomic belongs to those scripts, not to this contract.

## 3. Decision B — evidence binds to a reproducible check or a signed attestation (schema_version 2)

A v2 evidence entry carries a structured `binding`. `checked_at` and `signer`
remain but become **metadata**: no v2 guard reads them.

```jsonc
// re-runnable: anyone with the repo can repeat this and compare
{"kind": "test_exit", "ref": "npm test",
 "binding": {"type": "reproducible_check",
             "command": "npm test", "repo": "github.com/mazze93/stratum",
             "commit": "<40-hex git SHA>", "expect_exit": 0,
             "inputs": [{"id": "trace", "sha256": "<64-hex>"}],   // optional
             "output_sha256": "<64-hex>"}}                       // optional

// signed: an artifact digest signed by a registered authority key (§4)
{"kind": "artifact", "ref": "dist/stratum.mjs",
 "binding": {"type": "signed_attestation",
             "subject_sha256": "<64-hex>", "predicate": "built-from:<commit>",
             "key_id": "<registry key id>", "signature": "<base64 ed25519>"}}
```

`inputs` deliberately follows the shape of Temenos's provenance envelope
(`inputs[].{id, sha256}`), so a Temenos verdict can carry its gate run as a
reproducible check without translation. `output_sha256`, when present, must
be a digest of **deterministic** output, such as a JSON report or a file
artifact. A digest of raw test output is useless because runners print
timings. When it is absent, the exit code is the pinned result.

**v2 I1:** a v2 `verification` reaches `validated` only if it carries at least
one evidence entry with a **well-formed** binding. An attestation binding counts
only if its `key_id` belongs to a registry member live at `head` and the
signature verifies over the canonical attestation payload (§5).

**What the guard does not do, stated plainly:** it does not re-run commands.
Guards are pure and synchronous, and projection must stay a function of the
log. A reproducible-check binding makes evidence *re-checkable*: the recipe and
the expected digest are pinned, so a lie can be falsified by anyone who runs it.
Re-running is a separate, optional actor whose result is itself evidence. This
is the §Perimeter narrowing that is actually possible. It moves trust from
"the author says they checked" to "anyone can check, and the answer is pinned."

**Versioning:** `schema_version` 1 events keep the v1 guards byte-for-byte, so
all four existing traces still load. `schema_version > 2` is a `ParseError`
(fail-closed on unknown versions).

## 4. Decision C — a real authority registry, built on the same log

Per MEMORY_MODEL §10, the registry is **not special-cased**. It is a fold over
ordinary events:

- A v2 trust-root event (`is_trust_root: true`, birth `ratified`) may carry a
  top-level `authorities` block, a list of `{key_id, algorithm: "ed25519",
  public_key}`. It is top-level, never in `claim`: keys are not prose.
- **Membership at an epoch** = the authorities of every authority-bearing
  trust root whose status at that epoch is `ratified`. Revocation is the
  existing `trust_root_revoked` marker. No new status and no new edge.
- **Genesis (the named axiom):** the first authority-bearing trust root in a
  log is unsigned and must list at least `QUORUM` authorities. That is the
  out-of-band root §7 describes, now a concrete, inspectable event.
- **Every later grant** must carry `signatures` from at least `QUORUM`
  distinct live members over the event's canonical payload (§5).
- **v2 `trust_root_revoked`:** quorum counts distinct live member `key_id`s
  whose signatures verify. This replaces "distinct signer strings with
  `checked_at`."
- **v2 `ratification`** requires at least one live member signature. Today
  anyone can ratify anything. That is a hole in its own right, and this closes
  it for v2.
- Rotating one key out of a multi-key grant takes two steps: grant the
  survivors, then revoke the old grant. Both need quorum, the same ceremony
  as a CA root.
- **A registry with fewer than `QUORUM` live members is bricked by design.**
  It fails closed. Recovery happens out of band (a new log with a new genesis),
  and that is part of the named axiom.

The §7 perimeter stays: distinct *keys* still are not distinct *people*. The
registry proves that signatures came from registered keys. Whether those keys
are held by different people who have not been compromised remains the axiom.

## 5. Decision D — one canonical byte form for signing

Both implementations must produce byte-identical payloads. The form is
**RFC 8785 (JCS)**: object keys sorted by UTF-16 code unit, no whitespace,
ES2015 number serialization, and minimal string escaping. The signed payload
is the event record with `signatures` and `seq` removed. A new golden fixture
pins the canonical bytes, and both implementations are tested against it,
exactly like the projection golden. The attestation payload is the JCS form
of `{predicate, ref, subject_sha256}`.

**Signature scheme:** Ed25519 (RFC 8032), carried in **SSHSIG** form
(OpenSSH `PROTOCOL.sshsig`) with namespace `stratum`. Registry keys may be
`ssh-ed25519` or `sk-ssh-ed25519@openssh.com`. That second type means a
hardware key (YubiKey) can be a registry authority, and its signature proves
a physical touch. That is the property claude-stamp's gated installer relies
on, and an authority that is a person touching a device is the only honest
answer to §4's "distinct keys are not distinct people." The namespace
blocks cross-protocol replay: a git commit signature can't be presented as
a registry signature, or the reverse. Verification is pure computation. For
`sk-` keys the signed bytes are `sha256(application) ‖ flags ‖ counter ‖
sha256(message)`, the guard requires the user-presence flag, and `ssh-keygen`
is never executed. The Python oracle carries a
self-contained RFC 8032 verifier written against stdlib `hashlib`. The oracle
is an executable spec, and CI runs bare `python3`, so it gets no pip step.
The TS side uses whatever *synchronous* Ed25519 verify works in Node and
workerd alike. That choice is decided in phase 3 against a real workerd run,
and if it brings a dependency into `core/`, it gets its own trace event
(a supply-chain decision in a MAX repo).

## 6. Phases

| Phase | Scope | Changes how existing traces project? |
|---|---|---|
| 1 | Atomic DO persistence + fault-injection test | No |
| 1b | Hash-chained persistence + exposed head digest (§8) | No (adds a field to `stats`) |
| 2 | v2 evidence binding: types, wire format, guards in both implementations, version gate, `schemas/event.v2.schema.json` | No (v1 untouched) |
| 3 | JCS + SSHSIG/Ed25519 (incl. `sk-`) in both implementations, canonical golden, authority registry guards | No (v1 untouched) |
| 4 | **Projection of legacy evidence** (§7) | **Yes. Waits on mazze.** |
| 5 | MEMORY_MODEL rev 4, TRUST.md, this trace's verification events using v2 bindings | — |

## 7. Open — how v1 `validated` events project (needs mazze)

All existing `authoritative_verified` decisions earned that tier on
`checked_at` alone, which is the primitive this ADR calls insufficient.
There are three options:

1. **Grandfather.** Tier unchanged. Contradicts the directive: the history
   would keep presenting typed timestamps as verified.
2. **Recommended: demote, visibly, with a way back.** Status stays `validated`.
   The fold and the history do not change. The authority tier becomes
   `authoritative_verified` only if some verification marker on the event
   carries **bound** evidence. Otherwise it is `authoritative_provisional`,
   and each projected entry gains `binding: "unbound" | "reproducible_check"
   | "signed_attestation"`. The way back is a re-verification edge
   (`validated → validated`, v2 `verification` with bound evidence only), so
   a legacy decision can be re-bound without rewriting history. This follows
   the precedent of the axiomatic/verified split: when trust kinds differ, show
   the difference rather than collapse it.
3. **New tier** (`authoritative_declared`). Honest, but a fifth tier spreads
   into the landing figure, the Atrium legend, and every reader's mental
   model, for a state that option 2 already expresses.

Both 2 and 3 change `data/genesis-projection.golden.json`. That gets
regenerated deliberately, with this section cited in the commit.

## 8. Inspiration: claude-stamp and Temenos

Two sibling repos already solve parts of this. Borrowed, with credit:

**From claude-stamp (`mazze93/claude-stamp`):**

- **A hash chain over persisted rows.** Each stamp row hashes
  `prev + canonical JSON` from a 64-zero genesis, so an edit, a reorder, or a
  deletion from the middle breaks the chain from that row on. Stratum's guards
  catch an *incoherent* log on load; a coherent but *edited or swapped* log
  passes them. **Limit:** a dropped *tail* is undetectable locally, because a
  prefix is itself a valid chain. Only an off-system witness of the head digest
  closes that, which is the anchor below (`tp-012` corrects `tp-009` on this). Phase 1b adds a per-row chain hash in the DO
  (`sha256(prev ‖ JCS(record))`) and exposes the head digest. That gives a
  log one content address that evidence, attestations and anchors can cite.
  The chain lives in the storage layer, not the event: records stay
  `seq`-free, and v1 traces need no rewrite.
- **Forward-only anchoring.** claude-stamp's anchor sends its head to
  checkmate's hub, which accepts only strict extensions and records a fork as
  a 409 plus an incident. Stratum's head digest is exactly what such a
  witness needs. Wiring an anchor is **not** in this ADR. It needs an
  off-system witness, and that is a deploy decision (recorded as a
  reopenable ghost edge).
- **Re-derive, never trust.** `verify-release.py` re-derives every value the
  exporter supplied: "it can only cause failure." That is the rule for
  bindings. The guard checks formats and digests and verifies signatures
  itself. It never accepts a supplied "verified: true" or a precomputed
  result.
- **Hardware-key signers and namespace binding.** These became the §5
  SSHSIG decision.
- **A single trust-root step.** The gated installer's `bootstrap` pins signer
  and verifier once, after which every update must chain from it. That is
  §4's genesis set.

**From Temenos (`mazze93/temenos`):**

- **Temenos is a live v1 writer.** `temenos/policy.py` stamps
  `checked_at: now, signer: "aletheia"` on its gate evidence, which is
  exactly the primitive this ADR retires. Its events are born `asserted`, so
  v1 compatibility (§3) keeps them loading, and §7 does not change how they
  project. The migration path: its gate run becomes a v2
  `reproducible_check` (Aletheia commit + input `sha256` + deterministic
  verdict digest), and that is why `inputs` matches its provenance envelope.
  That change belongs to Temenos, in its own ADR.
- **Schemas first.** Temenos puts machine-readable schemas above policy,
  tests and ADRs. Phase 2 publishes `schemas/event.v2.schema.json` as the
  normative wire contract that consumers validate against, so that this ADR's
  prose isn't the only definition of the format.
- **Don't collapse evaluations into one score.** Temenos keeps
  deterministic, behavioral, model and human evaluation separate. §7's
  per-entry `binding` field keeps the trust kinds of evidence separate in the
  same way. A single tier would collapse them.

## 9. Consequences

- The contract's strongest claim ("only checked evidence counts") becomes
  something the engine can mechanically tell apart, for v2.
- v1 traces remain loadable forever. Their *trust* is phase 4's question,
  answered in the open rather than by accident.
- New permanent surfaces: the canonical-bytes golden, a crypto verifier in two
  languages, and an RFC 8032 implementation the oracle must keep correct
  (pinned by RFC test vectors).
- A registry can brick itself. That is the fail-closed choice, named.
