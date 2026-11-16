// Browser stand-in for the artifact db, served by local/server.js. A classic script, loaded before js/main.js.
// The server replaces the marker below with local/query.js (export keywords stripped), so the filter, sort and
// subscription logic has one source that node:test covers and cannot drift from what the browser runs.
(() => {
  /*@query.js@*/
  const feed = createFeed(async name => {
    const r = await fetch("/api/db/" + encodeURIComponent(name), {cache: "no-store"});
    if (!r.ok) throw new Error(`GET ${name}: ${r.status}`);
    return (await r.json()).docs;
  });
  let es = null;
  // One shared EventSource. "open" fires on connect and after every reconnect: a write may have landed before the
  // stream registered, so every live collection refreshes then (unchanged results are not delivered twice).
  function connect(){
    es = new EventSource("/api/events");
    es.addEventListener("open", () => feed.refreshAll());
    es.addEventListener("change", e => JSON.parse(e.data).collections.forEach(feed.refresh));
    // A dropped stream reaches every subscriber's error callback; the browser reconnects and "open" refreshes them.
    es.addEventListener("error", () => feed.fail(new Error("board server not reachable")));
  }
  const query = (name, wheres = [], order = null) => ({
    where: (f, op, v) => query(name, [...wheres, [f, op, v]], order),
    orderBy: (f, dir = "asc") => query(name, wheres, [f, dir]),
    onSnapshot(onNext, onError){
      if (!es) connect();
      return feed.subscribe(name, wheres, order, onNext, onError);
    },
  });
  // `backend` lets the page tell the local board from the artifact database (the empty state names the CLI).
  const db = {backend: "local", collection: name => query(name)};
  window.claude = {use: async n => n === "db" ? db : null};
})();
