import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {start} from "../local/server.js";
import {openStore} from "../local/store.js";
import {lint, isIso} from "../local/lint.js";
import {isoNow} from "../local/ops.js";

const cli = fileURLToPath(new URL("../local/board.js", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "orc-ops-"));
let server, env, data;
before(async () => { data = join(tmp(), "data"); server = await start({port: 0, dataDir: data}); env = {...process.env, ORC_BOARD_PORT: String(server.address().port), ORC_BOARD_DATA: data}; });
after(() => { server.closeAllConnections(); server.close(); });

const run = (args, input, e = env) => new Promise(ok => {
  const p = spawn(process.execPath, [cli, "--no-start", ...args], {env: e, windowsHide: true});
  let out = "", err = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
  p.on("close", code => ok({code, out, err, json: (() => { try { return JSON.parse(out); } catch { return null; } })()}));
  p.stdin.end(input ?? "");
});
const get = async ref => (await run(["get", ref])).json;
const ok = r => { assert.equal(r.code, 0, r.err); return r.json; };
const clean = async ref => { const r = await run(["lint", ref]); assert.equal(r.code, 0, r.out + r.err); };

async function session(id){
  ok(await run(["session", "start", id, "--title", "Header search", "--branch", "feature/search", "--ticket", "18018", "--now", "Planning", "--links-ticket", "https://tracker.example/{id}"]));
  ok(await run(["card", "add", id + "-b", "--session", id, "--title", "Build search", "--order", "1", "--task", "18019", "--kind", "Task", "--stages", "Build,Refute,Commit"]));
  ok(await run(["card", "add", id + "-r", "--session", id, "--title", "Review", "--order", "2", "--stages", "Refute"]));
}

test("isoNow has the date -Iseconds shape", () => {
  assert.match(isoNow(), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
  assert.ok(isIso(isoNow()));
});

test("cli: session start and card add create lint-clean docs; each refuses a second create and bad input", async () => {
  await session("2026-11-15-orc-a");
  const s = await get("sessions/2026-11-15-orc-a");
  assert.equal(s.data.status, "Planning");
  assert.deepEqual(s.data.events, []);
  assert.deepEqual(s.data.links, {ticket: "https://tracker.example/{id}"});
  assert.ok(isIso(s.data.started) && s.data.updated === s.data.started);
  const c = await get("cards/2026-11-15-orc-a-b");
  assert.deepEqual(c.data.stages, [{label: "Build", state: "pending"}, {label: "Refute", state: "pending"}, {label: "Commit", state: "pending"}]);
  assert.equal(c.data.order, 1);
  await clean("sessions/2026-11-15-orc-a"); await clean("cards/2026-11-15-orc-a-b");
  assert.match((await run(["session", "start", "2026-11-15-orc-a", "--title", "x"])).err, /already exists/);
  assert.equal((await run(["session", "start", "s-none"])).code, 1);
  assert.match((await run(["session", "start", "s-bad", "--title", "x", "--links-ticket", "http://x/{id}"])).err, /data contract/);
  assert.match((await run(["card", "add", "c-x", "--session", "missing", "--title", "t", "--stages", "Build"])).err, /does not exist/);
  assert.match((await run(["card", "add", "c-x", "--session", "2026-11-15-orc-a", "--title", "t"])).err, /--stages/);
  assert.match((await run(["card", "add", "c-x", "--session", "2026-11-15-orc-a", "--title", "t", "--stages", "A,A"])).err, /unique/);
  assert.match((await run(["card", "add", "2026-11-15-orc-a-b", "--session", "2026-11-15-orc-a", "--title", "t", "--stages", "A"])).err, /already exists/);
  // The title can come from stdin, with quotes, $, backticks and a newline intact.
  const tricky = 'Fix "quotes" $HOME `tick`\nline 2';
  ok(await run(["session", "start", "s-stdin", "--stdin"], tricky + "\n"));
  assert.equal((await get("sessions/s-stdin")).data.title, tricky);
});

test("cli: stage sets state, started on active/rework, touches updated; unknown label and bad state fail", async () => {
  await session("s-stage");
  const r = ok(await run(["stage", "s-stage-b", "Build", "active"]));
  assert.equal(r.version, 2);
  assert.equal(r.stages[0].state, "active");
  assert.ok(isIso(r.stages[0].started));
  const c = await get("cards/s-stage-b");
  assert.equal(c.data.updated, r.stages[0].started);
  assert.deepEqual(c.data.stages.slice(1), [{label: "Refute", state: "pending"}, {label: "Commit", state: "pending"}]);
  const done = ok(await run(["stage", "s-stage-b", "Build", "done"]));
  assert.equal(done.stages[0].state, "done");
  const rw = ok(await run(["stage", "s-stage-b", "Refute", "rework"]));
  assert.ok(isIso(rw.stages[1].started), "rework sets started");
  const bad = await run(["stage", "s-stage-b", "Ship", "done"]);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /Build, Refute, Commit/);
  assert.match((await run(["stage", "s-stage-b", "Build", "finished"])).err, /pending\|active\|rework\|done\|skipped/);
  assert.match((await run(["stage", "nope", "Build", "done"])).err, /404/);
  assert.equal((await run(["stage", "s-stage-b", "Build"])).code, 1);
  await clean("cards/s-stage-b");
});

