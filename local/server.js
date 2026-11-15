// Local board server: node local/server.js [--port N]. Serves the real page shell with a db stand-in, a JSON API
// over the file store, and Server-Sent Events. Binds 127.0.0.1 only; the page reads, only the CLI writes.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname, join, normalize, sep} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {openStore, StoreError, defaultDataDir} from "./store.js";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const types = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json"};
const MAX_BODY = 2 * 1024 * 1024;
/** The default port when neither --port nor ORC_BOARD_PORT is given. */
export const DEFAULT_PORT = 8377;

// Stand-in for the artifact skeleton (as in dev/preview.html); the page shell itself is read from disk, never copied.
const skeleton = page => `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0;font:14px sans-serif}[hidden]{display:none!important}</style>
<script src="local/db-shim.js"></script>
${page}</html>`;

class HttpError extends Error { constructor(status, message){ super(message); this.status = status; } }

/** Starts the server on {port, dataDir}; resolves to the listening http.Server (port 0 picks a free port). */
export function start({port = DEFAULT_PORT, dataDir = defaultDataDir()} = {}){
  const store = openStore(dataDir);
  const clients = new Set();
  let queue = Promise.resolve();
  // One queue for every write, so concurrent requests touching the same doc apply one after another.
  const enqueue = fn => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };
  const notify = cols => { const msg = `event: change\ndata: ${JSON.stringify({collections: [...new Set(cols)]})}\n\n`; clients.forEach(c => c.write(msg)); };
  const heartbeat = setInterval(() => clients.forEach(c => c.write(": ping\n\n")), 15000);
  heartbeat.unref();

  const send = (res, status, body) => res.writeHead(status, {"content-type": "application/json", "cache-control": "no-store"}).end(JSON.stringify(body));

  async function readJson(req){
    if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) throw new HttpError(403, "content-type must be application/json");
    const chunks = []; let size = 0;
    for await (const c of req){ size += c.length; if (size > MAX_BODY) throw new HttpError(413, "body over 2 MiB"); chunks.push(c); }
    try { const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); if (v === null || typeof v !== "object" || Array.isArray(v)) throw 0; return v; }
    catch { throw new HttpError(400, "body must be a JSON object"); }
  }

  async function staticFile(res, path){
    // Only the page's own folders plus the shim; never dev/, tests/, .git, the data dir or other local/ files.
    const allowed = path === "/local/db-shim.js" || /^\/(css|js)\//.test(path);
    const file = normalize(join(root, path));
    if (!allowed || !file.startsWith(root + sep) || (path !== "/local/db-shim.js" && !/^(css|js)$/.test(file.slice(root.length + 1).split(sep)[0]))) return send(res, 404, {error: "not found"});
    try {
      let body = await readFile(file);
      if (path === "/local/db-shim.js") body = body.toString("utf8").replace("/*@query.js@*/", (await readFile(join(root, "local", "query.js"), "utf8")).replace(/^export /gm, ""));
      res.writeHead(200, {"content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store"}).end(body);
    } catch { send(res, 404, {error: "not found"}); }
  }

  async function handle(req, res, port){
    const host = req.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, {error: "bad host"});
    const url = new URL(req.url, `http://${host}`);
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return send(res, 400, {error: "bad path"}); }
    if (req.method !== "GET"){
      // Writes need the CLI's header and JSON, and no foreign Origin, so another web page cannot write (no CORS is ever sent).
      const origin = req.headers.origin;
      if (req.headers["x-orc-board"] !== "1" || !/^application\/json\b/i.test(req.headers["content-type"] || "") || (origin !== undefined && origin !== `http://${host}`)) return send(res, 403, {error: "forbidden"});
    }
    if (req.method === "GET" && (path === "/" || path === "/index.html")){
      const page = await readFile(join(root, "orchestration-board.html"), "utf8");
      return res.writeHead(200, {"content-type": types[".html"], "cache-control": "no-store"}).end(skeleton(page));
    }
    if (req.method === "GET" && path === "/api/health") return send(res, 200, {ok: true, app: "orc-board", version: 1, pid: process.pid});
    if (req.method === "GET" && path === "/api/events"){
      res.writeHead(200, {"content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive"});
      res.write(": connected\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "POST" && path === "/api/batch"){
      const {writes} = await readJson(req);
      const docs = await enqueue(() => store.batch(writes));
      notify(writes.map(w => w.collection));
      return send(res, 200, {docs});
    }
    const m = path.match(/^\/api\/db(?:\/([^/]+)(?:\/([^/]+)(\/append)?)?)?$/);
    if (!m){
      if (req.method === "GET") return staticFile(res, path);
      return send(res, 404, {error: "not found"});
    }
    const [, col, id, append] = m;
    if (!col){
      if (req.method === "GET") return send(res, 200, {collections: store.collections()});
      return send(res, 405, {error: "method not allowed"});
    }
    if (!id){
      if (req.method === "GET") return send(res, 200, {docs: store.list(col)});
      return send(res, 405, {error: "method not allowed"});
    }
    if (append){
      if (req.method !== "POST") return send(res, 405, {error: "method not allowed"});
      const b = await readJson(req);
      const doc = await enqueue(() => store.append(col, id, b.field, b.value, {ifVersion: b.ifVersion}));
      notify([col]);
      return send(res, 200, doc);
    }
    if (req.method === "GET"){ const doc = store.get(col, id); return doc ? send(res, 200, doc) : send(res, 404, {error: "not found"}); }
    let doc;
    if (req.method === "PUT"){ const b = await readJson(req); doc = await enqueue(() => store.set(col, id, b.data, {ifVersion: b.ifVersion})); }
    else if (req.method === "PATCH"){ const b = await readJson(req); doc = await enqueue(() => store.update(col, id, b.data, {ifVersion: b.ifVersion})); }
    else if (req.method === "DELETE"){
      const v = url.searchParams.get("ifVersion");
      doc = await enqueue(() => store.remove(col, id, {ifVersion: v === null ? undefined : Number(v)}));
    }
    else return send(res, 405, {error: "method not allowed"});
    notify([col]);
    send(res, 200, doc);
  }

  const server = createServer((req, res) => {
    handle(req, res, server.address().port).catch(e => {
      if (res.headersSent) return res.end();
      if (e instanceof StoreError) return send(res, {conflict: 409, notfound: 404}[e.code] || 400, e.code === "conflict" ? {error: "conflict", version: e.version, message: e.message} : {error: e.message});
      if (e instanceof HttpError) return send(res, e.status, {error: e.message});
      send(res, 500, {error: String(e?.message || e)});
    });
  });
  server.on("close", () => { clearInterval(heartbeat); clients.forEach(c => c.end()); });
  return new Promise((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", () => ok(server)); });
}

/** The port from --port, else ORC_BOARD_PORT, else DEFAULT_PORT. */
export function portFrom(argv = process.argv.slice(2)){
  const i = argv.indexOf("--port");
  return Number(i >= 0 ? argv[i + 1] : process.env.ORC_BOARD_PORT) || DEFAULT_PORT;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  const server = await start({port: portFrom()});
  console.log(`orc-board: http://localhost:${server.address().port}/ (data: ${defaultDataDir()})`);
}
