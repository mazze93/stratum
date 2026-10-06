# Session decisions — append-only

> Authoritative record: `data/trust-trace.jsonl`.

- 2026-10-06 · New per-session trace, not genesis (tp-000) · genesis is the golden fixture · reverse: fold into genesis.
- 2026-10-06 · Renderer now lists workspace-trace and trust-trace · workspace-trace had been validated by CI but missing from DECISIONS.md, whose header claims every trace — rot, fixed in passing · reverse: drop the two TRACES rows.
- 2026-10-06 · ADR-003 as a standalone doc · ADR-001/002 live inside ARCHITECTURE-EVALUATION.md, and there is no docs/adr/ · reverse: move into that doc.
- 2026-10-06 · Read mazze93/claude-stamp and mazze93/temenos at mazze's request; ADR-003 §8 records what was borrowed (tp-009 hash chain, tp-010 SSHSIG incl. sk- hardware keys, tp-011 v2 JSON Schema + Temenos-shaped inputs) · Temenos is a live v1 writer stamping checked_at=now — v1 compatibility is load-bearing, not courtesy · reverse: drop §8 and the three events' phases.
||||||| parent of b5a4d92 (worker: atomic DO persistence — memory never ahead of storage (tp-001))
- 2026-10-06 · Phase 1 verification events deferred to phase 5 · writing tp-001's verification with v1 `checked_at` evidence would use the very primitive this burst retires; phase 5 records it with a v2 reproducible_check binding pinned to the merge commit · reverse: append a v1 verification now.
- 2026-10-06 · Finding for phase 2: `output_sha256` cannot be a digest of raw test output — vitest prints durations, so the bytes differ run to run. The binding needs a digest over deterministic output (a JSON reporter file, normalized), or must be optional with exit code as the pinned result · ADR-003 §3 to be amended in phase 2.
- 2026-10-06 · Phase 1 proof boundary · the fake store proves PersistentLog's ordering (rollback-then-drop-cache) under injected faults, and a mutation that removes the cache drop is caught; workerd smoke (wrangler dev) proves append/seed/duplicate-409/bad-seed-writes-nothing through real transactionSync. Not proven: a storage fault *inside* workerd's transactionSync — no injection hook exists; the rollback guarantee there is Cloudflare's documented contract.
