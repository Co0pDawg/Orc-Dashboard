// Prune touch sources, exact cascade, append guards, strict dates, legacy stages, string fields, feed timers, store dirs.
import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import {start} from "../local/server.js";
import {openStore} from "../local/store.js";
import {lint} from "../local/lint.js";
import {createFeed} from "../local/query.js";

const cli = fileURLToPath(new URL("../local/board.js", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "orc-rework-"));
let server, env;
before(async () => { const data = join(tmp(), "data"); server = await start({port: 0, dataDir: data}); env = {...process.env, ORC_BOARD_PORT: String(server.address().port), ORC_BOARD_DATA: data}; });
after(() => { server.closeAllConnections(); server.close(); });

const run = (args, input, e = env) => new Promise(done => {
  const p = spawn(process.execPath, [cli, "--no-start", ...args], {env: e, windowsHide: true});
  let out = "", err = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
  p.on("close", code => done({code, out, err, json: (() => { try { return JSON.parse(out); } catch { return null; } })()}));
  p.stdin.end(input ?? "");
});
const get = async ref => (await run(["get", ref])).json;
const ok = r => { assert.equal(r.code, 0, r.err); return r.json; };

test("cli: prune keeps a finished session touched recently by a card progress line, an event, a sub-event or a stage start", async () => {
  const d = join(tmp(), "data"), s = await start({port: 0, dataDir: d});
  const e = {...process.env, ORC_BOARD_PORT: String(s.address().port), ORC_BOARD_DATA: d};
  try {
    const old = "2026-01-10T10:00:00-05:00", recent = "2026-10-01T10:00:00-04:00";
    const sess = id => ({op: "set", collection: "sessions", id, data: {title: id, status: "Done", completed: old, started: old, updated: old, events: []}});
    const card = (id, session, extra = {}) => ({op: "set", collection: "cards", id, data: {session, title: id, updated: old, stages: [{label: "Build", state: "done"}], ...extra}});
    ok(await run(["batch", "--stdin"], JSON.stringify({writes: [sess("p-progress"), sess("p-event"), sess("p-sub"), sess("p-stage"), sess("p-old"),
      card("cp", "p-progress"), card("cs", "p-stage", {stages: [{label: "Build", state: "done", started: recent}]}), card("co", "p-old")]}), e));
    ok(await run(["append", "cards/cp", "progress", "--stdin"], JSON.stringify({at: recent, text: "late line"}), e));
    ok(await run(["append", "sessions/p-event", "events", "--stdin"], JSON.stringify({at: recent, text: "late event"}), e));
    ok(await run(["append", "sessions/p-sub", "events", "--stdin"], JSON.stringify({at: old, text: "e", sub: [{at: recent, text: "late sub"}]}), e));
    const dry = ok(await run(["prune", "--before", "2026-06-01"], "", e));
    assert.deepEqual(dry.sessions, ["p-old"]);
    assert.deepEqual(dry.cards, ["co"]);
  } finally { s.closeAllConnections(); s.close(); }
});

test("cli: delete --cascade matches the session id exactly (s1 does not take s10's cards)", async () => {
  ok(await run(["session", "start", "s1", "--title", "one"]));
  ok(await run(["session", "start", "s10", "--title", "ten"]));
  ok(await run(["card", "add", "s1-c", "--session", "s1", "--title", "c", "--stages", "Build"]));
  ok(await run(["card", "add", "s10-c", "--session", "s10", "--title", "c", "--stages", "Build"]));
  assert.deepEqual(ok(await run(["delete", "sessions/s1", "--cascade"])).cards, ["s1-c"]);
  assert.equal((await run(["get", "cards/s10-c"])).code, 0);
});

test("cli: progress, event and checkin refuse a field that exists but is not an array; remaining warnings print", async () => {
  ok(await run(["set", "cards/bad-p", "--data", '{"title":"t","progress":"y"}']));
  const p = await run(["progress", "bad-p", "x"]);
  assert.equal(p.code, 1);
  assert.match(p.err, /progress exists but is not an array/);
  assert.equal((await get("cards/bad-p")).data.progress, "y");
  ok(await run(["set", "sessions/bad-e", "--data", '{"title":"t","events":{"a":1}}']));
  assert.match((await run(["event", "bad-e", "x"])).err, /events exists but is not an array/);
  assert.match((await run(["checkin", "bad-e", "x"])).err, /events exists but is not an array/);
  ok(await run(["set", "sessions/bad-s", "--data", '{"title":"t","events":[{"at":"2026-11-15T19:07:00-05:00","text":"e","sub":"no"}]}']));
  assert.match((await run(["checkin", "bad-s", "x"])).err, /sub exists but is not an array/);
  ok(await run(["set", "cards/warned", "--data", '{"title":"t","session":"ghost"}']));
  const w = await run(["progress", "warned", "still here"]);
  assert.equal(w.code, 0, w.err);
  assert.match(w.err, /warning: cards\/warned: session ghost does not exist/);
  assert.equal(w.json.warnings, undefined);
});

