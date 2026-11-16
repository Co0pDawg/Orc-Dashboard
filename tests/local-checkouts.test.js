// Two checkouts on one port, restarts that keep the data dir, writers across a restart, and where the log goes.
import {test} from "node:test";
import assert from "node:assert/strict";
import {appendFileSync, cpSync, existsSync, mkdtempSync, statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {createServer} from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const localDir = fileURLToPath(new URL("../local/", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "orc-co-"));
const freePort = () => new Promise(ok => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
// No ORC_BOARD_DATA from the parent: each call names its data dir or relies on the running server's.
const baseEnv = (() => { const e = {...process.env}; delete e.ORC_BOARD_DATA; return e; })();
const run = (script, args, env) => new Promise(ok => {
  const p = spawn(process.execPath, [script, ...args], {env: {...baseEnv, ...env}, windowsHide: true});
  let out = "", err = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
  p.on("close", code => ok({code, out, err, json: (() => { try { return JSON.parse(out); } catch { return null; } })()}));
  p.stdin.end("");
});
const health = async port => { try { return await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(); } catch { return null; } };
const cleanup = async port => { const h = await health(port); if (h?.app === "orc-board" && h.pid !== process.pid) try { process.kill(h.pid); } catch { /* gone */ } };
const copyOf = name => { const dir = join(tmp(), name); cpSync(localDir, join(dir, "local"), {recursive: true}); return join(dir, "local"); };

test("cli: two checkouts on one port never restart each other's server; status names the other checkout", async () => {
  const a = copyOf("a"), b = copyOf("b"), port = await freePort(), data = join(tmp(), "data"), env = {ORC_BOARD_PORT: String(port)};
  appendFileSync(join(b, "lint.js"), "\n// checkout B is at another version\n");
  try {
    assert.equal((await run(join(a, "board.js"), ["session", "start", "s1", "--title", "t", "--data-dir", data], env)).code, 0);
    const first = await health(port);
    let notices = 0;
    for (let i = 0; i < 10; i++){
      const side = i % 2 ? b : a, r = await run(join(side, "board.js"), ["progress", "c-none", "x"], env);
      if (/runs code from .*; this CLI is .*; using the running server/.test(r.err)) notices++;
      assert.doesNotMatch(r.err, /restarting/);
      assert.equal((await health(port)).pid, first.pid, `call ${i} restarted the server`);
    }
    assert.equal(notices, 5);
    const st = await run(join(b, "board.js"), ["status"], env);
    assert.equal(st.code, 0, st.err);
    assert.equal(st.json.otherCheckout, true);
    assert.equal(st.json.stale, false);
    const r = await run(join(b, "board.js"), ["restart"], env);
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /using the running server/);
    assert.equal((await health(port)).dataDir, resolve(data));
  } finally { await cleanup(port); }
});

test("cli: a same-checkout code change restarts once and keeps the running server's data dir; a different explicit data dir is refused first", async () => {
  const a = copyOf("a"), port = await freePort(), data = join(tmp(), "data"), env = {ORC_BOARD_PORT: String(port)};
  try {
    assert.equal((await run(join(a, "board.js"), ["session", "start", "s1", "--title", "kept", "--data-dir", data], env)).code, 0);
    const before = await health(port);
    appendFileSync(join(a, "lint.js"), "\n// changed\n");
    const other = await run(join(a, "board.js"), ["get", "sessions/s1", "--data-dir", join(tmp(), "elsewhere")], env);
    assert.equal(other.code, 1);
    assert.match(other.err, /uses data dir/);
    assert.equal((await health(port)).pid, before.pid, "refused before anything was stopped");
    const r = await run(join(a, "board.js"), ["get", "sessions/s1"], env); // no data flag, no ORC_BOARD_DATA
    assert.equal(r.code, 0, r.err);
    assert.equal(r.json.data.title, "kept");
    assert.equal((r.err.match(/restarting it/g) || []).length, 1);
    const after = await health(port);
    assert.notEqual(after.pid, before.pid);
    assert.equal(after.dataDir, resolve(data));
    assert.equal((await run(join(a, "board.js"), ["get", "sessions/s1"], env)).err, "");
    assert.equal((await health(port)).pid, after.pid);
    // An explicit restart also keeps the running server's data dir.
    assert.equal((await run(join(a, "board.js"), ["restart"], env)).code, 0);
    assert.equal((await health(port)).dataDir, resolve(data));
  } finally { await cleanup(port); }
});

test("cli: 24 parallel writers across a same-checkout restart: each line is stored once iff its writer succeeded", async () => {
  const a = copyOf("a"), port = await freePort(), data = join(tmp(), "data"), env = {ORC_BOARD_PORT: String(port), ORC_BOARD_DATA: data};
  const cli = join(a, "board.js");
  try {
    assert.equal((await run(cli, ["session", "start", "s1", "--title", "t"], env)).code, 0);
    assert.equal((await run(cli, ["card", "add", "c1", "--session", "s1", "--title", "t", "--stages", "Build"], env)).code, 0);
    appendFileSync(join(a, "ops.js"), "\n// changed\n");
    const results = await Promise.all(Array.from({length: 24}, (_, i) => run(cli, ["progress", "c1", `line ${i}`], env)));
    const card = (await run(cli, ["get", "cards/c1"], env)).json.data;
    const lines = (card.progress || []).map(l => l.text);
    let ok = 0, failed = 0;
    results.forEach((r, i) => {
      const n = lines.filter(t => t === `line ${i}`).length;
      if (r.code === 0){ ok++; assert.equal(n, 1, `line ${i} succeeded but is stored ${n} times`); }
      else { failed++; assert.equal(n, 0, `line ${i} failed (${r.err.trim()}) but is stored`); }
    });
    assert.equal(ok + failed, 24);
    assert.equal(lines.length, ok);
    assert.ok(ok > 0);
    const h = await health(port);
    assert.equal(h.dataDir, resolve(data));
    assert.equal((await run(cli, ["status"], env)).code, 0);
    console.log(`writers across restart: ${ok} succeeded, ${failed} failed`);
  } finally { await cleanup(port); }
});

test("cli: an auto-started server logs inside its data dir and never into the folder above it", async () => {
  const port = await freePort(), data = tmp(), env = {ORC_BOARD_PORT: String(port), ORC_BOARD_DATA: data}; // data directly under the OS temp dir
  const outside = join(tmpdir(), "server.log"), before = existsSync(outside) ? statSync(outside).mtimeMs : null;
  try {
    assert.equal((await run(join(localDir, "board.js"), ["list", "sessions"], env)).code, 0);
    assert.ok(existsSync(join(data, ".server.log")));
    assert.equal(existsSync(outside) ? statSync(outside).mtimeMs : null, before, "a server.log was written to the OS temp dir");
    assert.deepEqual((await run(join(localDir, "board.js"), ["get", "sessions/none"], env)).code, 1);
    assert.deepEqual((await (await fetch(`http://127.0.0.1:${port}/api/db`)).json()).collections, []);
  } finally { await cleanup(port); }
});
