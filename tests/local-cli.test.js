import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, writeFileSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {start} from "../local/server.js";

const cli = fileURLToPath(new URL("../local/board.js", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "orc-cli-"));
let server, env;
before(async () => { const data = tmp(); server = await start({port: 0, dataDir: data}); env = {...process.env, ORC_BOARD_PORT: String(server.address().port), ORC_BOARD_DATA: data}; });
after(() => { server.closeAllConnections(); server.close(); });

const run = (args, input, e = env) => new Promise(ok => {
  const p = spawn(process.execPath, [cli, ...args], {env: e, windowsHide: true});
  let out = "", err = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
  p.on("close", code => ok({code, out, err, json: (() => { try { return JSON.parse(out); } catch { return null; } })()}));
  p.stdin.end(input ?? "");
});

test("cli: set via --stdin, get, append, update", async () => {
  const card = {session: "2026-10-20-acmeapp-18018-tab-strips", order: 1, title: "Tab restyle", stages: [{label: "Build", state: "pending"}]};
  const s = await run(["set", "cards/18019", "--stdin"], JSON.stringify(card));
  assert.equal(s.code, 0, s.err);
  assert.equal(s.json.version, 1);
  assert.deepEqual((await run(["get", "cards/18019"])).json.data, card);
  const a = await run(["append", "cards/18019", "progress", "--stdin"], '{"at":"2026-10-20T12:05:00-04:00","text":"build green"}');
  assert.deepEqual(a.json.data.progress, [{at: "2026-10-20T12:05:00-04:00", text: "build green"}]);
  assert.equal((await run(["update", "cards/18019", "--data", '{"note":"ok"}', "--if-version", "2"])).json.version, 3);
  assert.equal((await run(["list", "cards"])).json.docs.length, 1);
});

test("cli: a conflict exits 2 and names the current version; bad input exits 1", async () => {
  await run(["set", "cards/k", "--data", "{}"]);
  const c = await run(["update", "cards/k", "--data", '{"a":1}', "--if-version", "7"]);
  assert.equal(c.code, 2);
  assert.match(c.err, /current version is 1/);
  assert.equal((await run(["set", "cards/k", "--data", "{nope"])).code, 1);
  assert.equal((await run(["get", "cards"])).code, 1);
  assert.equal((await run(["get", "cards/missing"])).code, 1);
});

test("cli: export/import round-trips real-shaped docs (batch, nested arrays, timeline)", async () => {
  const file = join(tmp(), "batch.json");
  writeFileSync(file, JSON.stringify({writes: [
    {op: "set", collection: "sessions", id: "2026-10-19-acmeapp-search", data: {title: "Header search", status: "building", events: [{at: "2026-10-19T08:00:00-04:00", text: "Spec", sub: [{at: "2026-10-19T08:05:00-04:00", text: "read"}], card: "c2"}]}},
    {op: "set", collection: "timeline", id: "2026-10-19", data: {date: "2026-10-19", events: [{at: "2026-10-19T08:05:00-04:00", kind: "prompt", session: "sA", ticket: "APP-17983"}], sessions: {sA: {project: "AcmeApp"}}}}]}));
  assert.equal((await run(["batch", "--file", file])).code, 0);
  const out = join(tmp(), "export.json");
  assert.equal((await run(["export", "--out", out])).code, 0);
  const all = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(all.timeline["2026-10-19"].sessions.sA.project, "AcmeApp");
  // Import into a second, empty server and compare its export.
  const data2 = tmp(), s2 = await start({port: 0, dataDir: data2});
  try {
    const e2 = {...process.env, ORC_BOARD_PORT: String(s2.address().port), ORC_BOARD_DATA: data2};
    assert.equal((await run(["import", out], "", e2)).json.imported, Object.values(all).reduce((n, c) => n + Object.keys(c).length, 0));
    assert.deepEqual((await run(["export"], "", e2)).json, all);
  } finally { s2.closeAllConnections(); s2.close(); }
});

test("cli: --no-start fails clearly; auto-start starts a server on a free port", async () => {
  const port = await new Promise(ok => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const e = {...process.env, ORC_BOARD_PORT: String(port), ORC_BOARD_DATA: tmp()};
  const n = await run(["--no-start", "get", "sessions/x"], "", e);
  assert.equal(n.code, 1);
  assert.match(n.err, /no board server/);
  const a = await run(["list", "sessions"], "", e);
  let pid;
  try {
    assert.equal(a.code, 0, a.err);
    assert.deepEqual(a.json, {docs: []});
    pid = (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).pid;
    assert.notEqual(pid, process.pid);
  } finally { if (pid) process.kill(pid); }
});

test("cli: a port that answers but is not the board fails naming ORC_BOARD_PORT", async () => {
  const other = await new Promise(ok => { const s = createServer(c => c.end("HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\n{}")).listen(0, "127.0.0.1", () => ok(s)); });
  try {
    const r = await run(["list", "sessions"], "", {...env, ORC_BOARD_PORT: String(other.address().port)});
    assert.equal(r.code, 1);
    assert.match(r.err, /ORC_BOARD_PORT/);
  } finally { other.close(); }
});
