// File-backed document store for the local board: <dir>/<collection>/<docId>.json, each {"version", "data"}.
// Pure Node, synchronous, so one write never interleaves with another inside the server process.
import {mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, existsSync} from "node:fs";
import {homedir} from "node:os";
import {join} from "node:path";

const ID = /^[A-Za-z0-9_.~:@+-]{1,200}$/;

/** A typed store error: code is "invalid", "conflict", "notfound" or "corrupt" (an unreadable doc file); a conflict carries the current version. */
export class StoreError extends Error {
  constructor(code, message, version){ super(message); this.code = code; if (version !== undefined) this.version = version; }
}

/** The data dir: ORC_BOARD_DATA, else ~/.orc-board/data. */
export const defaultDataDir = () => process.env.ORC_BOARD_DATA || join(homedir(), ".orc-board", "data");

/** Throws unless name is a valid collection or doc id (checked before any path is built, so no traversal). */
export function checkId(name, what = "id"){
  if (typeof name !== "string" || !ID.test(name) || name === "." || name === ".." || name === "__proto__") throw new StoreError("invalid", `invalid ${what}: ${JSON.stringify(name)}`);
  // Escapes lengthen the file name (":" and capitals); past 200 it would no longer fit a 255-character file name with its suffixes.
  if (toFile(name).length > 200) throw new StoreError("invalid", `${what} too long once encoded as a file name: ${JSON.stringify(name)}`);
}

// Windows forbids ":" and reserved device names and drops trailing dots, so file names are percent-encoded; decoding restores the id.
// Windows and macOS also ignore case in file names, so every capital (hex digits of an escape included) is written as "^" + lowercase:
// ids "A" and "a" stay two files. The reserved-name escape runs last and uses lowercase hex, so it adds no capital.
const toFile = id => encodeURIComponent(id).replace(/\.$/, "%2E").replace(/[A-Z]/g, m => "^" + m.toLowerCase())
  .replace(/^(con|prn|aux|nul|com\d|lpt\d)(?=\.|$)/, m => "%" + m.charCodeAt(0).toString(16) + m.slice(1));