test("cli: progress, event and checkin append with server times; text from words or --stdin", async () => {
  await session("s-log");
  const p = ok(await run(["progress", "s-log-b", "build", "green", "31/40"]));
  assert.equal(p.progress.text, "build green 31/40");
  ok(await run(["progress", "s-log-b", "--stdin"], 'say "hi" $x `y`\nnext\n'));
  assert.deepEqual((await get("cards/s-log-b")).data.progress.map(l => l.text), ["build green 31/40", 'say "hi" $x `y`\nnext']);
  const e = ok(await run(["event", "s-log", "builder dispatched on #18019", "--card", "s-log-b"]));
  assert.deepEqual(Object.keys(e.event), ["at", "text", "card"]);
  ok(await run(["event", "s-log", "refuter dispatched", "--card", "s-log-r"]));
  ok(await run(["checkin", "s-log", "tests running", "--card", "s-log-b"]));
  ok(await run(["checkin", "s-log", "newest"]));
  const s = (await get("sessions/s-log")).data;
  assert.deepEqual(s.events[0].sub.map(x => x.text), ["tests running"]);
  assert.deepEqual(s.events[1].sub.map(x => x.text), ["newest"]);
  assert.match((await run(["checkin", "s-log", "x", "--card", "zzz"])).err, /no event naming card zzz/);
  ok(await run(["session", "start", "s-empty", "--title", "e"]));
  assert.match((await run(["checkin", "s-empty", "x"])).err, /has no events/);
  assert.match((await run(["progress", "s-log-b"])).err, /needs text/);
  assert.match((await run(["event", "nope", "x"])).err, /404/);
  await clean("sessions/s-log"); await clean("cards/s-log-b");
});

test("cli: set-field parses JSON or keeps a string and touches updated; finish closes the session", async () => {
  await session("s-f");
  assert.equal(ok(await run(["set-field", "cards/s-f-b", "tokens", "41000"])).tokens, 41000);
  assert.equal(ok(await run(["set-field", "cards/s-f-b", "agent", "builder"])).agent, "builder");
  assert.deepEqual(ok(await run(["set-field", "sessions/s-f", "pr", '{"id":"7","url":"https://example.com/pr/7","status":"draft"}'])).pr.status, "draft");
  assert.equal(ok(await run(["set-field", "cards/s-f-b", "note", "--stdin"], "a 'b' \"c\"\n")).note, "a 'b' \"c\"");
  assert.match((await run(["set-field", "cards/s-f-b", "started", "yesterday"])).err, /data contract/);
  assert.equal((await run(["set-field", "cards/s-f-b", "note"])).code, 1);
  assert.equal((await run(["set-field", "cards", "note", "x"])).code, 1);
  const f = ok(await run(["finish", "s-f", "--now", "Draft PR 7 opened"]));
  const s = (await get("sessions/s-f")).data;
  assert.equal(s.status, "Done");
  assert.equal(s.completed, f.completed);
  assert.equal(s.now, "Draft PR 7 opened");
  assert.equal(s.events.at(-1).text, "Draft PR 7 opened");
  await clean("sessions/s-f"); await clean("cards/s-f-b");
});