test("cli: prune --before must be a real calendar date", async () => {
  for (const d of ["2026-13-45", "2026-02-31", "2026-2-1", "26-01-01"]) assert.match((await run(["prune", "--before", d])).err, /real calendar date/, d);
  assert.equal((await run(["prune", "--before", "2028-02-29"])).code, 0);
});

test("lint: a legacy stages object is a note, not a warning; stage converts it to the array in stored order", async () => {
  assert.deepEqual(lint("cards", {title: "t", stages: {spec: "done", build: "active"}}), []);
  ok(await run(["session", "start", "s-legacy", "--title", "t"]));
  ok(await run(["set", "cards/legacy", "--data", '{"session":"s-legacy","title":"t","stages":{"spec":"done","build":{"state":"active","started":"2026-11-15T19:07:00-05:00"},"refute":"pending"}}']));
  const l = await run(["lint", "cards/legacy"]);
  assert.equal(l.code, 0);
  assert.deepEqual(l.json.notes, ["cards/legacy: legacy stages object; write the array form"]);
  ok(await run(["progress", "legacy", "works on a legacy card"]));
  const r = ok(await run(["stage", "legacy", "Refute", "active"]));
  assert.deepEqual(r.stages.map(s => [s.label, s.state]), [["Spec", "done"], ["Build", "active"], ["Refute", "active"]]);
  assert.equal(r.stages[1].started, "2026-11-15T19:07:00-05:00");
  assert.deepEqual((await run(["lint", "cards/legacy"])).json.notes, []);
});

test("lint: every doc in dev/fixture.js lints with zero warnings (notes allowed)", () => {
  const ctx = {window: {}, setTimeout, Date, location: {hash: ""}, localStorage: {getItem: () => null, setItem() {}, removeItem() {}}};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(fileURLToPath(new URL("../dev/fixture.js", import.meta.url)), "utf8") + "\n;globalThis.__S = S;", ctx);
  const S = ctx.__S, ids = new Set(S.sessions.map(s => s.id));
  const strip = ({id, ...d}) => d;
  const found = [...S.sessions.map(s => ["sessions", s]), ...S.cards.map(c => ["cards", c])]
    .flatMap(([c, d]) => lint(c, strip(d), {sessionExists: id => ids.has(id)}).map(w => `${d.id}: ${w}`));
  assert.deepEqual(found, []);
  assert.ok(S.cards.length >= 5);
});

test("cli: set-field keeps the contract's string fields as strings; --json forces JSON", async () => {
  ok(await run(["session", "start", "s-str", "--title", "t"]));
  assert.equal(ok(await run(["set-field", "sessions/s-str", "title", "2024"])).title, "2024");
  assert.equal(ok(await run(["set-field", "sessions/s-str", "status", "true"])).status, "true");
  ok(await run(["card", "add", "c-str", "--session", "s-str", "--title", "t", "--stages", "B"]));
  assert.equal(ok(await run(["set-field", "cards/c-str", "tokens", "41000"])).tokens, 41000);
  assert.equal(ok(await run(["set-field", "cards/c-str", "commit", "1234567"])).commit, "1234567");
  assert.equal(ok(await run(["set-field", "cards/c-str", "note", "42", "--json"])).note, 42);
  assert.match((await run(["set-field", "cards/c-str", "tokens", "abc", "--json"])).err, /--json: invalid JSON/);
});

test("feed: the last unsubscribe clears a pending retry timer", async () => {
  const timers = new Set();
  const feed = createFeed(async () => { throw new Error("down"); }, {retryMs: 1000, setTimer: f => { const t = {f}; timers.add(t); return t; }, clearTimer: t => timers.delete(t)});
  const u1 = feed.subscribe("cards", [], null, () => {}, () => {}), u2 = feed.subscribe("cards", [], null, () => {}, () => {});
  await new Promise(r => setTimeout(r, 10));
  assert.equal(timers.size, 1);
  u1();
  assert.equal(timers.size, 1);
  u2();
  assert.equal(timers.size, 0);
});

test("store: collections ignore dot-files, dot-folders and plain files at the data-dir top level", () => {
  const dir = join(tmp(), "data"), s = openStore(dir);
  s.set("cards", "c1", {a: 1});
  writeFileSync(join(dir, ".server.log"), "log");
  writeFileSync(join(dir, "stray.txt"), "x");
  mkdirSync(join(dir, ".hidden"));
  assert.deepEqual(s.collections(), ["cards"]);
});

