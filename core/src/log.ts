/**
 * Append-only episodic log. Status is a fold over the log, never a mutation —
 * the load-bearing correction of MEMORY_MODEL §2. Ordering is by logical seq;
 * wall-clock timestamps are metadata and ignored by every path here.
 */

import {
  ChainDepthExceeded,
  ContractViolation,
  EVIDENCE_SCOPED,
  hasCheckedEvidence,
  isChecked,
  KNOWN_TYPES,
  MAX_CHAIN_DEPTH,
  ORIGINATING,
  OVERTURNED,
  QUORUM,
  Status,
  StratumEvent,
  TRANSITION_EFFECT,
  TRANSITIONS,
} from "./contract.js";

export class EpisodicLog {
  private readonly events: StratumEvent[] = [];
  private readonly byId = new Map<string, StratumEvent>();

  get head(): number {
    return this.events.length - 1;
  }

  eventsUpto(epoch?: number): StratumEvent[] {
    const e = epoch ?? this.head;
    return this.events.filter((ev) => ev.seq <= e);
  }

  get(eventId: string): StratumEvent {
    const ev = this.byId.get(eventId);
    if (ev === undefined) throw new ContractViolation(`unknown event id ${eventId}`);
    return ev;
  }

  has(eventId: string): boolean {
    return this.byId.has(eventId);
  }

  append(event: StratumEvent): StratumEvent {
    if (this.byId.has(event.id)) {
      throw new ContractViolation(`duplicate event id ${event.id}`);
    }
    if (!KNOWN_TYPES.has(event.type)) {
      throw new ContractViolation(`unknown event type ${JSON.stringify(event.type)}`);
    }
    const sequenced: StratumEvent = { ...event, seq: this.events.length };
    this.guard(sequenced); // guards run BEFORE the push; head still points at the prior event
    this.events.push(sequenced);
    this.byId.set(sequenced.id, sequenced);
    return sequenced;
  }

  // -- guards ----------------------------------------------------------

  private guard(event: StratumEvent): void {
    if (ORIGINATING.has(event.type)) this.guardOriginating(event);
    else if (EVIDENCE_SCOPED.has(event.type)) this.guardInvalidation(event);
    else this.guardTransition(event);
  }

  private guardOriginating(e: StratumEvent): void {
    if (
      e.birthStatus !== Status.Asserted &&
      e.birthStatus !== Status.PendingEvidence &&
      e.birthStatus !== Status.Ratified
    ) {
      throw new ContractViolation(`${e.id} illegal entry status ${e.birthStatus}`);
    }
    if (e.birthStatus === Status.Ratified && !e.isTrustRoot) {
      throw new ContractViolation(`${e.id} entered RATIFIED without is_trust_root`);
    }
    // Lineage is single-parent in v1; reject silently-ambiguous diamonds at write time.
    if (e.targets.length > 1) {
      throw new ContractViolation(
        `${e.id} has multi-parent lineage [${e.targets.join(", ")}]; single-parent only in v1`,
      );
    }
  }

  private guardInvalidation(e: StratumEvent): void {
    if (e.birthStatus !== Status.Asserted && e.birthStatus !== Status.PendingEvidence) {
      throw new ContractViolation(`invalidation ${e.id} illegal entry ${e.birthStatus}`);
    }
    if (e.targets.length !== 1) {
      throw new ContractViolation(`invalidation ${e.id} must target exactly one evidence ref`);
    }
  }

