// Local board CLI, for any agent tool that can run a shell command: node local/board.js <command> ...
// JSON on stdout; errors on stderr with exit 1 (a conflict exits 2 and prints the current version).
// The raw commands never add fields such as timestamps or `updated`; the high-level commands (session start, stage,
// progress, ...) do, from the server clock, each as one request applied inside the server's write queue.
import {spawn} from "node:child_process";
import {closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync} from "node:fs";
import {homedir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {codeHash, isMain, portFrom, start} from "./server.js";
import {lint, notes, touchTimes} from "./lint.js";
import {defaultDataDir} from "./store.js";

const USAGE = `usage: node local/board.js <command> [--no-start] [--port N]
  serve | url | get <col>/<id> | list <col>
  set|update <col>/<id> (--data <json> | --file <path> | --stdin) [--if-version N]
  append <col>/<id> <field> (--data | --file | --stdin) [--if-version N]
  delete <col>/<id> [--if-version N] [--cascade] | batch (--file | --stdin) | export [--out <file>] | import <file>
  session start <id> --title <t> [--branch b] [--ticket t] [--status s] [--now n] [--links-ticket <tpl>] [--ado org/project]
  card add <card> --session <id> --title <t> --stages "Build,Refute,Commit" [--order n] [--ticket t] [--task t] [--kind k]
  stage <card> <label> <state> | progress <card> <text...> | event <session> <text...> [--card <card>]
  checkin <session> <text...> [--card <card>] | set-field <col>/<id> <field> <value> | finish <session> [--now t] [--status s]
  lint [<col>/<id>] | orphans | prune --before <yyyy-MM-dd> [--archive <file> --apply] | status | stop | restart
  every command: [--data <dir> | --data-dir <dir>] (set/update/append/batch take --data as JSON: use --data-dir there);
  text from --stdin; high-level writes take [--if-version N]`;

class CliError extends Error { constructor(message, code = 1){ super(message); this.exit = code; } }

function parse(argv){
  const opts = {_: []};
  for (let i = 0; i < argv.length; i++){
    const a = argv[i];
    if (["--stdin", "--no-start", "--cascade", "--apply", "--json"].includes(a)) opts[a.slice(2)] = true;
    else if (["--data", "--file", "--if-version", "--out", "--port", "--data-dir", "--title", "--branch", "--ticket", "--status", "--now",
      "--links-ticket", "--ado", "--session", "--order", "--task", "--kind", "--stages", "--card", "--before", "--archive"].includes(a)){ if (i + 1 >= argv.length) throw new CliError(`${a} needs a value`); opts[a.slice(2)] = argv[++i]; }
    else if (a.startsWith("--")) throw new CliError(`unknown option ${a}`);
    else opts._.push(a);
  }
  return opts;
}

const readStdin = () => readFileSync(0, "utf8");
function jsonArg(o){
  const n = ["data", "file", "stdin"].filter(k => o[k] !== undefined).length;
  if (n !== 1) throw new CliError("give exactly one of --data, --file, --stdin");
  const text = o.data ?? (o.file ? readFileSync(o.file, "utf8") : readStdin());
  try { return JSON.parse(text.replace(/^﻿/, "")); } catch (e) { throw new CliError(`invalid JSON: ${e.message}`); }
}
function docRef(s){
  const m = /^([^/]+)\/([^/]+)$/.exec(s || "");
  if (!m) throw new CliError(`expected <collection>/<id>, got ${JSON.stringify(s)}`);
  return m.slice(1).map(encodeURIComponent).join("/");
}
const rawRef = s => { docRef(s); return s.split("/"); };
function pin(o){
  if (o["if-version"] === undefined) return undefined;
  const v = Number(o["if-version"]);
  if (!Number.isInteger(v) || v < 1) throw new CliError("--if-version must be a positive integer");
  return v;
}

async function health(base){
  try { const r = await fetch(base + "/api/health", {signal: AbortSignal.timeout(1000)}); return await r.json().catch(() => ({})); }
  catch { return null; }
}

// A server already running on another data dir would take the writes meant for ORC_BOARD_DATA; refuse instead.
function sameData(h){
  const want = process.env.ORC_BOARD_DATA;
  if (!want) return;
  if (!h.dataDir || norm(h.dataDir) !== norm(want)) throw new CliError(`the board server on this port uses data dir ${h.dataDir || "(unknown: an older server, restart it)"}, not ORC_BOARD_DATA=${want}; stop it or set ORC_BOARD_PORT to another port`);
}

// Which checkout a server runs: its local/ real path. Only a server from this checkout can be stale; one from another
// checkout (the board repo vs a worktree) is used as it is, or two CLIs would restart each other's server on every call.
const norm = p => process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p);
const ownRoot = realpathSync(dirname(fileURLToPath(import.meta.url)));
const otherCheckout = h => !!h.root && norm(h.root) !== norm(ownRoot);
// Stale: a server from this checkout hashed other local/*.js contents at its start than the files on disk hold now.
const isStale = h => !otherCheckout(h) && !!h.code && h.code !== codeHash();
const otherNotice = (h, port) => console.error(`board server on port ${port} runs code from ${h.root}; this CLI is ${ownRoot}; using the running server`);
// The log sits inside the data dir, so it never lands in whatever folder holds the data dir.
const logPath = data => join(data, ".server.log");
const tail = (file, n = 15) => { try { return readFileSync(file, "utf8").trimEnd().split(/\r?\n/).slice(-n).join("\n"); } catch { return "(no log)"; } };

