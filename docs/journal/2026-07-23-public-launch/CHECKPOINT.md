# CHECKPOINT — public-launch session
Last updated: 2026-07-23 — **SESSION CLOSED, SHIPPED**

- [x] 0 Bootstrap · `71760b7`
- [x] A Landing page + routing · `2615ebb`
- [x] B Circadian surfaced + Plate ground · `88187e4`
- [x] C Doc issues (MEMORY_MODEL, ADR-001/002, TRUST.md) · `a2a062f`
- [x] D ARBITRATION.md research draft · `607a716`
- [x] E render-decisions multi-trace + 2 CI gates · `97defdb`
- [x] Landing: audit panel, nav, scrubber, legend, canonical links · `eb27172` `d046aef` `115ecf1`
- [x] PR #1 merged · `a6303a8` · deployed
- [x] Hero: centered title, deco tier-colored CTAs, underline register · `23360bc`
- [x] PR #2 merged · `369a056` · deployed
- [x] F Verification events appended — trace closed with checked evidence

## Shipped
- **Production:** https://stratum.mazzeleczzare.com/ (v0.4.0) — landing 200, /atrium/ 200, /atrium 307, health 0.4.0.
- **main:** `369a056` (both PRs merged, CI green both times).
- **Dogfooding trace:** `data/atrium-trace.jsonl` — 33 events, **15 decisions now `authoritative_verified`** (were 0), each closed by a verification event citing real checked evidence: the merge SHA `369a056`, CI run `30037916351`, and production url_checks. One axiomatic trust root, two standing foreclosures.
- **The empirical result of note:** `at-013` records the contract refusing this session's own event — a `supersession` of a `pending_evidence` decision was rejected as an illegal transition, and the work was re-recorded as a revision. Stratum caught its operator writing an incoherent history.

## Deferred (not blocking, noted for a future build)
- **npm publish** — `@stratum/cli` is unpublished (`private: true`); leaning `stratum-ledger`. Landing ships `git clone`, which works.
- **Full ground-to-ground circadian progression** — deferred (`at-008` ghost edge); revisit if Plate's day/night span reads too subtle.
- **ADR-001 item 4** (Chronicle role re-scope) — deferred; the role contract isn't in this repo.
- **Capability ontology granularity** (`TRUST.md §3`) and **precedent decay** (`ARBITRATION.md`) — open research, framed not resolved.
