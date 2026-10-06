# CHECKPOINT — trust-primitives burst
Last updated: 2026-10-06

- [x] 0 ADR-003 + trust-trace (tp-000..008) + renderer registers workspace/trust traces
- [ ] 1 Atomic DO persistence + fault-injection test (tp-001)
- [ ] 1b Hash-chained persistence + head digest (tp-009)
- [ ] 2 v2 evidence binding + schemas/event.v2.schema.json (tp-002, tp-011)
- [ ] 3 JCS + SSHSIG/Ed25519 (incl. sk-) + authority registry (tp-003, tp-004, tp-010)
- [ ] 4 Legacy projection — **blocked on mazze** (tp-005)
- [ ] 5 MEMORY_MODEL rev 4, TRUST.md, verification events with v2 bindings

## Resume
Read PLAN.md, then `python3 scripts/validate-trace.py data/trust-trace.jsonl`.
