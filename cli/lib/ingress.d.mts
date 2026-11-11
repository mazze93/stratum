/** Types for ingress.mjs, so the TypeScript tests can import it under strict mode. */

export interface IngressRecord {
  id: string;
  type: string;
  agent_id: string;
  schema_version: number;
  birth_status: string;
  claim: Record<string, unknown>;
  evidence: {
    kind: string;
    ref: string;
    checked_at: string | null;
    signer: string | null;
    binding?: Record<string, unknown>;
  }[];
  targets: string[];
  is_trust_root: boolean;
  timestamp: string | null;
}

export interface ConfiguredIngress {
  mode: "configured";
  endpoint: string;
  token: string;
  log: string;
  agent: string;
  outboxPath: string;
  allowInsecure: boolean;
  fetch?: typeof fetch;
}
export type IngressConfig = ConfiguredIngress | { mode: "unconfigured" };

export interface GestureIO {
  stdin?: { isTTY?: boolean };
  stderr?: { isTTY?: boolean; write: (s: string) => void };
  readLine?: (prompt: string) => Promise<string>;
}

export interface BuildDeps {
  runCheck?: (opts: Record<string, unknown>) => Record<string, unknown>;
  gesture?: (target: string, io?: GestureIO) => Promise<void>;
  io?: GestureIO;
}

export interface FlushResult {
  sent: { id: string; type: string; outcome: string }[];
  refused: { id: string; type: string; message: string }[];
  pending: number;
  failure: string | null;
  busy: boolean;
}

export const UNCONFIGURED_NOTICE: string;
export const MASK_TOKEN: string;
export const DEFAULT_ENDPOINT: string;
export const EXIT: Readonly<{ ok: 0; error: 1; refused: 2; unrecorded: 3; gesture: 4 }>;

export class IngressError extends Error {
  code: number;
  constructor(message: string, code?: number);
}

export function resolveConfig(
  flags?: { log?: string; agent?: string; endpoint?: string; token?: string },
  env?: Record<string, string | undefined>,
): IngressConfig;
export function applyMask<T>(value: T, mask?: { literals?: string[]; patterns?: string[] }): T;
export function canonicalJson(v: unknown): string;
export function identityView(record: IngressRecord): Record<string, unknown>;
export function sha256Hex(data: string | Uint8Array): string;
export function emissionId(record: Omit<IngressRecord, "id"> & { id?: string }): string;
export function sameAct(a: IngressRecord, b: IngressRecord): boolean;
export function buildRecord(input: unknown, cfg: { agent: string }, deps?: BuildDeps): Promise<IngressRecord>;
export function normalizeRepo(url: string): string | null;
export function runBoundCheck(opts: {
  command: string;
  expectExit?: number;
  inputs?: Record<string, string> | string;
  output?: string;
  repo?: string;
  cwd?: string;
  log?: (s: string) => void;
  stdio?: "inherit" | "pipe";
}): Record<string, unknown>;
export function confirmHumanGesture(target: string, io?: GestureIO): Promise<void>;
export function sendRecord(
  cfg: ConfiguredIngress,
  record: IngressRecord,
): Promise<{ outcome: "recorded" | "already" | "refused" | "failed"; seq?: number; message?: string }>;
export function readOutbox(cfg: ConfiguredIngress): IngressRecord[];
export function flushOutbox(cfg: ConfiguredIngress): Promise<FlushResult>;
export function emit(
  input: unknown,
  cfg: IngressConfig,
  deps?: BuildDeps,
): Promise<{ configured: false; notice: string } | ({ configured: true; record: IngressRecord } & FlushResult)>;
