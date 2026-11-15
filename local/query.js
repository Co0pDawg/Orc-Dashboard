// Client-side filter and sort for the local db stand-in. No imports: the server inlines this file into
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
