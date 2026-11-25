---
title: "Stratum R4: Authority registry, implementation spec"
repo: github.com/mazze93/stratum
status: draft for handoff
date: 2026-11-20
revised: 2026-11-25 (v0.2.0: mixed-version authority acts, §2.16, §5, §7)
sources:
  - docs/ADR-003-trust-primitives.md (§3, §4, §5, §6 phase 3)
  - docs/journal/2026-10-06-trust-primitives/CHECKPOINT.md (R4 line)
  - data/trust-trace.jsonl (tp-003, tp-004, tp-008, tp-010, tp-014, tp-019, tp-020, tp-022, tp-039)
tags: [stratum, trust-primitives, R4, authority-registry]
---

# Stratum R4: Authority registry

## 0. One-paragraph brief

Today a Stratum write is trusted because the writer **holds the bearer token**. R4 makes certain writes trusted because they carry **valid signatures from keys the log itself has registered**. The registry is not a new store. It is a fold over ordinary trust-root events in the same log (ADR-003 §4). Signatures are SSHSIG over Ed25519 (namespace `stratum`), including hardware `sk-ssh-ed25519` keys, verified as pure synchronous computation in both implementations. Once R4 lands, the v2 authority acts that phase 2 refuses outright (tp-014) become possible, but only when signed.

This is ADR-003 **phase 3**. One PR, against `main`, no stacking (tp-020).

## 1. Why it matters now (what's waiting on it)

| Waiting | What it needs from R4 |
|---|---|
| Stele pairing objective (Stele #119 as rewritten) | Approval must be a Stratum decision under its authority contract; `approvalRecord` cites `ledger, eventId, contractVersion, approvedProposalSha256, proposalCommit`. Needs a signed v2 ratification. |
| Temenos (R5) | First external v2 writer; its authority has to be a registered key, not `signer: "aletheia"`. |
| Checkmate receipts | Checkmate's own DECISIONS (2026-10-28, 2026-10-30) record that a token holder can forge a Stratum review Checkmate can't distinguish. |
| Cognitive-topology plugin v2 ratification, ig-004, Context Synapse sb-020 to sb-024 | Authenticated authority on writes. |

## 2. Decisions already in force (do not relitigate)

1. **Registry is a fold over the log** (tp-003). No separate registry store, no new event type, no new status, no new edge. Ghost edges `separate-registry-store` and `per-key-revocation-event-type` are rejected.
2. **Authorities live in a top-level `authorities` block** on a v2 trust-root event (`is_trust_root: true`, birth `ratified`). Never inside `claim`.
3. **Membership at epoch E** = the union of `authorities` from every authority-bearing trust root whose status at E is `ratified`. Revocation is the existing `trust_root_revoked` marker.
4. **Genesis is the named axiom.** The first authority-bearing trust root in a log is unsigned.
5. **Every later grant, every v2 `trust_root_revoked`, and every v2 `ratification` must be signed** by live members (counts below). Quorum counts **distinct live `key_id`s whose signatures verify**, never signer strings.
6. **Key rotation is two steps:** grant the survivors, then revoke the old grant. Both need quorum.
7. **Fewer than quorum live members ⇒ the log's registry is bricked by design.** Fail closed. Recovery is out of band (new log, new genesis).
8. **Quorum is per log, fixed at genesis** (tp-019, approved by Mazze). A **single hardware key is allowed for a single-human log, and the log is labeled as such.** A global `QUORUM = 2` with one human is ruled out (ghost edge `global-QUORUM-2-with-one-human`): two keys held by one person is theater, and agents holding authority keys is generation becoming authority.
9. **Canonical bytes are RFC 8785 JCS.** Already implemented and pinned by a golden plus a 1606-value differential test (moved into phase 1b). Reuse it; don't write a second canonicalizer.
10. **Signed payload** = the event record with `signatures` and `seq` removed, in JCS form. **Attestation payload** = JCS of `{predicate, ref, subject_sha256}`.
11. **Signature format is SSHSIG** (OpenSSH `PROTOCOL.sshsig`), namespace `stratum`, over Ed25519 (tp-010). Accepted key types: `ssh-ed25519`, `sk-ssh-ed25519@openssh.com`. For `sk-` keys the signed bytes are `sha256(application) ‖ flags ‖ counter ‖ sha256(message)` and **the user-presence flag is required**.
12. **Never shell out** to `ssh-keygen` or anything else. Guards stay pure and synchronous (tp-007, tp-010).
13. **Python oracle:** self-contained stdlib RFC 8032 verifier, pinned by RFC 8032 test vectors. **No pip step in CI** (tp-004, tp-008).
14. **HMAC / shared-secret signatures are foreclosed** (tp-008).
15. **v1 is untouched.** v1 events keep v1 guards byte-for-byte; "verified remains verified" (tp-016). Projection of existing traces and `data/genesis-projection.golden.json` must not change. This covers v1 markers on **v1 targets** only; see 16.
16. **The target decides, not the marker.** Whether an act needs registry signatures is set by the **target's** version, not the marker's. Any `ratification` or `trust_root_revoked` whose target is a v2 trust root is a v2 authority act, whatever the marker's own `schema_version`. A v1 marker can't carry `signatures` (parse error, §4), so a v1 `ratification` or `trust_root_revoked` targeting a v2 trust root is **refused**. Reason: today `guardTransition` branches on `t.schemaVersion`, while membership follows the target's status. Without this rule a token holder could remove a v2 root with a v1 revoke carrying two made-up `checked_at` signer names (v1's `QUORUM = 2` counts strings), or restore a revoked v2 root with an unsigned v1 ratification (`contradicted → ratified` is a legal edge). This changes no existing history: `guardOriginating` refuses every v2 `ratified` birth today, so no stored log holds a v2 trust root yet.

