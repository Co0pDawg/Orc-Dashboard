// npm run check: node --check every .js file under the board folder.
import {readdirSync} from "node:fs";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const walk = d => readdirSync(d, {withFileTypes: true}).flatMap(e => e.name === "node_modules" ? [] : e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".js") ? [join(d, e.name)] : []);
const files = walk(fileURLToPath(new URL("..", import.meta.url)));
for (const f of files) execFileSync(process.execPath, ["--check", f], {stdio: "inherit"});
console.log(`node --check ok: ${files.length} files`);
