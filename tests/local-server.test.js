import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {request} from "node:http";
import {start} from "../local/server.js";

let server, base, port;
before(async () => { server = await start({port: 0, dataDir: mkdtempSync(join(tmpdir(), "orc-server-"))}); port = server.address().port; base = `http://127.0.0.1:${port}`; });
after(() => { server.closeAllConnections(); server.close(); });

const W = {"x-orc-board": "1", "content-type": "application/json"};
const api = async (method, path, body, headers = W) => { const r = await fetch(base + path, {method, headers, body: body && JSON.stringify(body)}); return {status: r.status, body: await r.json().catch(() => null)}; };
// fetch cannot set Host, so raw requests check the Host rule and literal ".." paths.
const raw = (path, headers = {}) => new Promise((ok, fail) => request({host: "127.0.0.1", port, path, headers}, res => { res.resume(); ok(res.statusCode); }).on("error", fail).end());

test("server: health", async () => {
  const {status, body} = await api("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(body.app, "orc-board");
  assert.equal(body.ok, true);
});

test("server: each db route, 404 and the 409 shape", async () => {
  assert.equal((await api("GET", "/api/db/cards/c1")).status, 404);
  assert.deepEqual((await api("PUT", "/api/db/cards/c1", {data: {title: "A", stages: []}})).body, {id: "c1", version: 1, data: {title: "A", stages: []}});
  assert.equal((await api("PATCH", "/api/db/cards/c1", {data: {note: "n"}, ifVersion: 1})).body.version, 2);
  assert.deepEqual((await api("POST", "/api/db/cards/c1/append", {field: "progress", value: {at: "t", text: "x"}})).body.data, {title: "A", stages: [], note: "n", progress: [{at: "t", text: "x"}]});
  const c = await api("PUT", "/api/db/cards/c1", {data: {}, ifVersion: 1});
  assert.equal(c.status, 409);
  assert.equal(c.body.error, "conflict");
  assert.equal(c.body.version, 3);
  assert.deepEqual((await api("GET", "/api/db/cards")).body.docs.map(d => [d.id, d.version]), [["c1", 3]]);
  assert.ok((await api("GET", "/api/db")).body.collections.includes("cards"));
  assert.equal((await api("POST", "/api/batch", {writes: [{op: "set", collection: "sessions", id: "s1", data: {t: 1}}, {op: "update", collection: "cards", id: "c1", data: {}, ifVersion: 9}]})).status, 409);
  assert.equal((await api("GET", "/api/db/sessions/s1")).status, 404);
  assert.equal((await api("POST", "/api/batch", {writes: [{op: "set", collection: "sessions", id: "s1", data: {t: 1}}]})).body.docs[0].version, 1);
  assert.equal((await api("DELETE", "/api/db/cards/c1?ifVersion=2")).status, 409);
  assert.equal((await api("DELETE", "/api/db/cards/c1?ifVersion=3")).status, 200);
  assert.equal((await api("GET", "/api/db/cards/c1")).status, 404);
  assert.equal((await api("PUT", "/api/db/cards/c1", {data: [1]})).status, 400);
  assert.equal((await api("PUT", "/api/db/cards/c1", null, {...W})).status, 400);
  assert.equal((await api("GET", "/api/db/cards/a%2Fb")).status, 404);
  assert.equal((await api("GET", "/api/db/cards/sp%20ace")).status, 400);
});

test("server: 403 without x-orc-board, without JSON, with a foreign Origin, with a bad Host", async () => {
  assert.equal((await api("PUT", "/api/db/cards/x", {data: {}}, {"content-type": "application/json"})).status, 403);
  assert.equal((await api("PUT", "/api/db/cards/x", {data: {}}, {"x-orc-board": "1", "content-type": "text/plain"})).status, 403);
  assert.equal((await api("PUT", "/api/db/cards/x", {data: {}}, {...W, origin: "http://evil.example"})).status, 403);
  assert.equal((await api("OPTIONS", "/api/db/cards/x", undefined, {origin: "http://evil.example"})).status, 403);
  assert.equal((await api("PUT", "/api/db/cards/x", {data: {}}, {...W, origin: base})).status, 200);
  assert.equal(await raw("/api/health", {host: "evil.example"}), 403);
  assert.equal(await raw("/api/health", {host: `localhost:${port}`}), 200);
  const r = await fetch(base + "/api/health");
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});

test("server: body cap of 2 MiB", async () => {
  assert.equal((await api("PUT", "/api/db/cards/big", {data: {s: "x".repeat(2.1 * 1024 * 1024)}})).status, 413);
});

test("server: static serving is limited to the page's files", async () => {
  // Read each body: an unread response keeps its connection busy, and on Node 22 the next fetch then waits on it until the server's keep-alive timeout.
  const status = async p => { const r = await fetch(base + p); await r.arrayBuffer(); return r.status; };
  assert.equal(await status("/css/tokens.css"), 200);
  assert.equal(await status("/js/main.js"), 200);
  for (const p of ["/dev/fixture.js", "/package.json", "/local/server.js", "/local/store.js", "/tests/model.test.js", "/README.md"]) assert.equal(await status(p), 404, p);
  for (const p of ["/css/../package.json", "/css/%2e%2e/package.json", "/js/..%5c..%5cpackage.json", "/../package.json"]) assert.notEqual(await raw(p), 200, p);
  const shim = await (await fetch(base + "/local/db-shim.js")).text();
  assert.match(shim, /function runQuery/);
  assert.doesNotMatch(shim, /^\s*export /m);
});

test("server: GET / wraps the real page and loads the shim before the page module", async () => {
  const html = await (await fetch(base + "/")).text();
  const shim = html.indexOf('<script src="local/db-shim.js">'), main = html.indexOf('<script type="module" src="js/main.js">');
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(shim > 0 && main > shim);
  assert.match(html, /<title>Orc-istrator<\/title>/);
});

test("server: an SSE client receives an event after a write", async () => {
  const ac = new AbortController();
  const r = await fetch(base + "/api/events", {signal: ac.signal});
  const reader = r.body.getReader(), dec = new TextDecoder();
  await reader.read(); // the ": connected" comment
  await api("POST", "/api/db/timeline/2026-10-19/append", {field: "events", value: {kind: "prompt"}});
  let text = "";
  while (!text.includes("\n\n")) text += dec.decode((await reader.read()).value);
  ac.abort();
  assert.match(text, /event: change\ndata: \{"collections":\["timeline"\]\}/);
});

test("server: 20 concurrent appends to one doc all land", async () => {
  await Promise.all(Array.from({length: 20}, (_, i) => api("POST", "/api/db/cards/race/append", {field: "progress", value: i})));
  const d = (await api("GET", "/api/db/cards/race")).body;
  assert.equal(d.version, 20);
  assert.deepEqual([...d.data.progress].sort((a, b) => a - b), Array.from({length: 20}, (_, i) => i));
});
