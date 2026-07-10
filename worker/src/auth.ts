/**
 * Bearer auth + log visibility rules.
 *
 * demo           — public read, authed write (the curated exhibit)
 * playground-*   — public read AND write (per-visitor sandboxes, capped)
 * anything else  — authed read and write (private workspace logs)
 */

const LOG_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const isValidLogId = (id: string): boolean => LOG_ID.test(id);
export const isPlayground = (id: string): boolean => id.startsWith("playground-");
export const isPublicRead = (id: string): boolean => id === "demo" || isPlayground(id);

export async function bearerOk(req: Request, token: string): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || token.length === 0) return false;
  const presented = header.slice("Bearer ".length).trim();
  // Compare SHA-256 digests: fixed length, no early-exit timing signal.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(presented)),
    crypto.subtle.digest("SHA-256", enc.encode(token)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i]! ^ bv[i]!;
  return diff === 0;
}

export const canRead = (logId: string, authed: boolean): boolean =>
  isPublicRead(logId) || authed;

export const canWrite = (logId: string, authed: boolean): boolean =>
  isPlayground(logId) || authed;