test("cli: --if-version on each high-level command; a stale pin exits 2 and writes nothing", async () => {
  await session("s-pin");
  const cases = [["stage", "s-pin-b", "Build", "active"], ["progress", "s-pin-b", "x"], ["event", "s-pin", "x"], ["checkin", "s-pin", "x"],
    ["set-field", "cards/s-pin-b", "note", "n"], ["finish", "s-pin"]];
  for (const c of cases){
    const ref = c[0] === "set-field" ? c[1] : (["event", "checkin", "finish"].includes(c[0]) ? "sessions/" : "cards/") + c[1];
    const v = (await get(ref)).version;
    const r = await run([...c, "--if-version", String(v + 5)]);
    assert.equal(r.code, 2, c.join(" ") + r.err);
    assert.match(r.err, new RegExp(`current version is ${v}`));
    assert.equal((await get(ref)).version, v);
    assert.equal((await run([...c, "--if-version", String(v)])).code, 0, c.join(" "));
  }
  for (const c of [["session", "start", "s-pin2", "--title", "t"], ["card", "add", "s-pin-c", "--session", "s-pin", "--title", "t", "--stages", "Build"]]){
    const r = await run([...c, "--if-version", "3"]);
    assert.equal(r.code, 2, c.join(" ") + r.err);
    assert.match(r.err, /current version is 0/);
  }
  assert.equal((await run(["get", "sessions/s-pin2"])).code, 1);
  assert.equal((await run(["session", "start", "s-pin", "--title", "t", "--if-version", "0"])).code, 1);
});

test("cli: 40 progress + 40 stage flips + 40 events from separate processes all land and lint clean", async () => {
  await session("s-race");
  const jobs = [];
  for (let i = 0; i < 40; i++){
    jobs.push(["progress", "s-race-b", `line ${i}`]);
    jobs.push(["stage", "s-race-b", ["Build", "Refute", "Commit"][i % 3], ["active", "done", "rework", "pending"][i % 4]]);
    jobs.push(["event", "s-race", `event ${i}`, "--card", "s-race-b"]);
  }
  const results = [];
  for (let i = 0; i < jobs.length; i += 24) results.push(...await Promise.all(jobs.slice(i, i + 24).map(j => run(j))));
  results.forEach((r, i) => assert.equal(r.code, 0, jobs[i].join(" ") + r.err));
  const c = await get("cards/s-race-b"), s = await get("sessions/s-race");
  assert.equal(c.version, 1 + 80);
  assert.deepEqual(c.data.progress.map(l => l.text).sort(), Array.from({length: 40}, (_, i) => `line ${i}`).sort());
  assert.equal(s.data.events.length, 40);
  assert.equal(new Set(s.data.events.map(e => e.text)).size, 40);
  await clean("sessions/s-race"); await clean("cards/s-race-b");
});

test("server: raw writes return lint warnings; the CLI prints them to stderr, keeps stdout and exits 0", async () => {
  const r = await run(["set", "cards/w1", "--data", '{"session":"ghost","stages":[{"label":"Build","state":"finished"}]}']);
  assert.equal(r.code, 0);
  assert.deepEqual(r.json, {id: "w1", version: 1, data: {session: "ghost", stages: [{label: "Build", state: "finished"}]}});
  assert.match(r.err, /warning: cards\/w1: missing title/);
  assert.match(r.err, /session ghost does not exist/);
  const l = await run(["lint", "cards/w1"]);
  assert.equal(l.code, 1);
  assert.equal(l.json.lint.length, 3);
});

