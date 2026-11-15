// Local stand-in for checkmate's hub: a port of src/hub.ts handleLedgerAnchor +
// listLedgerAnchors (f8c7ad4), requiring the Access service-token headers.
import http from "node:http";
const anchors = [], incidents = [];
let n = 0;
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const u = new URL(req.url, "http://x");
    console.log(JSON.stringify({ hub_saw: req.method, path: u.pathname, ledger: u.searchParams.get("ledger"), body: raw || null,
      access: req.headers["cf-access-client-id"] === "smoke-id" && req.headers["cf-access-client-secret"] === "smoke-secret" }));
    if (u.pathname === "/_state") return send(res, 200, { anchors, incidents });
    if (req.headers["cf-access-client-id"] !== "smoke-id" || req.headers["cf-access-client-secret"] !== "smoke-secret") return send(res, 401, { error: "unauthorized" });
    if (req.method === "GET" && u.pathname === "/api/hub/ledger-anchors") {
      const l = u.searchParams.get("ledger");
      return send(res, 200, anchors.filter((a) => a.ledger === l).sort((a, b) => a.rows - b.rows || a.at - b.at));
    }
    if (req.method === "POST" && u.pathname === "/api/hub/ledger-anchor") {
      const b = JSON.parse(raw); const prevHead = b.prevHead ?? null;
      const last = anchors.filter((a) => a.ledger === b.ledger).sort((x, y) => y.rows - x.rows || y.at - x.at)[0];
      if (last && b.rows === last.rows && b.head === last.head) return send(res, 200, { ok: true, unchanged: true, rows: b.rows, head: b.head });
      let refusal = null;
      if (last && b.rows <= last.rows) refusal = "ledger-regression";
      else if (last && prevHead !== last.head) refusal = "ledger-fork";
      if (refusal) { const id = `inc_${++n}`; incidents.push({ id, kind: refusal }); return send(res, 409, { error: refusal, incident: id, anchored: { rows: last.rows, head: last.head } }); }
      const id = `lan_${++n}`; anchors.push({ id, at: Date.now(), ledger: b.ledger, rows: b.rows, head: b.head, prev_head: last ? prevHead : null, by: "agent" });
      return send(res, 200, { ok: true, id, rows: b.rows, head: b.head });
    }
    send(res, 404, { error: "not found" });
  });
}).listen(8799, "127.0.0.1", () => console.log("hub listening 8799"));
