// Local board CLI, for any agent tool that can run a shell command: node local/board.js <command> ...
// JSON on stdout; errors on stderr with exit 1 (a conflict exits 2 and prints the current version).
// The CLI never adds fields such as timestamps or `updated`: callers pass their own.
import {spawn} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import {homedir} from "node:os";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {isMain, portFrom, start} from "./server.js";

const USAGE = `usage: node local/board.js <command> [--no-start] [--port N]
  serve | url | get <col>/<id> | list <col>
  set|update <col>/<id> (--data <json> | --file <path> | --stdin) [--if-version N]
  append <col>/<id> <field> (--data | --file | --stdin) [--if-version N]
  delete <col>/<id> [--if-version N] | batch (--file | --stdin) | export [--out <file>] | import <file>`;

class CliError extends Error { constructor(message, code = 1){ super(message); this.exit = code; } }

function parse(argv){
  const opts = {_: []};
  for (let i = 0; i < argv.length; i++){
    const a = argv[i];
    if (a === "--stdin" || a === "--no-start") opts[a.slice(2)] = true;
    else if (["--data", "--file", "--if-version", "--out", "--port"].includes(a)){ if (i + 1 >= argv.length) throw new CliError(`${a} needs a value`); opts[a.slice(2)] = argv[++i]; }
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
  const norm = p => process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p);
  if (!h.dataDir || norm(h.dataDir) !== norm(want)) throw new CliError(`the board server on this port uses data dir ${h.dataDir || "(unknown: an older server, restart it)"}, not ORC_BOARD_DATA=${want}; stop it or set ORC_BOARD_PORT to another port`);
}

// Starts the server detached when nothing answers on the port, so agents never have to manage it.
async function ensureServer(base, port, noStart){
  let h = await health(base);
  if (h && h.app !== "orc-board") throw new CliError(`port ${port} answers but is not the orc board; set ORC_BOARD_PORT to a free port`);
  if (h) return sameData(h);
  if (noStart) throw new CliError(`no board server on ${base} (started with --no-start); run: node local/board.js serve`);
  const server = fileURLToPath(new URL("./server.js", import.meta.url));
  spawn(process.execPath, [server, "--port", String(port)], {detached: true, stdio: "ignore", windowsHide: true, env: process.env, cwd: homedir()}).unref();
  for (const until = Date.now() + 5000; Date.now() < until;){
    await new Promise(r => setTimeout(r, 150));
    h = await health(base);
    if (h?.app === "orc-board") return sameData(h);
  }
  throw new CliError(`started the board server but ${base} did not answer within 5 s`);
}

async function call(base, method, path, body){
  const r = await fetch(base + path, {method, headers: {"x-orc-board": "1", "content-type": "application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
  const out = await r.json().catch(() => ({}));
  if (r.status === 409) throw new CliError(`conflict: current version is ${out.version}${out.message ? ` (${out.message})` : ""}`, 2);
  if (!r.ok) throw new CliError(`${method} ${path}: ${r.status} ${out.error || ""}`.trim());
  return out;
}

/** Runs one CLI invocation (argv without node and script); resolves to the value to print, or throws a CliError. */
export async function run(argv){
  const o = parse(argv), [cmd, ...rest] = o._;
  const port = portFrom(o.port ? ["--port", o.port] : []), base = `http://127.0.0.1:${port}`;
  if (!cmd || cmd === "help") throw new CliError(USAGE);
  if (cmd === "serve"){ const s = await start({port}); console.error(`orc-board: http://localhost:${s.address().port}/`); return undefined; }
  if (cmd === "url") return `http://localhost:${port}/`;
  const known = ["get", "list", "set", "update", "append", "delete", "batch", "export", "import"];
  if (!known.includes(cmd)) throw new CliError(`unknown command ${cmd}\n${USAGE}`);
  // Parse input before starting anything, so a bad call fails fast.
  const input = ["set", "update", "append", "batch"].includes(cmd) ? jsonArg(o) : undefined;
  await ensureServer(base, port, o["no-start"]);
  switch (cmd){
    case "get": return call(base, "GET", "/api/db/" + docRef(rest[0]));
    case "list": if (!rest[0]) throw new CliError("list needs a collection"); return call(base, "GET", "/api/db/" + encodeURIComponent(rest[0]));
    case "set": return call(base, "PUT", "/api/db/" + docRef(rest[0]), {data: input, ifVersion: pin(o)});
    case "update": return call(base, "PATCH", "/api/db/" + docRef(rest[0]), {data: input, ifVersion: pin(o)});
    case "append": if (!rest[1]) throw new CliError("append needs a field"); return call(base, "POST", `/api/db/${docRef(rest[0])}/append`, {field: rest[1], value: input, ifVersion: pin(o)});
    case "delete": { const v = pin(o); return call(base, "DELETE", "/api/db/" + docRef(rest[0]) + (v ? `?ifVersion=${v}` : "")); }
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

if (isMain(import.meta.url)){
  try {
    const out = await run(process.argv.slice(2));
    if (out !== undefined) console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  } catch (e) {
    console.error(e instanceof CliError ? e.message : `error: ${e.message}`);
    process.exitCode = e.exit || 1;
  }
}
