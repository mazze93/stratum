# CHECKPOINT — trust-primitives burst
Last updated: 2026-10-07 — handoff: stratum_export_2026-10-07.md

- [x] 0 ADR-003 + trust-trace (tp-000..008) + renderer registers workspace/trust traces
- [x] 1 Atomic DO persistence + fault-injection test (tp-001) — PR #74
- [x] 1b Hash-chained persistence + head digest (tp-009, revised by tp-012, tp-013) — PR #75
- [x] 2 v2 evidence binding + schemas/event.v2.schema.json + CLI --run (tp-002, tp-011, tp-014, tp-015) — PR pending
- [ ] **Reordered (tp-019, mazze-approved):**
  - [x] R1 Stack landed: #72, #75 (f34d190), #76 (9270736); prod verified (demo head == oracle). Incident fix #78 awaiting merge; tp-022 awaiting mazze.
  - [ ] R2 Anchor the log head off-system (claude-stamp / checkmate forward-only hub)
  - [x] R3 Re-checker + weekly CI job; output_path added; 4/4 reproduced locally AND in CI — merged #79 (253a26a)
  - [ ] R4 Authority registry — per-log quorum fixed at genesis; single hardware key allowed for single-human logs, labeled (tp-003, tp-004, tp-010)
  - [ ] R5 Temenos → v2 evidence (first external writer)
  - [ ] R6 MEMORY_MODEL rev 4, TRUST.md, verification events with v2 bindings
- No more stacked PRs (tp-020): one PR per phase against main.

## Resume
Read PLAN.md, then `python3 scripts/validate-trace.py data/trust-trace.jsonl`.
