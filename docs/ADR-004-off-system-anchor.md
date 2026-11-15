# ADR-004 — Anchor each log's head off-system

**Status:** Proposed — lands as trust-primitives R2 in one PR (tp-020). Inert until
provisioned.
**Date:** 2026-11-15
**Relates to:** ADR-003 §8 (the deferred anchor), `docs/journal/2026-10-06-trust-primitives/CHECKPOINT.md` R2
**Trace:** `data/trust-trace.jsonl` `tp-035` (decision), `tp-036`–`tp-038` (foreclosures)

## 1. Context

The storage chain (`tp-009`, `tp-012`) catches an edited, reordered, or
middle-deleted log on every load. It cannot catch a **dropped tail**, because a
prefix is itself a valid chain, and it cannot catch a **whole-chain rewrite**
by whoever holds the storage, because they can recompute every link. ADR-003 §8
left the fix out on purpose: it needs a witness Stratum's storage does not
control, and choosing one is a deploy decision.

## 2. Two trust domains

A witness is off-system when an actor who can rewrite Stratum's Durable Object
storage cannot also rewrite the witness's record. Two domains are worth naming:

- **Stratum's storage and code** (the `stratum` Worker and its DOs): a bad
  deploy, a storage bug, a migration that drops rows, a compromised code path.
- **The operator's whole estate** (the Cloudflare and GitHub accounts):
  account compromise, or the operator quietly rewriting history.

## 3. Decision

Anchor each allowlisted log to **checkmate's forward-only hub** first (this
ADR), and later anchor the **hub's own head** into a public transparency log
(R2b, not here). Mazze chose hub-first on 2026-11-15.

- A Cron Trigger (`*/15 * * * *`) runs `worker/src/anchor.ts`. Appends never
  wait on checkmate, so persistence invariants (`tp-001`, `tp-009`) are
  untouched.
- Per log: read the hub's last anchor for `stratum:<logId>`, ask the DO for its
  stored, load-verified chain value at that row (`anchorPoint`), judge locally
  (`first`, `extends`, `hub-ahead`, `forked`), then send exactly what Stratum
  has: `{ledger, rows, head, prevHead}`. The hub refuses any disagreement with
  409 **and** records it as a critical incident in its own chain. The break is
  the record.
- **Stratum's verdict is the label of record.** The hub's refusal kind can
  mislead: a same-length rewrite comes back as `ledger-regression`, not
  `ledger-fork` (scope touchstone P1).
- **Inert until provisioned.** Without `CHECKMATE_CLIENT_ID` and
  `CHECKMATE_CLIENT_SECRET` (an Access service token) the cron logs
  `not-configured` and makes no outbound call. A bad config (non-https URL, an
  id over 56 characters, a `playground-*` id) is refused whole.
- Auth is the Access service-token headers to checkmate's https custom domain,
  so the hub sees an Access identity. Loopback `http://` is accepted only for a
  local workerd smoke. Redirects are never followed (fetch keeps custom headers
  across origins, so a 3xx would carry the secret), and a `200` counts as
  witnessed only when it is the hub's own `{"ok":true,…}`.
- A pure verdict, `anchorVerdict` in `core/src/chain.ts` with its twin
  `anchor_verdict` in `reference/canonical.py`, judges any anchor against
  exported, normalized wire records. It is what a later outside verifier (the
  CLI, CI, the Rekor layer) uses. The genesis chain prefixes at rows 1 and 10
  are pinned in `data/canonical.golden.json`.

## 4. Perimeter

The hub **crosses the first domain only.** It runs in the same Cloudflare
account, so it does not detect an attacker who holds that account and rewrites
both Stratum's and checkmate's Durable Objects. That gap closes at the Rekor
layer, not here.

Further limits, stated so nobody leans on them:

- **Window.** Rows appended and then dropped inside one 15-minute window are
  never witnessed. Anything anchored stays covered.
- **Foreign anchors.** The hub binds no ledger name to an identity, and it
  records only `agent` or `human` as `by`. Any checkmate agent credential can
  post a huge `rows` for `stratum:<id>`, after which every Stratum anchor is
  refused as a regression. Anchoring can be denied this way; nothing can be
  erased. The local `hub-ahead` verdict logs the hub row's `by` and `at`.
  Binding `stratum:*` to Stratum's Access identity is a checkmate change.
- **The hub trusts `prevHead`.** It is Stratum's own stored chain value, so a
  compromised Stratum Worker could lie. `anchorVerdict` over exported events is
  how an outside verifier catches that.
- **Repeat incidents.** A broken log is refused, and recorded as a critical
  incident, every tick until someone resolves it. That is intended; it also
  means the allowlist must hold only logs that are never reseeded.
- **Access on a Worker subrequest is unverified.** Whether a request from the
  `stratum` Worker to checkmate's Access-protected custom domain is evaluated
  by Access and gets a JWT minted from the service-token headers has not been
  observed. If it is not, the fallback is a service binding plus a dedicated,
  anchor-only bearer on checkmate's side, which turns `tp-038` from a
  foreclosure into a decision.

## 5. Alternatives (foreclosed, with reopen conditions)

- **Anchor inside `appendEvent`** (`tp-036`): couples every write to
  checkmate's uptime. Reopen if the 15-minute window turns out to matter.
- **Rekor first** (`tp-037`): Rekor v2 has no search index, so the witness is
  only as complete as a bundle index stored inside the estate it guards; and
  private log names need a token story that does not exist yet (ig-004).
  Reopen with a bundle store outside the operator's estate, or a verifiable
  index.
- **A service binding with the break-glass bearer** (`tp-038`): a binding
  skips Access, so the hub would see the break-glass identity. Reopen if Access
  does not evaluate the Worker subrequest (§4).

## 6. Operating it

1. Create an Access service token for Stratum on checkmate's Access app.
2. `wrangler secret put CHECKMATE_CLIENT_ID` and `CHECKMATE_CLIENT_SECRET` on
   the `stratum` Worker.
3. Set `ANCHOR_LOGS` in `worker/wrangler.jsonc` (default `demo`) to the logs to
   witness. Never a log that is reseeded.
4. The next tick should log `"hub":"anchored"` per log, and the hub's
   `GET /api/hub/ledger-anchors?ledger=stratum:<id>` should show `rows` equal
   to `/api/logs/<id>/head` `events` and `head` equal to `head_digest`.

Local smoke: `node scripts/anchor-smoke-hub.mjs` (a stand-in hub on
`127.0.0.1:8799`, ported from checkmate's `handleLedgerAnchor`), then
`npx wrangler dev --test-scheduled` in `worker/` with
`--var CHECKMATE_URL:http://127.0.0.1:8799 --var CHECKMATE_CLIENT_ID:smoke-id
--var CHECKMATE_CLIENT_SECRET:smoke-secret`, and `GET /__scheduled` to fire a
tick.