test("lint: one warning per contract rule", () => {
  const ok = {title: "t", updated: "2026-11-15T19:07:00-05:00", started: "2026-11-15T19:00:00Z"};
  assert.deepEqual(lint("sessions", {...ok, events: [{at: ok.updated, text: "x", sub: [{at: ok.updated, text: "y"}], card: "c"}], links: {ticket: "https://t/{id}"}}), []);
  assert.deepEqual(lint("timeline", {}), []);
  const one = (col, d, re) => { const w = lint(col, d, {sessionExists: id => id === "s1"}); assert.equal(w.length, 1, JSON.stringify(w)); assert.match(w[0], re); };
  one("sessions", {}, /missing title/);
  one("sessions", {...ok, updated: "2026-11-15 19:07"}, /updated is not an ISO/);
  one("sessions", {...ok, started: "2026-11-15T19:07:00"}, /started is not an ISO/);
  one("sessions", {...ok, events: [{at: "noon", text: "x"}]}, /events\[0\]\.at/);
  one("sessions", {...ok, events: [{text: "x"}]}, /events\[0\] needs at and text/);
  one("sessions", {...ok, events: [{at: ok.updated, text: "x", sub: [{at: ok.updated}]}]}, /sub\[0\] needs at and text/);
  one("sessions", {...ok, links: {ticket: "http://t/{id}"}}, /links\.ticket/);
  one("sessions", {...ok, links: {task: "https://t/"}}, /links\.task/);
  one("cards", {...ok, stages: {Build: "done"}}, /stages is not an array/);
  one("cards", {...ok, stages: [{label: "Build"}]}, /stages\[0\] is not \{label, state\}/);
  one("cards", {...ok, stages: [{label: "Build", state: "finished"}]}, /state "finished"/);
  one("cards", {...ok, progress: [{at: ok.updated}]}, /progress\[0\] needs at and text/);
  one("cards", {...ok, session: "s2"}, /session s2 does not exist/);
  assert.deepEqual(lint("cards", {...ok, session: "s2"}), []); // without the server-side check
});

test("cli: delete --cascade removes the session and its cards in one batch; without it, a warning names the orphans", async () => {
  await session("s-del");
  const r = ok(await run(["delete", "sessions/s-del", "--cascade"]));
  assert.deepEqual(r.cards.sort(), ["s-del-b", "s-del-r"]);
  assert.equal((await run(["get", "cards/s-del-b"])).code, 1);
  await session("s-del2");
  const w = await run(["delete", "sessions/s-del2"]);
  assert.equal(w.code, 0);
  assert.deepEqual(w.json, {id: "s-del2", deleted: true});
  assert.match(w.err, /2 card\(s\) of sessions\/s-del2 are now orphaned/);
  const o = ok(await run(["orphans"]));
  assert.deepEqual(o.orphans.filter(x => x.session === "s-del2").map(x => x.id).sort(), ["s-del2-b", "s-del2-r"]);
  assert.match((await run(["delete", "cards/w1", "--cascade"])).err, /only to sessions/);
  assert.equal((await run(["delete", "sessions/s-del2", "--cascade"])).code, 1);
});