## 3. Amendment R4 must make to ADR-003

ADR-003 §4 still says "at least `QUORUM` authorities" and "`QUORUM` distinct live members" as if `QUORUM` were global. tp-019 changed that. The PR amends §4 to say:

- The genesis authority-bearing trust root declares the log's quorum `q` (integer ≥ 1) and lists at least `q` authorities.
- `q = 1` is permitted only when the genesis also declares the log **single-human** and every genesis key is an `sk-ssh-ed25519@openssh.com` hardware key. (See open question Q1; this is the spec's proposed reading of "single hardware key … labeled".)
- `q` is immutable for the life of the log. Changing it means a new log.

## 4. Wire format (v2 additions)

```jsonc
// Genesis authority-bearing trust root (unsigned)
{
  "id": "auth-000",
  "type": "decision",
  "agent_id": "mazze",
  "schema_version": 2,
  "birth_status": "ratified",
  "is_trust_root": true,
  "claim": { "narrative": "Authority genesis for log <id>." },
  "evidence": [], "targets": [],
  "registry": {                       // proposed name; see Q2
    "quorum": 1,
    "single_human": true              // the label tp-019 requires when quorum is 1
  },
  "authorities": [
    { "key_id": "<see Q3>",
      "algorithm": "ed25519",
      "key_type": "sk-ssh-ed25519@openssh.com",
      "public_key": "<base64 SSH wire-format public key blob>" }
  ],
  "timestamp": "..."
}

// Any later signed act (grant, v2 trust_root_revoked, v2 ratification)
{
  ...,
  "signatures": [
    { "key_id": "<registry key id>",
      "sshsig": "<base64 of the SSHSIG blob, armor stripped>" }
  ]
}
```

Rules:
- `authorities`, `registry` and `signatures` are **top-level** and **v2 only**. On a v1 event any of them is a parse error.
- Strict parsing in both implementations: unknown keys inside `authorities[]`, `registry`, `signatures[]` are parse errors (same rule as bindings: a supplied `"verified": true` is never a shortcut).
- `signatures` is excluded from the signed payload (with `seq`). Everything else, including `authorities` and `registry`, is signed.
- Update `schemas/event.v2.schema.json` and its drift test.

## 5. Guard semantics

Let `members(E)` = live authorities at epoch E (the event's position in the fold, before the event itself applies). Let `q` = the log's genesis quorum.

| Event | Requirement |
|---|---|
| First v2 trust root with `authorities` (genesis) | No signatures. `registry.quorum` present; `len(authorities) ≥ q`; distinct `key_id`s; if `q = 1`, `single_human: true` and all keys are `sk-`. Only one genesis per log: a second unsigned authority-bearing root is refused. |
| Later v2 trust root with `authorities` (grant) | ≥ q signatures from distinct `key_id`s in `members(E)`, each verifying over the event's signed payload. |
| v2 `trust_root_revoked` | ≥ q verifying signatures from distinct live members. Replaces v1's "distinct signer strings with `checked_at`". |
| v2 `ratification` | ≥ 1 verifying signature from a live member (ADR-003 §4). See Q4 on whether a single-human log changes anything here. |
| v2 `verification` with a `signed_attestation` binding | Counts toward I1 only if `key_id ∈ members(E)` and the signature verifies over the attestation payload. Until now these parse and never count. |
| v1 `ratification` or v1 `trust_root_revoked` whose target is a v2 trust root | Refused (§2.16). The guard reads the target's `schemaVersion` and `isTrustRoot`; the marker's version alone never selects the v1 path. |
| Any v2 authority act when the log has no genesis | Refused (keeps tp-014's interim behavior for logs that never adopt a registry). |
| Registry with live members < q | Every act that needs quorum is refused. Fail closed; nothing auto-recovers. |

**Fold rule (both implementations).** `statusAt` must skip a v1 `ratification` / `trust_root_revoked` targeting a v2 trust root, the same way it skips an illegal transition. Append guards stop these on the honest path; the fold has to stay total and agree with the guard if a log is ever assembled outside `append` (e.g. rebuilt from storage by `loadLog`).

Signature checks, in order (fail on first miss):
1. `key_id` resolves to a live member at E.
2. SSHSIG blob parses: magic `SSHSIG`, version 1, embedded public key **byte-equal** to the registered one, namespace exactly `stratum`, reserved empty, hash algorithm `sha512` or `sha256`.
3. Signed data is built per `PROTOCOL.sshsig` over `H(JCS(payload))`.
4. Ed25519 verify (RFC 8032). For `sk-` keys: rebuild `sha256(application) ‖ flags ‖ counter ‖ sha256(message)`, require flag bit `0x01` (user presence).
5. Duplicate `key_id`s in one event's `signatures` count once.

## 6. Implementation work

**Core (TypeScript, `core/`):**
- SSHSIG parser and verifier, synchronous. tp-012 records why hashing is hand-written: `crypto.subtle` is async, guards are sync, and workerd runs without `nodejs_compat`. **Ed25519 verify needs the same treatment.** Options: hand-written verifier (as SHA-256/JCS were), or a small pure-JS dependency. If a dependency enters `core/`, it gets its own trace event (supply-chain decision in a MAX repo; ADR-003 §5). Decide against a real `wrangler dev` run, not Node alone.
- Registry fold and the guards in §5.
- Parse/strictness for the new fields.

**Oracle (Python, `reference/`):**
- Stdlib RFC 8032 Ed25519 verifier (~60 lines per tp-004) plus SSHSIG parsing. No pip.
- Twin registry fold and guards.

**Fixtures and goldens:**
- RFC 8032 §7.1 test vectors in both implementations.
- A real SSHSIG fixture produced once by `ssh-keygen -Y sign -n stratum` (offline, at fixture-creation time only; never at runtime), checked into the repo, verified by both implementations.
- An `sk-` fixture. If no hardware key is available to the implementer, mark this as **pending Mazze** and do not fake it (see Q5).
- A shared v2 registry fixture log projected **byte-identically** by both implementations, with oracle cross-check, same pattern as the phase 2 binding fixture.

**CLI (`cli/`):** `stratum sign` (or a `--sign-with <key>` option on ratify/revoke) that calls `ssh-keygen -Y sign` **on the client** to produce the SSHSIG, then submits. Shelling out is fine client-side; the ban is on the guard. This is the honest-path-is-the-easy-path rule from tp-015.

**Worker:** no new endpoint is required if signed events go through the existing append path. Confirm the Worker's load path still rebuilds membership from storage through `loadLog` (atomic-persistence rule, tp-001).

## 7. Tests that must exist (each mutation-checked)

Positive:
- Genesis q=1 single-human `sk-` key, then a ratification signed by it, projects as expected in both impls.
- Genesis q=2 with two keys; grant signed by both; revoke signed by both.
- Signed attestation from a live member satisfies I1.

Negative (each must be refused, in both impls):
- Ratification with no signature; with a signature from an unregistered key; from a revoked key.
- Signature over a payload with one field altered after signing.
- Valid Ed25519 signature but wrong namespace (e.g. `git`): cross-protocol replay.
- `sk-` signature with user-presence flag cleared.
- Embedded SSHSIG public key differs from the registered key for that `key_id`.
- Same key listed twice to reach quorum.
- Second unsigned genesis.
- q=1 without `single_human`, or q=1 with a non-`sk-` key.
- Grant/revoke with q−1 valid signatures.
- Registry bricked: revoke down to fewer than q members, then any quorum act refused.
- `authorities` / `signatures` / `registry` on a v1 event; unknown keys inside them.
- **Mixed version, revoke:** a v1 `trust_root_revoked` with two distinct `policy_authority` signer names, both with `checked_at`, targeting a ratified v2 authority root. Refused; the root stays `ratified` and `members(E)` is unchanged.
- **Mixed version, restore:** revoke a v2 authority root with a valid v2 quorum-signed `trust_root_revoked`, then append an unsigned v1 `ratification` targeting it. Refused; the root stays `contradicted` and its keys stay out of `members(E)`.
- **Fold twin of both:** a log fixture containing each of those markers as if stored (bypassing `append`) projects with the marker skipped, identically in both impls.

Invariance:
- All existing traces and `data/genesis-projection.golden.json` project unchanged.
- Canonical golden unchanged.

Touchstone pass before calling it done: enumerate the boundaries the suite doesn't reach and probe the top risks (any other path where a marker's version picks the guard for a v2 target; fold ordering at the revocation epoch; signatures computed before vs after `seq` assignment; number canonicalization inside `authorities`).

## 8. Repo conventions the implementer must follow

- Work in a **worktree**, never the main checkout. The main checkout mirrors production (tp-032).
- **Merging to `main` is a production deploy** (Workers Builds). Open the PR; do **not** merge. Mazze merges.
- One PR for this phase, based on `main` (tp-020).
- Record decisions as events in `data/trust-trace.jsonl` (next free id after `tp-041`); `docs/DECISIONS.md` is generated, so regenerate it rather than hand-editing. Run `python3 scripts/validate-trace.py data/trust-trace.jsonl`.
- Regenerate any golden **deliberately** and say why in the PR.
- Verification events go in **after** merge, as v2 `reproducible_check` bindings pinned to the merge commit, recorded only once `scripts/recheck-bindings.py` reproduces them.
- Agent-authored events use the agent's own `agent_id`. Never mint authority as `mazze`; quote his ruling in the shadow trace instead (tp-032, tp-035 precedent).
- Update `CHECKPOINT.md` R4 line, ADR-003 §4 (amendment in §3 above), and §6 phase table.
- `main` requires every review conversation resolved before merge.

## 9. Out of scope

- R5 (Temenos to v2), R6 (MEMORY_MODEL rev 4, TRUST.md).
- tp-022 (per-row contract column). Still awaiting Mazze; R4 must not depend on it.
- Binding Stratum ledgers to Cloudflare Access identity (ghost edge on tp-035).
- R2b (Rekor over the hub head).
- Any re-tiering of v1 history.

## 10. Open questions for Mazze (answer before or during the PR)

- **Q1. What counts as "single-human, labeled"?** Proposed: `registry.single_human: true` on genesis, required when `q = 1`, and q=1 allowed only with `sk-` hardware keys. Alternative: allow a software `ssh-ed25519` key at q=1 too, labeled differently.
- **Q2. Field names.** `registry.quorum` / `registry.single_human` are this spec's proposal. ADR-003 only names `authorities`.
- **Q3. `key_id` format.** Proposed: the OpenSSH SHA256 fingerprint (`SHA256:<base64>`), derived, so it can't disagree with the key. Alternative: a human label, with the fingerprint checked separately.
- **Q4. Ratification threshold.** ADR-003 says ≥ 1 live member signature. Should a q=2 log require q signatures to ratify, or keep 1?
- **Q5. Who holds the genesis key(s) for the real logs** (`demo`, `workspace`, `temenos`, `macos-vuln-pipeline`, Stele's ledger), and is a YubiKey available to sign the `sk-` fixture?
- **Q6. TS Ed25519.** Hand-written (consistent with SHA-256/JCS, zero deps) or a pinned pure-JS library with its own trace event?

## 11. Done means

- PR open against `main`, CI green, both implementations agree on every new fixture.
- All §7 tests present and each one shown to fail when its guard is removed.
- ADR-003 §4 amended, CHECKPOINT updated, trace events added and validated.
- Touchstone findings listed in the PR, including what was not proven.
- Q1 to Q6 either answered by Mazze or listed in the PR as open.