// Starts the server detached on dataDir (default: the CLI's), logging to <data dir>/.server.log, and waits until it answers.
async function spawnServer(base, port, dataDir){
  const data = resolve(dataDir ?? defaultDataDir()), log = logPath(data);
  mkdirSync(dirname(log), {recursive: true});
  try { if (statSync(log).size > 1024 * 1024) writeFileSync(log, ""); } catch { /* no log yet */ }
  const fd = openSync(log, "a"), server = fileURLToPath(new URL("./server.js", import.meta.url));
  try { spawn(process.execPath, [server, "--port", String(port), "--data", data], {detached: true, stdio: ["ignore", fd, fd], windowsHide: true, env: {...process.env, ORC_BOARD_DATA: data}, cwd: homedir()}).unref(); }
  finally { closeSync(fd); }
  for (const until = Date.now() + 5000; Date.now() < until;){
    await new Promise(r => setTimeout(r, 150));
    const h = await health(base);
    if (h?.app === "orc-board") return h;
  }
  throw new CliError(`started the board server but ${base} did not answer within 5 s; last lines of ${log}:\n${tail(log)}`);
}

// Asks the server to exit (same protections as any write) and waits until the port stops answering.
// With pid, only that server stops; false when another server has taken the port since.
async function stopServer(base, pid){
  try { await call(base, "POST", "/api/shutdown", {pid}); }
  // 412: another server took the port; a failed connection: it is already going. Either way the caller re-checks.
  catch (e) { if (/ 412 /.test(e.message) || !(e instanceof CliError)) return false; throw e; }
  for (const until = Date.now() + 5000; Date.now() < until;){
    if (!(await health(base))){
      // The listener closes first and the process then drains for up to 2 s: wait for it to exit, so a restart never overlaps it on the data dir.
      for (const gone = Date.now() + 4000; pid && Date.now() < gone;){
        try { process.kill(pid, 0); } catch { break; }
        await new Promise(r => setTimeout(r, 50));
      }
      return true;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new CliError(`asked the board server on ${base} to stop but it still answers after 5 s`);
}

// Starts the server detached when nothing answers on the port, and restarts it once when it runs stale code.
async function ensureServer(base, port, noStart){
  let h = await health(base);
  if (h && h.app !== "orc-board") throw new CliError(`port ${port} answers but is not the orc board; set ORC_BOARD_PORT to a free port`);
  if (h){
    sameData(h);
    if (otherCheckout(h)){ otherNotice(h, port); return h; }
    if (noStart || !isStale(h)) return h;
    console.error(`orc-board: the server on port ${port} (pid ${h.pid}) runs older code; restarting it`);
    // The new server keeps the running one's data dir. When another CLI restarted it first, use that server.
    const data = h.dataDir;
    if (!(await stopServer(base, h.pid))){ const n = await health(base); if (n?.app === "orc-board") return n; }
    return spawnServer(base, port, data);
  } else if (noStart) throw new CliError(`no board server on ${base} (started with --no-start); run: node local/board.js serve`);
  h = await spawnServer(base, port);
  sameData(h);
  return h;
}

async function call(base, method, path, body){
  const r = await fetch(base + path, {method, headers: {"x-orc-board": "1", "content-type": "application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
  const out = await r.json().catch(() => ({}));
  if (r.status === 409) throw new CliError(`conflict: current version is ${out.version}${out.message ? ` (${out.message})` : ""}`, 2);
  if (!r.ok) throw new CliError(`${method} ${path}: ${r.status} ${out.error || ""}`.trim());
  return out;
}

// A value printed as JSON with a non-zero exit (the code is not enumerable, so it is not printed).
const withExit = (v, code) => Object.defineProperty(v, "exitCode", {value: code, enumerable: false});
// Fields the data contract defines as strings: stored as given even when they look like JSON ("2024"), unless --json.
const STRING_FIELDS = ["title", "status", "now", "branch", "ticket", "task", "kind", "agent", "commit", "note"];
// A real calendar date in yyyy-MM-dd (2026-02-31 and 2026-13-45 are not).
const isDate = s => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ""); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };
const FINISHED = /^(done|complete|completed|finished)$/i;
const RAW = ["get", "list", "set", "update", "append", "delete", "batch", "export", "import"];
const HIGH = ["session", "card", "stage", "progress", "event", "checkin", "set-field", "finish", "lint", "orphans", "prune"];

/** Runs one CLI invocation (argv without node and script); resolves to the value to print, or throws a CliError. */
export async function run(argv){
  const o = parse(argv), [cmd, ...rest] = o._;
  const port = portFrom(o.port ? ["--port", o.port] : []), base = `http://127.0.0.1:${port}`;
  if (!cmd || cmd === "help") throw new CliError(USAGE);
  // --data names the data dir, except on the JSON-taking raw commands, where it has always been the input.
  const dir = o["data-dir"] ?? (["set", "update", "append", "batch"].includes(cmd) ? undefined : o.data);
  if (dir !== undefined) process.env.ORC_BOARD_DATA = resolve(dir);
  if (cmd === "serve"){ const s = await start({port}); console.error(`orc-board: http://localhost:${s.address().port}/`); return undefined; }
  if (cmd === "url"){
    const h = await health(base);
    if (h?.app !== "orc-board") console.error(h ? `port ${port} answers but is not the orc board` : `nothing is running on port ${port}; any board command starts it`);
    return `http://localhost:${port}/`;
  }
  if (cmd === "status"){
    const h = await health(base);
    if (!h) return withExit({running: false, url: `http://localhost:${port}/`}, 3);
    if (h.app !== "orc-board") throw new CliError(`port ${port} answers but is not the orc board`);
    sameData(h);
    const counts = {};
    for (const c of (await call(base, "GET", "/api/db")).collections) counts[c] = (await call(base, "GET", "/api/db/" + encodeURIComponent(c))).docs.length;
    const stale = isStale(h), other = otherCheckout(h);
    return withExit({running: true, url: `http://localhost:${port}/`, pid: h.pid, dataDir: h.dataDir, started: h.started, counts, stale, ...(other ? {otherCheckout: true, root: h.root} : {})}, stale ? 4 : 0);
  }
  if (cmd === "stop" || cmd === "restart"){
    const h = await health(base);
    if (h && h.app !== "orc-board") throw new CliError(`port ${port} answers but is not the orc board; not stopping it`);
    if (h){ sameData(h); if (cmd === "restart" && otherCheckout(h)) console.error(`board server on port ${port} runs code from ${h.root}; restarting it with this CLI's code (${ownRoot})`); await stopServer(base, h.pid); }
    if (cmd === "stop") return h ? {stopped: true, pid: h.pid} : withExit({stopped: false, running: false}, 3);
    const n = await spawnServer(base, port, h?.dataDir);
    return {restarted: true, pid: n.pid, previousPid: h?.pid ?? null, started: n.started};
  }
  if (!RAW.includes(cmd) && !HIGH.includes(cmd)) throw new CliError(`unknown command ${cmd}\n${USAGE}`);
  if (HIGH.includes(cmd)) return runHigh(cmd, rest, o, base, port);
  // Parse input before starting anything, so a bad call fails fast.
  const input = ["set", "update", "append", "batch"].includes(cmd) ? jsonArg(o) : undefined;
  await ensureServer(base, port, o["no-start"]);
  switch (cmd){
    case "get": return call(base, "GET", "/api/db/" + docRef(rest[0]));
    case "list": if (!rest[0]) throw new CliError("list needs a collection"); return call(base, "GET", "/api/db/" + encodeURIComponent(rest[0]));
    case "set": return call(base, "PUT", "/api/db/" + docRef(rest[0]), {data: input, ifVersion: pin(o)});
    case "update": return call(base, "PATCH", "/api/db/" + docRef(rest[0]), {data: input, ifVersion: pin(o)});
    case "append": if (!rest[1]) throw new CliError("append needs a field"); return call(base, "POST", `/api/db/${docRef(rest[0])}/append`, {field: rest[1], value: input, ifVersion: pin(o)});
    case "delete": {
      const v = pin(o), [col, id] = rawRef(rest[0]);
      if (o.cascade){
        if (col !== "sessions") throw new CliError("--cascade applies only to sessions/<id>");
        return call(base, "POST", "/api/op", {op: "deleteCascade", args: {id, ifVersion: v}});
      }
      const out = await call(base, "DELETE", "/api/db/" + docRef(rest[0]) + (v ? `?ifVersion=${v}` : ""));
      if (col === "sessions"){
        const n = (await call(base, "GET", "/api/db/cards")).docs.filter(d => d.data.session === id).length;
        if (n) console.error(`warning: ${n} card(s) of sessions/${id} are now orphaned; see: node local/board.js orphans (delete --cascade removes them too)`);
      }
      return out;
    }
    case "batch": return call(base, "POST", "/api/batch", input);
    case "export": {
      const all = {};
      for (const c of (await call(base, "GET", "/api/db")).collections){
        all[c] = {};
        for (const d of (await call(base, "GET", "/api/db/" + encodeURIComponent(c))).docs) all[c][d.id] = d.data;
      }
      if (o.out){ writeFileSync(o.out, JSON.stringify(all, null, 2)); return {out: o.out, collections: Object.keys(all).length}; }
      return all;
    }
    case "import": {
      if (!rest[0]) throw new CliError("import needs a file");
      let all;
      try { all = JSON.parse(readFileSync(rest[0], "utf8").replace(/^﻿/, "")); } catch (e) { throw new CliError(`cannot read ${rest[0]}: ${e.message}`); }
      const writes = Object.entries(all).flatMap(([collection, docs]) => Object.entries(docs).map(([id, data]) => ({op: "set", collection, id, data})));
      // The server caps a request at 2 MiB, so a large export goes up in batches of about 1 MiB (each batch all or nothing).
      let chunk = [], size = 0;
      const flush = async () => { if (chunk.length) await call(base, "POST", "/api/batch", {writes: chunk}); chunk = []; size = 0; };
      for (const w of writes){
        const n = Buffer.byteLength(JSON.stringify(w));
        if (size + n > 1024 * 1024) await flush();
        chunk.push(w); size += n;
      }
      await flush();
      return {imported: writes.length};
    }
  }
}

// The high-level commands: each write is one /api/op request that the server applies inside its write queue.
async function runHigh(cmd, rest, o, base, port){
  const stdin = () => readStdin().replace(/\r?\n$/, "");
  const text = args => { const t = o.stdin ? stdin() : args.join(" "); if (!t.trim()) throw new CliError(`${cmd} needs text (words or --stdin)`); return t; };
  const need = (v, what) => { if (v === undefined || v === "") throw new CliError(`${cmd} needs ${what}`); return v; };
  const title = () => o.title ?? (o.stdin ? text([]) : need(o.title, "--title"));
  let req;
  switch (cmd){
    case "session":
      if (rest[0] !== "start") throw new CliError("usage: session start <id> --title <t> [...]");
      req = ["sessionStart", {id: need(rest[1], "a session id"), title: title(), branch: o.branch, ticket: o.ticket, status: o.status, now: o.now, linksTicket: o["links-ticket"], ado: o.ado}];
      break;
    case "card":
      if (rest[0] !== "add") throw new CliError('usage: card add <card id> --session <id> --title <t> --stages "Build,Refute,Commit"');
      req = ["cardAdd", {id: need(rest[1], "a card id"), session: need(o.session, "--session"), title: title(), stages: need(o.stages, "--stages").split(","),
        order: o.order, ticket: o.ticket, task: o.task, kind: o.kind}];
      break;
    case "stage": req = ["stage", {id: need(rest[0], "a card id"), label: need(rest[1], "a stage label"), state: need(rest[2], "a state")}]; break;
    case "progress": req = ["progress", {id: need(rest[0], "a card id"), text: text(rest.slice(1))}]; break;
    case "event": req = ["event", {id: need(rest[0], "a session id"), text: text(rest.slice(1)), card: o.card}]; break;
    case "checkin": req = ["checkin", {id: need(rest[0], "a session id"), text: text(rest.slice(1)), card: o.card}]; break;
    case "set-field": {
      const [collection, id] = rawRef(rest[0]), field = need(rest[1], "a field"), raw = o.stdin ? stdin() : need(rest[2], "a value");
      let value;
      if (o.json){ try { value = JSON.parse(raw); } catch (e) { throw new CliError(`--json: invalid JSON: ${e.message}`); } }
      else if (STRING_FIELDS.includes(field)) value = raw;
      else try { value = JSON.parse(raw); } catch { value = raw; }
      req = ["setField", {collection, id, field, value}];
      break;
    }
    case "finish": req = ["finish", {id: need(rest[0], "a session id"), now: o.now, status: o.status}]; break;
    case "prune":
      if (!isDate(o.before)) throw new CliError("prune needs --before <yyyy-MM-dd>, a real calendar date");
      if (o.apply && !o.archive) throw new CliError("prune --apply needs --archive <file>");
  }
  const ifVersion = pin(o);
  await ensureServer(base, port, o["no-start"]);
  if (req) return call(base, "POST", "/api/op", {op: req[0], args: {...req[1], ifVersion}});
  const sessions = (await call(base, "GET", "/api/db/sessions")).docs, cards = (await call(base, "GET", "/api/db/cards")).docs;
  const ids = new Set(sessions.map(d => d.id)), exists = id => ids.has(id);
  if (cmd === "lint"){
    const docs = rest[0] ? [[rawRef(rest[0])[0], await call(base, "GET", "/api/db/" + docRef(rest[0]))]] : [...sessions.map(d => ["sessions", d]), ...cards.map(d => ["cards", d])];
    const found = docs.flatMap(([c, d]) => lint(c, d.data, {sessionExists: exists}).map(w => `${c}/${d.id}: ${w}`));
    const noted = docs.flatMap(([c, d]) => notes(c, d.data).map(w => `${c}/${d.id}: ${w}`));
    return withExit({checked: docs.length, lint: found, notes: noted}, found.length ? 1 : 0);
  }
  if (cmd === "orphans") return {orphans: cards.filter(d => !exists(d.data.session)).map(d => ({id: d.id, session: d.data.session ?? null}))};
  // prune: finished sessions whose last touch (their own times and their cards' updated) is before local midnight of --before.
  const cutoff = new Date(`${o.before}T00:00:00`).getTime();
  const touch = s => Math.max(...touchTimes(s, cards));
  const picked = sessions.filter(s => (s.data.completed || FINISHED.test(String(s.data.status ?? ""))) && Number.isFinite(touch(s)) && touch(s) < cutoff);
  const pickedCards = cards.filter(c => picked.some(s => s.id === c.data.session));
  const summary = {before: o.before, sessions: picked.map(d => d.id), cards: pickedCards.map(d => d.id)};
  if (!o.apply) return {...summary, dryRun: true};
  if (!picked.length) return {...summary, applied: false};
  let all = {};
  if (existsSync(o.archive)) try { all = JSON.parse(readFileSync(o.archive, "utf8").replace(/^﻿/, "")); } catch (e) { throw new CliError(`cannot read archive ${o.archive}: ${e.message}`); }
  for (const [c, list] of [["sessions", picked], ["cards", pickedCards]]){ all[c] = all[c] || {}; for (const d of list) all[c][d.id] = d.data; }
  writeFileSync(o.archive, JSON.stringify(all, null, 2));
  // Pinned to the versions just archived: a doc touched since fails the whole batch, so nothing unarchived is lost.
  await call(base, "POST", "/api/batch", {writes: [...picked.map(d => ({op: "delete", collection: "sessions", id: d.id, ifVersion: d.version})),
    ...pickedCards.map(d => ({op: "delete", collection: "cards", id: d.id, ifVersion: d.version}))]});
  return {...summary, applied: true, archive: o.archive};
}

if (isMain(import.meta.url)){
  try {
    const out = await run(process.argv.slice(2));
    // Write warnings go to stderr, so stdout keeps the raw commands' exact shape and the exit stays 0.
    if (out && typeof out === "object" && Array.isArray(out.warnings)){ for (const w of out.warnings) console.error(`warning: ${w}`); delete out.warnings; }
    if (out !== undefined) console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
    if (out?.exitCode) process.exitCode = out.exitCode;
  } catch (e) {
    console.error(e instanceof CliError ? e.message : `error: ${e.message}`);
    process.exitCode = e.exit || 1;
  }
}