test("cli: prune dry run lists finished old sessions and their cards; --apply archives (merging) then deletes", async () => {
  const d = join(tmp(), "data"), s = await start({port: 0, dataDir: d});
  const e = {...process.env, ORC_BOARD_PORT: String(s.address().port), ORC_BOARD_DATA: d};
  try {
    const old = "2026-10-01T10:00:00-04:00";
    const writes = [
      {op: "set", collection: "sessions", id: "old-done", data: {title: "a", status: "Done", started: old, updated: old, events: []}},
      {op: "set", collection: "sessions", id: "old-completed", data: {title: "b", status: "building", completed: old, started: old, updated: old}},
      {op: "set", collection: "sessions", id: "old-open", data: {title: "c", status: "building", started: old, updated: old}},
      {op: "set", collection: "sessions", id: "new-done", data: {title: "d", status: "finished", started: old, updated: "2026-11-14T10:00:00-05:00"}},
      {op: "set", collection: "sessions", id: "old-card-new", data: {title: "e", status: "Done", started: old, updated: old}},
      {op: "set", collection: "cards", id: "c1", data: {session: "old-done", title: "c1", updated: old}},
      {op: "set", collection: "cards", id: "c2", data: {session: "old-card-new", title: "c2", updated: "2026-11-14T10:00:00-05:00"}},
      {op: "set", collection: "cards", id: "c3", data: {session: "old-open", title: "c3", updated: old}},
      {op: "set", collection: "timeline", id: "2026-10-01", data: {date: "2026-10-01", events: []}}];
    ok(await run(["batch", "--stdin"], JSON.stringify({writes}), e));
    const dry = ok(await run(["prune", "--before", "2026-11-01"], "", e));
    assert.deepEqual(dry.sessions.sort(), ["old-completed", "old-done"]);
    assert.deepEqual(dry.cards, ["c1"]);
    assert.equal(dry.dryRun, true);
    assert.equal((await run(["get", "sessions/old-done"], "", e)).code, 0);
    assert.match((await run(["prune", "--before", "2026-11-01", "--apply"], "", e)).err, /--archive/);
    assert.match((await run(["prune", "--before", "Nov 1"], "", e)).err, /yyyy-MM-dd/);
    const archive = join(tmp(), "archive.json");
    writeFileSync(archive, JSON.stringify({sessions: {earlier: {title: "kept"}}}));
    const a = ok(await run(["prune", "--before", "2026-11-01", "--archive", archive, "--apply"], "", e));
    assert.equal(a.applied, true);
    const saved = JSON.parse(readFileSync(archive, "utf8"));
    assert.deepEqual(Object.keys(saved.sessions).sort(), ["earlier", "old-completed", "old-done"]);
    assert.equal(saved.cards.c1.title, "c1");
    assert.equal((await run(["get", "sessions/old-done"], "", e)).code, 1);
    assert.equal((await run(["get", "cards/c1"], "", e)).code, 1);
    for (const ref of ["sessions/old-open", "sessions/new-done", "sessions/old-card-new", "cards/c3", "timeline/2026-10-01"]) assert.equal((await run(["get", ref], "", e)).code, 0, ref);
  } finally { s.closeAllConnections(); s.close(); }
});

test("store: list caches parsed docs (2,000 cards read once) and still sees out-of-band edits and new files", () => {
  const dir = join(tmp(), "data"), cards = join(dir, "cards");
  mkdirSync(cards, {recursive: true});
  for (let i = 0; i < 2000; i++){
    const id = `c${String(i).padStart(4, "0")}`;
    writeFileSync(join(cards, id + ".json"), JSON.stringify({version: 1, data: {session: "s" + (i % 50), order: i, title: "Card " + i, updated: "2026-11-15T19:07:00-05:00",
      stages: [{label: "Build", state: "done"}, {label: "Refute", state: "active", started: "2026-11-15T19:07:00-05:00"}], progress: [{at: "2026-11-15T19:07:00-05:00", text: "line"}]}}));
  }
  const s = openStore(dir);
  assert.equal(s.list("cards").length, 2000);
  const first = s.stats.reads;
  assert.equal(first, 2000);
  assert.equal(s.list("cards").length, 2000);
  assert.equal(s.stats.reads, first, "second list re-read files");
  writeFileSync(join(cards, "c0007.json"), JSON.stringify({version: 9, data: {title: "edited by hand, longer"}}));
  writeFileSync(join(cards, "zz.json"), JSON.stringify({version: 1, data: {title: "new"}}));
  const third = s.list("cards");
  assert.equal(s.stats.reads, first + 2);
  assert.equal(third.find(d => d.id === "c0007").data.title, "edited by hand, longer");
  assert.equal(third.length, 2001);
  s.update("cards", "c0001", {note: "n"});
  assert.equal(s.list("cards").find(d => d.id === "c0001").data.note, "n");
  assert.ok(existsSync(join(cards, "c0001.json")));
});
