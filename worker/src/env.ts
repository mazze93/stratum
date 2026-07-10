import type { StratumLogDO } from "./do.js";

export interface Env {
  STRATUM_LOG: DurableObjectNamespace<StratumLogDO>;
  ASSETS: Fetcher;
  /** wrangler secret; gates writes and private-log reads */
  STRATUM_TOKEN: string;
}
