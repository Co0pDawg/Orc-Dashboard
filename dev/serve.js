// Static server for the preview: node dev/serve.js [port], then open http://localhost:8123/dev/preview.html
// (file:// cannot load ES modules). Serves the board folder only.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname, join, normalize, sep} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"};
const port = Number(process.argv[2]) || 8123;

createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(root.replace(/[\\/]$/, "") + sep) && path !== root) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, {"content-type": types[extname(path)] || "application/octet-stream", "cache-control": "no-store"}).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(port, "127.0.0.1", () => console.log(`http://localhost:${port}/dev/preview.html`));
