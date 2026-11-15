import type { StratumLogDO } from "./do.js";
import type { PlaygroundGateDO } from "./gate.js";

export interface Env {
  STRATUM_LOG: DurableObjectNamespace<StratumLogDO>;
  PLAYGROUND_GATE: DurableObjectNamespace<PlaygroundGateDO>;
  ASSETS: Fetcher;
  /** wrangler secret; gates writes and private-log reads */
  STRATUM_TOKEN: string;
  /**
   * R2 off-system anchor (ADR-004, worker/src/anchor.ts). The two credentials
   * are wrangler secrets (an Access service token for checkmate); while either
   * is unset the cron logs `not-configured` and makes no outbound call.
   */
  CHECKMATE_CLIENT_ID?: string;
  CHECKMATE_CLIENT_SECRET?: string;
  /** var; bare https origin, default https://checkmate.mazzeleczzare.com */
  CHECKMATE_URL?: string;
  /** var; comma/space-separated log ids to anchor, default "demo" */
  ANCHOR_LOGS?: string;
}
