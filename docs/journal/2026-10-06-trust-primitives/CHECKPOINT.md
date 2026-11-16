# CHECKPOINT — trust-primitives burst
Last operational update: 2026-11-15 — R2 production tick observed. Original handoff: stratum_export_2026-10-07.md (merged #80).

- [x] 0 ADR-003 + trust-trace (tp-000..008) + renderer registers workspace/trust traces
- [x] 1 Atomic DO persistence + fault-injection test (tp-001) — PR #74
- [x] 1b Hash-chained persistence + head digest (tp-009, revised by tp-012, tp-013) — PR #75
- [x] 2 v2 evidence binding + schemas/event.v2.schema.json + CLI --run (tp-002, tp-011, tp-014, tp-015) — PR #76
- [ ] **Reordered (tp-019, mazze-approved):**
  - [x] R1 Stack landed: #72, #75 (f34d190), #76 (9270736); prod verified (demo head == oracle). Incident fix #78 merged (tp-021), verified on bound evidence by tp-030 (#81, c102931). tp-022 awaiting mazze.
  - [x] R2 Anchor the log head off-system (checkmate forward-only hub). PR #108 merged; production credentials and a dedicated Service Auth policy provisioned with Mazze's approval on 2026-11-15. Scheduled tick at 2026-11-15T21:00:24.293Z logged `local:first`, `hub:anchored`, `rows:20`, head `67f7689bb298131b673ee5da969b2aa74509b773351dd7c3afc57be7e8b4bbc0` (tp-035..038). This is the hub's observed acknowledgement via Stratum logs, not an independent read-back of hub storage. R2b's external transparency witness remains out of scope.
  - [x] R3 Re-checker + weekly CI job; output_path added; merged #79 (253a26a); now 5/5 reproduced in CI incl. tp-030
  - [ ] R4 Authority registry — per-log quorum fixed at genesis; single hardware key allowed for single-human logs, labeled (tp-003, tp-004, tp-010)
  - [ ] R5 Temenos → v2 evidence (first external writer)
  - [ ] R6 MEMORY_MODEL rev 4, TRUST.md, verification events with v2 bindings
- No more stacked PRs (tp-020): one PR per phase against main.

## Resume
Read PLAN.md, then `python3 scripts/validate-trace.py data/trust-trace.jsonl`.