test("store: a collection name may not start with a dot (it would be stored but left out of export)", () => {
  const s = openStore(mkdtempSync(join(tmpdir(), "orc-dot-")));
  assert.throws(() => s.set(".hidden", "x", {a: 1}), e => e.code === "invalid");
  assert.throws(() => s.list(".hidden"), e => e.code === "invalid");
  assert.equal(s.set("visible", ".dotid", {a: 1}).version, 1, "a doc id may still start with a dot");
  assert.deepEqual(s.collections(), ["visible"]);
});

// Raw JSON call against the same server, for the HTTP-level checks.
const api = async (method, path, body) => { const r = await fetch(`http://127.0.0.1:${env.ORC_BOARD_PORT}${path}`, {method, headers: {"x-orc-board": "1", "content-type": "application/json"}, body: body && JSON.stringify(body)}); return {status: r.status, body: await r.json().catch(() => null)}; };

test("lint: an invalid session reference is a warning; an applied PUT, append, batch and import answers 200 and lands once", async () => {
  for (const bad of ["sessions/abc", ""]){
    const k = bad ? "slash" : "empty", card = {title: "t", session: bad, stages: []};
    const put = await api("PUT", `/api/db/cards/r1-put-${k}`, {data: card});
    assert.equal(put.status, 200); assert.equal(put.body.version, 1);
    assert.match(put.body.warnings.join(), /does not exist/);
    const app = await api("POST", `/api/db/cards/r1-put-${k}/append`, {field: "progress", value: {at: "2026-11-15T10:00:00-05:00", text: "x"}});
    assert.equal(app.status, 200); assert.equal(app.body.version, 2); assert.match(app.body.warnings.join(), /does not exist/);
    const bat = await api("POST", "/api/batch", {writes: [{op: "set", collection: "cards", id: `r1-bat-${k}`, data: card}]});
    assert.equal(bat.status, 200); assert.equal(bat.body.docs[0].version, 1); assert.match(bat.body.warnings.join(), /does not exist/);
    const file = join(tmp(), "imp.json");
    writeFileSync(file, JSON.stringify({cards: {[`r1-imp-${k}`]: card}}));
    assert.equal(ok(await run(["import", file])).imported, 1);
    assert.equal((await api("GET", `/api/db/cards/r1-imp-${k}`)).body.version, 1);
    assert.equal((await api("GET", `/api/db/cards/r1-put-${k}`)).body.data.progress.length, 1, "applied exactly once");
  }
});

test("ops: stage and progress on a card whose session reference is invalid still succeed, with a warning", async () => {
  ok(await run(["set", "cards/r1-ops", "--data", '{"title":"t","session":"sessions/abc","stages":[{"label":"Build","state":"pending"}]}']));
  const r = await run(["stage", "r1-ops", "Build", "active"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /does not exist/);
  assert.equal((await run(["progress", "r1-ops", "went on"])).code, 0);
});

test("ops: stage on a legacy stages object converts every entry; an odd entry keeps its raw state with a warning, not a refusal", async () => {
  ok(await run(["session", "start", "s-leg2", "--title", "t"]));
  ok(await run(["set", "cards/leg2", "--data", '{"session":"s-leg2","title":"t","stages":{"spec":"done","build":{"started":"2026-11-15T19:07:00-05:00"},"refute":null,"commit":"weird","pr":{"state":"waiting"}}}']));
  const r = await run(["stage", "leg2", "Spec", "done"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.json.stages.map(s => [s.label, s.state]), [["Spec", "done"], ["Build", "pending"], ["Refute", "null"], ["Commit", "weird"], ["Pr", "waiting"]]);
  assert.equal(r.json.stages[1].started, "2026-11-15T19:07:00-05:00");
  assert.match(r.err, /state "weird"/);
  assert.match(r.err, /state "waiting"/);
  assert.equal((await get("cards/leg2")).data.stages.length, 5);
});

test("set-field: the remaining words are the text; --json takes exactly one argument or --stdin", async () => {
  ok(await run(["session", "start", "s-words", "--title", "t"]));
  ok(await run(["set-field", "sessions/s-words", "now", "Builder", "on", "Task", "18001"]));
  assert.equal((await get("sessions/s-words")).data.now, "Builder on Task 18001");
  ok(await run(["set-field", "sessions/s-words", "note", "two", "words"]));
  assert.equal((await get("sessions/s-words")).data.note, "two words");
  ok(await run(["set-field", "sessions/s-words", "pr", "--json", '{"id": 5, "status": "open"}']));
  assert.deepEqual((await get("sessions/s-words")).data.pr, {id: 5, status: "open"});
  assert.match((await run(["set-field", "sessions/s-words", "pr", "--json", "{", '"id": 5}'])).err, /exactly one argument/);
  ok(await run(["set-field", "sessions/s-words", "pr", "--json", "--stdin"], '{"id": 6}'));
  assert.equal((await get("sessions/s-words")).data.pr.id, 6);
});