  private guardTransition(t: StratumEvent): void {
    if (t.targets.length !== 1) {
      throw new ContractViolation(`transition ${t.id} must target exactly one event`);
    }
    const targetId = t.targets[0]!;
    const cur = this.statusAt(targetId, this.head);
    const to = TRANSITION_EFFECT[t.type]!;
    if (!TRANSITIONS[cur].has(to)) {
      throw new ContractViolation(`illegal transition ${cur} -> ${to} on ${targetId}`);
    }
    // I1: validation requires checked evidence on the verification event itself.
    if (to === Status.Validated && !hasCheckedEvidence(t)) {
      throw new ContractViolation(`I1: verification ${t.id} carries no checked evidence`);
    }
    // Quorum: RATIFIED -> CONTRADICTED only via trust_root_revoked, counting
    // only CHECKED policy-authority signatures (cited != checked, especially here).
    if (cur === Status.Ratified && to === Status.Contradicted) {
      if (t.type !== "trust_root_revoked") {
        throw new ContractViolation(`RATIFIED ${targetId} revocable only by trust_root_revoked`);
      }
      const signers = new Set(
        t.evidence
          .filter((e) => e.kind === "policy_authority" && e.signer !== null && isChecked(e))
          .map((e) => e.signer),
      );
      if (signers.size < QUORUM) {
        throw new ContractViolation(
          `trust_root_revoked needs >= ${QUORUM} distinct CHECKED authorities, got ${signers.size}`,
        );
      }
    }
    if (to === Status.Superseded || to === Status.Contradicted) {
      if (this.chainDepth(targetId) > MAX_CHAIN_DEPTH) {
        throw new ChainDepthExceeded(`I3: chain depth at ${targetId} exceeds ${MAX_CHAIN_DEPTH}`);
      }
    }
  }

  // -- status fold -----------------------------------------------------

  /**
   * status_at(event, epoch) = fold(birth_status, markers targeting event with
   * seq <= epoch, ordered by seq). Illegal markers are skipped in the fold —
   * append guards prevented them, so replay of a clean log never sees one,
   * and a fold must be total regardless.
   */
  statusAt(eventId: string, epoch: number): Status {
    let status = this.get(eventId).birthStatus;
    const markers = this.events
      .filter(
        (ev) =>
          ev.seq <= epoch &&
          ev.type in TRANSITION_EFFECT &&
          ev.targets.length > 0 &&
          ev.targets[0] === eventId,
      )
      .sort((a, b) => a.seq - b.seq);
    for (const m of markers) {
      const to = TRANSITION_EFFECT[m.type]!;
      if (TRANSITIONS[status].has(to)) status = to;
    }
    return status;
  }

  lineageParent(event: StratumEvent): string | null {
    return event.targets.length > 0 ? event.targets[0]! : null;
  }

  private chainDepth(eventId: string): number {
    let depth = 1;
    let cursor = this.get(eventId);
    const seen = new Set([eventId]);
    let parent = this.lineageParent(cursor);
    while (parent !== null && this.byId.has(parent) && !seen.has(parent)) {
      cursor = this.get(parent);
      seen.add(cursor.id);
      depth += 1;
      parent = this.lineageParent(cursor);
    }
    return depth;
  }

  // -- derived review --------------------------------------------------

  /**
   * Evidence an event depends on at an epoch: refs it carries itself, plus
   * refs carried by transition markers targeting it. (Not invalidations, not
   * lineage children — the exact reference filter.)
   */
  evidenceRefsOf(eventId: string, epoch: number): Set<string> {
    const refs = new Set<string>();
    for (const ev of this.eventsUpto(epoch)) {
      const owns = ev.id === eventId;
      const targetsIt =
        ev.type in TRANSITION_EFFECT && ev.targets.length > 0 && ev.targets[0] === eventId;
      if (owns || targetsIt) {
        for (const e of ev.evidence) refs.add(e.ref);
      }
    }
    return refs;
  }

  /**
   * Under review iff a LIVE invalidation (one not itself overturned) targets
   * evidence the event depends on, at the epoch. Derived — never stored — so
   * overturning the invalidation clears review with no cleanup actor.
   */
  underReview(eventId: string, epoch: number): boolean {
    const deps = this.evidenceRefsOf(eventId, epoch);
    if (deps.size === 0) return false;
    for (const ev of this.eventsUpto(epoch)) {
      if (ev.type !== "invalidation" || ev.targets.length === 0 || !deps.has(ev.targets[0]!)) {
        continue;
      }
      if (!OVERTURNED.has(this.statusAt(ev.id, epoch))) return true;
    }
    return false;
  }
}
