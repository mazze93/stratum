# Session decisions — append-only

> Authoritative record: `data/trust-trace.jsonl`.

- 2026-10-06 · New per-session trace, not genesis (tp-000) · genesis is the golden fixture · reverse: fold into genesis.
- 2026-10-06 · Renderer now lists workspace-trace and trust-trace · workspace-trace had been validated by CI but missing from DECISIONS.md, whose header claims every trace — rot, fixed in passing · reverse: drop the two TRACES rows.
- 2026-10-06 · ADR-003 as a standalone doc · ADR-001/002 live inside ARCHITECTURE-EVALUATION.md, and there is no docs/adr/ · reverse: move into that doc.
- 2026-10-06 · Read mazze93/claude-stamp and mazze93/temenos at mazze's request; ADR-003 §8 records what was borrowed (tp-009 hash chain, tp-010 SSHSIG incl. sk- hardware keys, tp-011 v2 JSON Schema + Temenos-shaped inputs) · Temenos is a live v1 writer stamping checked_at=now — v1 compatibility is load-bearing, not courtesy · reverse: drop §8 and the three events' phases.
