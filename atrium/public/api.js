/**
 * API client. Errors carry the server's own message — a 409 is the contract
 * guard speaking, and the UI shows it verbatim.
 */

const TOKEN_KEY = "stratum.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (t) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

async function call(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const message = (data && data.error) || `HTTP ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  return data;
}

export const api = {
  health: () => call("/api/health"),
  projection: (log, epoch) =>
    call(`/api/logs/${log}/projection${epoch !== undefined ? `?epoch=${epoch}` : ""}`),
  events: (log) => call(`/api/logs/${log}/events`),
  eventDetail: (log, id) => call(`/api/logs/${log}/events/${encodeURIComponent(id)}`),
  append: (log, record) =>
    call(`/api/logs/${log}/events`, { method: "POST", body: JSON.stringify(record) }),
  createPlayground: () => call("/api/playground", { method: "POST" }),
};
