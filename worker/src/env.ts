import type { StratumLogDO } from "./do.js";
import type { PlaygroundGateDO } from "./gate.js";

export interface Env {
  STRATUM_LOG: DurableObjectNamespace<StratumLogDO>;
  PLAYGROUND_GATE: DurableObjectNamespace<PlaygroundGateDO>;
  ASSETS: Fetcher;
  /** wrangler secret; gates writes and private-log reads */
  STRATUM_TOKEN: string;
}
