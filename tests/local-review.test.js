import {test} from "node:test";
import assert from "node:assert/strict";
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {createServer} from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import {openStore} from "../local/store.js";
import {createFeed} from "../local/query.js";
import {portFrom, start} from "../local/server.js";

const localDir = fileURLToPath(new URL("../local/", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "orc-review-"));
const run = (args, env, opts = {}) => new Promise(ok => {
  const p = spawn(process.execPath, args, {env: {...process.env, ...env}, windowsHide: true, ...opts});
  let out = "", err = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
  p.on("close", code => ok({code, out, err}));
  p.stdin.end("");
});
const freePort = () => new Promise(ok => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const closeServer = s => { s.closeAllConnections(); s.close(); };

test("store: a corrupt doc, a stray name and leftover .tmp files are skipped by list and collections", () => {
  const s = openStore(tmp());
  s.set("cards", "good", {a: 1});
  s.set("cards", "bad", {a: 2});
  const dir = join(s.dir, "cards");
  writeFileSync(join(dir, "bad.json"), "{nope");
  writeFileSync(join(dir, "empty.json"), "");
  writeFileSync(join(dir, "shape.json"), JSON.stringify({version: "1", data: []}));
  writeFileSync(join(dir, "%zz.json"), JSON.stringify({version: 1, data: {}}));
  writeFileSync(join(dir, "good.json.123.456.tmp"), "partial");
  mkdirSync(join(s.dir, "%zz"));
  assert.deepEqual(s.list("cards").map(d => d.id), ["good"]);
  assert.deepEqual(s.collections(), ["cards"]);
  assert.throws(() => s.get("cards", "bad"), e => e.code === "corrupt" && /cards\/bad/.test(e.message));
  assert.throws(() => s.get("cards", "shape"), e => e.code === "corrupt");
});

// Root ignores file and folder permissions, so the injected failure never happens (CI containers often run as root).
test("store: a batch whose second write fails restores the first doc", {skip: process.getuid?.() === 0 && "running as root: chmod cannot make a write fail"}, () => {
  const s = openStore(tmp());
  s.set("cards", "c1", {a: 1});
  s.set("locked", "c2", {b: 1});
  s.set("cards", "c3", {c: 1});
  // Windows refuses a rename over a read-only file; POSIX allows that, so there the folder is made read-only instead.
  const locked = process.platform === "win32" ? join(s.dir, "locked", "c2.json") : join(s.dir, "locked");
  chmodSync(locked, process.platform === "win32" ? 0o444 : 0o555);
  try {
    assert.throws(() => s.batch([{op: "update", collection: "cards", id: "c1", data: {a: 2}}, {op: "set", collection: "new", id: "n1", data: {x: 1}},
      {op: "update", collection: "locked", id: "c2", data: {b: 2}}, {op: "update", collection: "cards", id: "c3", data: {c: 2}}]));
  } finally { chmodSync(locked, process.platform === "win32" ? 0o644 : 0o755); }
  assert.deepEqual(s.get("cards", "c1"), {id: "c1", version: 1, data: {a: 1}});
  assert.equal(s.get("new", "n1"), null);
  assert.deepEqual(s.get("locked", "c2"), {id: "c2", version: 1, data: {b: 1}});
  assert.deepEqual(s.get("cards", "c3"), {id: "c3", version: 1, data: {c: 1}});
});

test("store: __proto__ is rejected as a collection or doc id", () => {
  const s = openStore(tmp());
  assert.throws(() => s.set("cards", "__proto__", {}), e => e.code === "invalid");
  assert.throws(() => s.set("__proto__", "c1", {}), e => e.code === "invalid");
  assert.equal(s.set("cards", "constructor", {}).version, 1);
});

test("feed: one load per collection for all its subscriptions; a stale response that lands last is dropped", async () => {
  const pending = [];
  const feed = createFeed(name => new Promise(ok => pending.push({name, ok})));
  const a = [], b = [];
  feed.subscribe("cards", [["s", "==", 1]], null, snap => a.push(snap.docs.map(d => d.id)));
  feed.subscribe("cards", [], ["n", "desc"], snap => b.push(snap.docs.map(d => d.id)));
  assert.equal(pending.length, 2); // each subscribe loads; only the newest counts
  pending[1].ok([{id: "x", data: {s: 1, n: 1}}]);
  await new Promise(r => setTimeout(r));
  pending[0].ok([{id: "stale", data: {s: 1, n: 9}}]);
  await new Promise(r => setTimeout(r));
  assert.deepEqual(a, [["x"]]);
  assert.deepEqual(b, [["x"]]);
  // Two overlapping refreshes: the newer resolves first, the older must not overwrite it.
  feed.refresh("cards"); feed.refresh("cards");
  assert.equal(pending.length, 4);
  pending[3].ok([{id: "x", data: {s: 1, n: 1}}, {id: "y", data: {s: 1, n: 2}}]);
  await new Promise(r => setTimeout(r));
  pending[2].ok([{id: "old", data: {s: 1, n: 0}}]);
  await new Promise(r => setTimeout(r));
  assert.deepEqual(a, [["x"], ["x", "y"]]);
  assert.deepEqual(b, [["x"], ["y", "x"]]);
  // An unchanged result is not delivered again.
  feed.refresh("cards");
  pending[4].ok([{id: "x", data: {s: 1, n: 1}}, {id: "y", data: {s: 1, n: 2}}]);
  await new Promise(r => setTimeout(r));
  assert.equal(a.length, 2);
});

test("shim: the served shim refreshes on the first open and makes one GET per changed collection", async () => {
  const server = await start({port: 0, dataDir: tmp()});
  try {
    const code = await (await fetch(`http://127.0.0.1:${server.address().port}/local/db-shim.js`)).text();
    const gets = [], sources = [];
    let docs = [];
    class FakeES { constructor(){ this.l = {}; sources.push(this); } addEventListener(t, f){ this.l[t] = f; } }
    const ctx = {window: {}, EventSource: FakeES, fetch: async url => { gets.push(url); const body = {docs}; return {ok: true, json: async () => body}; }, setTimeout};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const db = await ctx.window.claude.use("db");
    const seen = [];
    db.collection("cards").where("session", "==", "s1").onSnapshot(s => seen.push(["w", s.docs.length]));
    db.collection("cards").onSnapshot(s => seen.push(["all", s.docs.length]));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(sources.length, 1);
    // A write lands before the stream registers: the first open must pick it up.
    docs = [{id: "c1", version: 1, data: {session: "s1"}}];
    gets.length = 0;
    sources[0].l.open();
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(gets, ["/api/db/cards"]);
    assert.deepEqual(seen, [["w", 0], ["all", 0], ["w", 1], ["all", 1]]);
    gets.length = 0;
    docs = [...docs, {id: "c2", version: 1, data: {session: "s2"}}];
    sources[0].l.change({data: JSON.stringify({collections: ["cards"]})});
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(gets, ["/api/db/cards"]);
    assert.deepEqual(seen.slice(4), [["all", 2]]);
  } finally { closeServer(server); }
});

test("server: portFrom rejects --port with no value; health reports the resolved data dir; a corrupt doc is a 500", async () => {
  assert.throws(() => portFrom(["--port"]), /needs a value/);
  assert.throws(() => portFrom(["--port", "--no-start"]), /needs a value/);
  assert.throws(() => portFrom(["--port", "abc"]));
  const dir = tmp(), server = await start({port: 0, dataDir: dir});
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await (await fetch(base + "/api/health")).json()).dataDir, resolve(dir));
    mkdirSync(join(dir, "cards")); writeFileSync(join(dir, "cards", "bad.json"), "{");
    assert.equal((await fetch(base + "/api/db/cards/bad")).status, 500);
    assert.deepEqual((await (await fetch(base + "/api/db/cards")).json()).docs, []);
  } finally { closeServer(server); }
});

