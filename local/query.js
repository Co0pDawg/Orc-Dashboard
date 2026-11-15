// Client-side filter, sort and subscription feed for the local db stand-in. No imports: the server inlines this file into
// local/db-shim.js (with "export" stripped), so node:test exercises the exact code the browser runs.

const OPS = {"==": (a, b) => a === b, "!=": (a, b) => a !== b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, ">": (a, b) => a > b, ">=": (a, b) => a >= b};

/** True when data satisfies every [field, op, value] clause; a missing field matches no clause. */
export function matches(data, wheres){
  return wheres.every(([f, op, v]) => {
    if (!OPS[op]) throw new Error(`unsupported operator: ${op}`);
    return data[f] !== undefined && OPS[op](data[f], v);
  });
}

/** Filters docs ({id, data}) by wheres, then sorts by order [field, "asc"|"desc"]; docs missing the field sort last. */
export function runQuery(docs, wheres = [], order = null){
  const out = docs.filter(d => matches(d.data, wheres));
  if (!order) return out;
  const [f, dir] = order, sign = dir === "desc" ? -1 : 1;
  return out.sort((a, b) => {
    const x = a.data[f], y = b.data[f];
    if (x === undefined || y === undefined) return (x === undefined) - (y === undefined);
    return x < y ? -sign : x > y ? sign : 0;
  });
}

/** Live subscriptions over load(name) -> Promise<docs>: one load per collection, shared by all its subscriptions,
 * and only the newest load's result is delivered (an older response that lands late is dropped). */
export function createFeed(load){
  const cols = new Map();
  async function refresh(name){
    const c = cols.get(name);
    if (!c || !c.subs.size) return;
    const gen = ++c.gen;
    let docs, err;
    try { docs = await load(name); } catch (e) { err = e; }
    if (gen !== c.gen) return;
    for (const s of [...c.subs]){
      if (!c.subs.has(s)) continue;
      try {
        if (err) throw err;
        const out = runQuery(docs, s.wheres, s.order), key = JSON.stringify(out.map(d => [d.id, d.data]));
        // The page re-renders on every snapshot, so an unchanged result is not delivered again.
        if (key === s.last) continue;
        s.last = key;
        s.onNext({docs: out.map(d => ({id: d.id, data: () => d.data}))});
      } catch (e) { report(s, e); }
    }
  }
  // After an error the next good load is delivered even when unchanged, so the page learns the server is back.
  function report(s, e){ s.last = null; if (s.onError) s.onError(e); }
  return {
    refresh,
    /** Refreshes every collection that has a live subscription. */
    refreshAll: () => Promise.all([...cols.keys()].map(refresh)),
    /** Reports err (e.g. a dropped event stream) to every live subscription. */
    fail: err => { for (const c of cols.values()) for (const s of [...c.subs]) report(s, err); },
    /** Adds a subscription, loads its collection and returns the unsubscribe function. */
    subscribe(name, wheres, order, onNext, onError){
      if (!cols.has(name)) cols.set(name, {gen: 0, subs: new Set()});
      const s = {wheres, order, onNext, onError, last: null};
      cols.get(name).subs.add(s);
      refresh(name);
      return () => { cols.get(name).subs.delete(s); };
    },
  };
}
