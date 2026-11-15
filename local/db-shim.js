// Browser stand-in for the artifact db, served by local/server.js. A classic script, loaded before js/main.js.
// The server replaces the marker below with local/query.js (export keywords stripped), so the filter and sort
// logic has one source that node:test covers and cannot drift from what the browser runs.
(() => {
  /*@query.js@*/
  const subs = new Set();
  let es = null;
  // One shared EventSource; its "open" fires again after every reconnect, when anything may have changed.
  function connect(){
    let opened = false;
    es = new EventSource("/api/events");
    es.addEventListener("open", () => { if (opened) subs.forEach(s => s.refresh()); opened = true; });
    es.addEventListener("change", e => {
      const {collections} = JSON.parse(e.data);
      subs.forEach(s => { if (collections.includes(s.name)) s.refresh(); });
    });
  }
  const query = (name, wheres = [], order = null) => ({
    where: (f, op, v) => query(name, [...wheres, [f, op, v]], order),
    orderBy: (f, dir = "asc") => query(name, wheres, [f, dir]),
    onSnapshot(onNext, onError){
      const s = {name, last: null, live: true, async refresh(){
        try {
          const r = await fetch("/api/db/" + encodeURIComponent(name), {cache: "no-store"});
          if (!r.ok) throw new Error(`GET ${name}: ${r.status}`);
          const docs = runQuery((await r.json()).docs, wheres, order);
          const key = JSON.stringify(docs.map(d => [d.id, d.data]));
          // The page re-renders on every snapshot, so an unchanged result is not delivered again.
          if (!s.live || key === s.last) return;
          s.last = key;
          onNext({docs: docs.map(d => ({id: d.id, data: () => d.data}))});
        } catch (e) { if (s.live && onError) onError(e); }
      }};
      subs.add(s);
      if (!es) connect();
      s.refresh();
      return () => { s.live = false; subs.delete(s); };
    },
  });
  const db = {collection: name => query(name)};
  window.claude = {use: async n => n === "db" ? db : null};
})();