test("cli: a batch conflict names the entry and doc; a server on another data dir is refused", async () => {
  const dir = tmp(), server = await start({port: 0, dataDir: dir});
  try {
    const env = {ORC_BOARD_PORT: String(server.address().port), ORC_BOARD_DATA: dir};
    const file = join(tmp(), "b.json");
    writeFileSync(file, JSON.stringify({writes: [{op: "set", collection: "sessions", id: "s1", data: {}}, {op: "update", collection: "cards", id: "c9", data: {}, ifVersion: 4}]}));
    const c = await run([join(localDir, "board.js"), "batch", "--file", file], env);
    assert.equal(c.code, 2);
    assert.match(c.err, /current version is 0/);
    assert.match(c.err, /entry 2: cards\/c9/);
    const other = await run([join(localDir, "board.js"), "list", "cards"], {...env, ORC_BOARD_DATA: tmp()});
    assert.equal(other.code, 1);
    assert.match(other.err, /uses data dir/);
    assert.equal((await run([join(localDir, "board.js"), "list", "cards"], {...env, ORC_BOARD_DATA: dir.toUpperCase()})).code, process.platform === "win32" ? 0 : 1);
  } finally { closeServer(server); }
});

test("cli: runs through a junction, and an auto-started server does not hold the caller's cwd", async () => {
  const link = join(tmp(), "link");
  symlinkSync(localDir, link, "junction");
  const free = await freePort();
  const u = await run([join(link, "board.js"), "url"], {ORC_BOARD_PORT: String(free)});
  assert.equal(u.code, 0, u.err);
  assert.equal(u.out.trim(), `http://localhost:${free}/`);
  const port = await freePort(), cwd = tmp(), data = tmp();
  const r = await run([join(localDir, "board.js"), "list", "sessions"], {ORC_BOARD_PORT: String(port), ORC_BOARD_DATA: data}, {cwd});
  let pid;
  try {
    assert.equal(r.code, 0, r.err);
    pid = (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).pid;
    rmSync(cwd, {recursive: true}); // throws EBUSY on Windows if the server's cwd is this dir
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
  } finally { if (pid) process.kill(pid); }
});