const fromFile = f => decodeURIComponent(f.replace(/\^([a-z])/g, (m, c) => c.toUpperCase()));
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Opens a store over dir (default: defaultDataDir()). */
export function openStore(dir = defaultDataDir()){
  const colDir = c => join(dir, toFile(c));
  const docPath = (c, id) => join(colDir(c), toFile(id) + ".json");
  const stats = {reads: 0};
  const raw = p => { try { stats.reads++; return readFileSync(p, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; } };
  // Parsed docs keyed by path, checked against mtime and size on every read so a hand-edited or added file is still seen.
  // Cached data is shared: callers never mutate what get/list return.
  const cache = new Map();
  function read(c, id){
    const p = docPath(c, id);
    let st;
    try { st = statSync(p); } catch (e) { if (e.code === "ENOENT") { cache.delete(p); return null; } throw e; }
    const hit = cache.get(p);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.f;
    const text = raw(p);
    if (text === null) return null;
    let f;
    try { f = JSON.parse(text); } catch { f = null; }
    if (!isObj(f) || !Number.isInteger(f.version) || !isObj(f.data)) { cache.delete(p); throw new StoreError("corrupt", `${c}/${id}: the doc file is not a valid {version, data} record`); }
    cache.set(p, {mtimeMs: st.mtimeMs, size: st.size, f});
    return f;
  }
  // Names that do not decode to a valid id (stray files, hand edits) are skipped, never fatal to a whole listing.
  const decoded = name => { try { const id = fromFile(name); checkId(id); return id; } catch { return null; } };
  const out = (id, f) => f ? {id, version: f.version, data: f.data} : null;

  function write(c, id, file){
    const p = docPath(c, id);
    cache.delete(p);
    if (!file){ rmSync(p, {force: true}); return; }
    mkdirSync(colDir(c), {recursive: true});
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(file));
    // Rename over an open file can fail briefly on Windows (EPERM/EBUSY, e.g. antivirus); retry a few times.
    for (let i = 0; ; i++){
      try { renameSync(tmp, p); return; }
      catch (e) { if (i >= 9 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) { rmSync(tmp, {force: true}); throw e; } sleep(20 * (i + 1)); }
    }
  }

  // Applies one write to the current file (or null) and returns the next file (null = deleted). Writes nothing.
  function next(cur, w){
    checkId(w.collection, "collection"); checkId(w.id);
    if (w.ifVersion !== undefined && w.ifVersion !== null){
      if (!Number.isInteger(w.ifVersion) || w.ifVersion < 1) throw new StoreError("invalid", "ifVersion must be a positive integer");
      const v = cur ? cur.version : 0;
      if (w.ifVersion !== v) throw new StoreError("conflict", `${w.collection}/${w.id} is at version ${v}, not ${w.ifVersion}`, v);
    }
    const version = (cur ? cur.version : 0) + 1;
    switch (w.op){
      case "set":
        if (!isObj(w.data)) throw new StoreError("invalid", "data must be a JSON object");
        return {version, data: w.data};
      case "update": {
        if (!isObj(w.data)) throw new StoreError("invalid", "data must be a JSON object");
        const data = {...(cur ? cur.data : {})};
        // Assigning "__proto__" would set the prototype and silently drop the field.
        if (Object.hasOwn(w.data, "__proto__")) throw new StoreError("invalid", "field name __proto__ is not allowed");
        for (const [k, v] of Object.entries(w.data)) if (isObj(v) && v.__delete__ === true) delete data[k]; else data[k] = v;
        return {version, data};
      }
      case "append": {
        if (typeof w.field !== "string" || !w.field || w.field === "__proto__") throw new StoreError("invalid", "field must be a non-empty string other than __proto__");
        if (w.value === undefined) throw new StoreError("invalid", "value is required");
        const data = {...(cur ? cur.data : {})}, arr = data[w.field] ?? [];
        if (!Array.isArray(arr)) throw new StoreError("invalid", `field ${w.field} is not an array`);
        data[w.field] = [...arr, w.value];
        return {version, data};
      }
      case "delete":
        if (!cur) throw new StoreError("notfound", `${w.collection}/${w.id} not found`);
        return null;
      default: throw new StoreError("invalid", `unknown op: ${JSON.stringify(w.op)}`);
    }
  }

  const one = w => { const f = next(read(w.collection, w.id), w); write(w.collection, w.id, f); return f ? out(w.id, f) : {id: w.id, deleted: true}; };

  return {
    dir,
    /** Counts actual doc file reads (cache misses), for tests. */
    stats,
    /** Every collection name. */
    collections: () => existsSync(dir) ? readdirSync(dir, {withFileTypes: true}).filter(e => e.isDirectory() && !e.name.startsWith(".")).map(e => decoded(e.name)).filter(Boolean) : [],
    get(c, id){ checkId(c, "collection"); checkId(id); return out(id, read(c, id)); },
    list(c){
      checkId(c, "collection");
      if (!existsSync(colDir(c))) return [];
      // One unreadable doc must not blank the page, so it is left out here; a direct get still reports it.
      return readdirSync(colDir(c)).filter(f => f.endsWith(".json")).map(f => decoded(f.slice(0, -5))).filter(Boolean).sort()
        .map(id => { try { return out(id, read(c, id)); } catch { return null; } }).filter(Boolean);
    },
    set: (collection, id, data, {ifVersion} = {}) => one({op: "set", collection, id, data, ifVersion}),
    update: (collection, id, data, {ifVersion} = {}) => one({op: "update", collection, id, data, ifVersion}),
    append: (collection, id, field, value, {ifVersion} = {}) => one({op: "append", collection, id, field, value, ifVersion}),
    remove: (collection, id, {ifVersion} = {}) => one({op: "delete", collection, id, ifVersion}),
    /** Validates every write and pin against an in-memory overlay first, then writes all, so a bad entry writes nothing. */
    batch(writes){
      if (!Array.isArray(writes) || !writes.length) throw new StoreError("invalid", "writes must be a non-empty array");
      const overlay = new Map(), key = w => `${w.collection}\u0000${w.id}`;
      const results = writes.map((w, i) => {
        if (!isObj(w)) throw new StoreError("invalid", `entry ${i + 1}: not an object`);
        try {
          checkId(w.collection, "collection"); checkId(w.id);
          const f = next(overlay.has(key(w)) ? overlay.get(key(w)) : read(w.collection, w.id), w);
          overlay.set(key(w), f);
          return f ? out(w.id, f) : {id: w.id, deleted: true};
        } catch (e) { if (e instanceof StoreError) e.message = `entry ${i + 1}: ${e.message}`; throw e; }
      });
      // Keep each target's previous bytes so a failed write (disk, lock) can put back the ones already written.
      const targets = [...overlay].map(([k, f]) => { const [c, id] = k.split("\u0000"); return {c, id, f, before: raw(docPath(c, id))}; });
      const done = [];
      try { for (const t of targets){ write(t.c, t.id, t.f); done.push(t); } }
      catch (e) {
        for (const t of done.reverse()){
          try { cache.delete(docPath(t.c, t.id)); if (t.before === null) rmSync(docPath(t.c, t.id), {force: true}); else writeFileSync(docPath(t.c, t.id), t.before); } catch { /* best effort */ }
        }
        throw e;
      }
      return results;
    },
  };
}
