# Trust-primitives burst — 2026-10-06

Mandate (tp-000): stop treating `checked_at`/`signer` as sufficient trust
primitives; bind evidence to reproducible checks or signed attestations; a real
authority registry; atomic persistence. Run as a self-paced `/loop`.

Scope document: `docs/ADR-003-trust-primitives.md`. Authoritative record:
`data/trust-trace.jsonl` (this journal is narrative gloss; the trace wins).

**In scope:** `core/`, `reference/`, `worker/src/do.ts` (+ new `persist.ts`),
`scripts/validate-trace.py`, goldens, MEMORY_MODEL rev 4, TRUST.md.
**Out of scope:** JSONL writer atomicity, the CLI's capture UX, deploy.
**Load-bearing assumption (verified on disk):** all four existing traces are
schema_version 1 and must keep loading — the v2 work is version-gated.

One phase per PR, one PR per loop tick. Phase 4 changes how existing traces
project and waits on mazze (ADR-003 §7 / tp-005).
