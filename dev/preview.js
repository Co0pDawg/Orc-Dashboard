// Loads the real page shell into the preview, so the harness never carries its own copy of the markup.
const doc = new DOMParser().parseFromString(await (await fetch("orchestration-board.html")).text(), "text/html");
document.title = doc.title;
const loaded = el => new Promise(ok => { el.onload = el.onerror = ok; });
const sheets = [...doc.querySelectorAll("link")].map(l => { const n = document.createElement("link"); n.rel = l.rel; n.href = l.getAttribute("href"); document.head.append(n); return n.rel === "stylesheet" ? loaded(n) : null; });
await Promise.all(sheets);
const scripts = [...doc.querySelectorAll("script")];
scripts.forEach(s => s.remove());
document.body.append(...doc.body.childNodes);
// Scripts parsed by DOMParser never run, so recreate them in order: Sortable first, then the module entry.
for (const s of scripts){
  const n = document.createElement("script");
  if (s.type) n.type = s.type;
  n.src = s.getAttribute("src");
  const done = loaded(n);
  document.body.append(n);
  await done;
}
