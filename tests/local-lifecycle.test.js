import {test} from "node:test";
import assert from "node:assert/strict";
import {appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {createServer} from "node:net";
import {request} from "node:http";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {start, codeHash} from "../local/server.js";

const localDir = fileURLToPath(new URL("../local/", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "orc-life-"));
const freePort = () => new Promise(ok => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const run = (script, args, env) => new Promise(ok => {
  const p = spawn(process.execPath, [script, ...args], {env: {...process.env, ...env}, windowsHide: true});
  let out = "", err = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
  p.on("close", code => ok({code, out, err, json: (() => { try { return JSON.parse(out); } catch { return null; } })()}));
  p.stdin.end("");
});
const health = async port => { try { return await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(); } catch { return null; } };
// Kills only a server this test started, by the pid its own /api/health reports.
const cleanup = async port => { const h = await health(port); if (h?.app === "orc-board" && h.pid !== process.pid) try { process.kill(h.pid); } catch { /* gone */ } };
const post = (port, headers, host = `127.0.0.1:${port}`) => new Promise((ok, fail) => {
  const r = request({host: "127.0.0.1", port, path: "/api/shutdown", method: "POST", headers: {host, ...headers}}, res => { res.resume(); ok(res.statusCode); });
  r.on("error", fail); r.end("{}");
});

test("server: health reports started and the code hash", async () => {
  const s = await start({port: 0, dataDir: join(tmp(), "data")});
  try {
    const h = await health(s.address().port);
    assert.match(h.started, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    assert.equal(h.code, codeHash());
    assert.match(h.code, /^[0-9a-f]{12}$/);
  } finally { s.closeAllConnections(); s.close(); }
});

test("server: /api/shutdown rejects no header, a foreign Origin and a bad Host, then stops on a proper request", async () => {
  let stopped = false;
  const s = await start({port: 0, dataDir: join(tmp(), "data"), onShutdown: () => { stopped = true; }});
  const port = s.address().port, J = {"content-type": "application/json"};
  try {
    assert.equal(await post(port, J), 403);
    assert.equal(await post(port, {"x-orc-board": "1"}), 403);
    assert.equal(await post(port, {...J, "x-orc-board": "1", origin: "http://evil.example"}), 403);
    assert.equal(await post(port, {...J, "x-orc-board": "1"}, "evil.example"), 403);
    assert.equal(await health(port) !== null, true);
    assert.equal(await post(port, {...J, "x-orc-board": "1"}), 200);
    await new Promise(r => s.listening ? s.once("close", r) : r());
    assert.equal(stopped, true);
    assert.equal(await health(port), null);
  } finally { s.closeAllConnections(); s.close(); }
});

test("cli: status exits 3 when down and 0 when up; restart replaces the pid; stop frees the port; url says when nothing runs", async () => {
  const port = await freePort(), dir = tmp(), data = join(dir, "data"), cli = join(localDir, "board.js"), env = {ORC_BOARD_PORT: String(port)};
  try {
    const u = await run(cli, ["url"], env);
    assert.equal(u.code, 0);
    assert.match(u.err, /nothing is running on port/);
    assert.equal((await run(cli, ["status", "--data", data], env)).code, 3);
    assert.equal((await run(cli, ["list", "sessions", "--data", data], env)).code, 0);
    const h = await health(port);
    assert.equal(h.dataDir, resolve(data));
    assert.ok(existsSync(join(dir, "server.log")), "the detached server logs beside the data dir");
    await run(cli, ["session", "start", "s1", "--title", "t", "--data", data], env);
    const st = await run(cli, ["status", "--data", data], env);
    assert.equal(st.code, 0, st.err);
    assert.equal(st.json.pid, h.pid);
    assert.deepEqual(st.json.counts, {sessions: 1});
    assert.equal(st.json.stale, false);
    assert.equal(st.json.started, h.started);
    assert.match((await run(cli, ["status", "--data", tmp()], env)).err, /uses data dir/);
    const r = await run(cli, ["restart", "--data", data], env);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.json.previousPid, h.pid);
    assert.notEqual((await health(port)).pid, h.pid);
    const s = await run(cli, ["stop", "--data", data], env);
    assert.equal(s.code, 0, s.err);
    assert.equal(await health(port), null);
    assert.equal((await run(cli, ["status"], env)).code, 3);
    assert.equal((await run(cli, ["stop"], env)).code, 3);
  } finally { await cleanup(port); }
});

test("cli: a server running older code is stale (status 4) and the next command restarts it once", async () => {
  const copy = join(tmp(), "board"), port = await freePort(), data = join(tmp(), "data"), env = {ORC_BOARD_PORT: String(port), ORC_BOARD_DATA: data};
  cpSync(localDir, join(copy, "local"), {recursive: true});
  const cli = join(copy, "local", "board.js");
  try {
    assert.equal((await run(cli, ["list", "sessions"], env)).code, 0);
    const before = await health(port);
    assert.equal((await run(cli, ["status"], env)).code, 0);
    appendFileSync(join(copy, "local", "lint.js"), "\n// changed\n");
    const st = await run(cli, ["status"], env);
    assert.equal(st.code, 4);
    assert.equal(st.json.stale, true);
    assert.equal((await run(cli, ["--no-start", "list", "sessions"], env)).code, 0);
    assert.equal((await health(port)).pid, before.pid, "--no-start does not restart");
    const r = await run(cli, ["list", "sessions"], env);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.err.trim().split("\n").length, 1);
    assert.match(r.err, /runs older code; restarting it/);
    const after = await health(port);
    assert.notEqual(after.pid, before.pid);
    assert.equal((await run(cli, ["status"], env)).code, 0);
    assert.equal((await run(cli, ["list", "sessions"], env)).err, "");
    assert.equal((await run(cli, ["stop"], env)).code, 0);
  } finally { await cleanup(port); }
});

test("cli: a server that fails to start prints the end of server.log", async () => {
  const copy = join(tmp(), "board"), port = await freePort(), dir = tmp(), env = {ORC_BOARD_PORT: String(port), ORC_BOARD_DATA: join(dir, "data")};
  cpSync(localDir, join(copy, "local"), {recursive: true});
  // The CLI imports the same modules, so the copy throws only when its entry script is the server.
  writeFileSync(join(copy, "local", "ops.js"), 'export const applyOp = 0, isoNow = () => "";\nif (/server\.js$/.test(process.argv[1])) throw new Error("boom at startup");\n');
  try {
    const r = await run(join(copy, "local", "board.js"), ["list", "sessions"], env);
    assert.equal(r.code, 1);
    assert.match(r.err, /did not answer within 5 s; last lines of/);
    assert.match(r.err, /boom at startup/);
    assert.match(readFileSync(join(dir, "server.log"), "utf8"), /boom at startup/);
  } finally { await cleanup(port); }
});
