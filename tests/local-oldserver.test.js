// Stand-in servers on free ports: one from before /api/op and /api/shutdown, one that refuses a shutdown (412).
import {test, after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const cli = fileURLToPath(new URL("../local/board.js", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "orc-old-"));
// argv: <mode> <dataDir>. Prints the port it got. "old": the first-release health shape, 404 for everything else.
// "busy": a current-looking health, and a 412 for /api/shutdown.
const script = join(tmp, "standin.mjs");
writeFileSync(script, `import {createServer} from "node:http";
const [mode, dataDir] = process.argv.slice(2);
const s = createServer((req, res) => {
  const send = (code, body) => res.writeHead(code, {"content-type": "application/json"}).end(JSON.stringify(body));
  if (req.url === "/api/health") return send(200, mode === "old" ? {ok: true, app: "orc-board", version: 1, pid: process.pid, dataDir}
    : {ok: true, app: "orc-board", version: 1, pid: process.pid, dataDir, started: "x", code: "x"});
  if (mode === "busy" && req.method === "POST" && req.url === "/api/shutdown") return send(412, {error: "pid mismatch"});
  send(404, {error: "not found"});
}).listen(0, "127.0.0.1", () => console.log(s.address().port));
`);

const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const kids = [];
async function standin(mode, dataDir){
  const p = spawn(process.execPath, [script, mode, dataDir], {windowsHide: true});
  kids.push(p);
  const port = await new Promise(ok => p.stdout.once("data", d => ok(Number(String(d).trim()))));
  return {pid: p.pid, port};
}
const run = (args, env) => new Promise(done => {
  const p = spawn(process.execPath, [cli, ...args], {env: {...process.env, ...env}, windowsHide: true});
  let out = "", err = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
  p.on("close", code => done({code, out, err, json: (() => { try { return JSON.parse(out); } catch { return null; } })()}));
  p.stdin.end("");
});
const envFor = (port, dir) => ({ORC_BOARD_PORT: String(port), ORC_BOARD_DATA: dir});
// Stops whatever the CLI left running on a port, by the pid its own health reports.
const cleanup = async port => { await run(["stop"], {ORC_BOARD_PORT: String(port)}); };
after(() => kids.forEach(k => { try { k.kill(); } catch {} }));

test("old server: a high-level command restarts a server with no code hash on its data dir, killing it by pid", async () => {
  const dir = resolve(join(tmp, "data-auto")), old = await standin("old", dir), env = envFor(old.port, dir);
  const r = await run(["session", "start", "s-old", "--title", "after the old server"], env);
  try {
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /too old for \/api\/shutdown; stopping it by pid/);
    assert.equal(r.json.id, "s-old");
    assert.equal(alive(old.pid), false, "the old server was killed");
    const g = await run(["get", "sessions/s-old"], env);
    assert.equal(g.json.data.title, "after the old server", "the new server reuses the old one's data dir");
    assert.notEqual((await run(["status"], env)).json.pid, old.pid);
  } finally { await cleanup(old.port); }
});

test("old server: stop and restart fall back to killing the pid on a 404 from /api/shutdown", async () => {
  const dir = resolve(join(tmp, "data-stop")), a = await standin("old", dir);
  const s = await run(["stop"], envFor(a.port, dir));
  assert.equal(s.code, 0, s.err);
  assert.deepEqual(s.json, {stopped: true, pid: a.pid});
  assert.match(s.err, /stopping it by pid/);
  assert.equal(alive(a.pid), false);
  const b = await standin("old", dir);
  try {
    const r = await run(["restart"], envFor(b.port, dir));
    assert.equal(r.code, 0, r.err);
    assert.equal(r.json.restarted, true);
    assert.equal(r.json.previousPid, b.pid);
    assert.equal(alive(b.pid), false);
    assert.notEqual(r.json.pid, b.pid);
  } finally { await cleanup(b.port); }
});

test("stop and restart do not report success while the server still answers after a 412", async () => {
  const dir = resolve(join(tmp, "data-busy")), a = await standin("busy", dir), env = envFor(a.port, dir);
  const s = await run(["stop"], env);
  assert.equal(s.code, 1);
  assert.deepEqual(s.json, {stopped: false, running: true, pid: a.pid});
  const r = await run(["restart"], env);
  assert.equal(r.code, 1);
  assert.match(r.err, /did not stop; not restarting/);
  assert.equal(r.json, null);
  assert.equal(alive(a.pid), true, "the server was left alone");
});
