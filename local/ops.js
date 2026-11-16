// High-level board writes, each applied whole inside the server's write queue (no read-modify-write in a client).
import {StoreError} from "./store.js";
import {lint, STATES} from "./lint.js";

/** The local time as ISO with its offset, the shape of `date -Iseconds`. */
export function isoNow(d = new Date()){
  const p = n => String(n).padStart(2, "0"), off = -d.getTimezoneOffset(), a = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? "+" : "-"}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

const bad = m => new StoreError("invalid", m);
const text = t => { if (typeof t !== "string" || !t.trim()) throw bad("text is required"); return t; };
const optional = (o, k, v) => { if (v !== undefined && v !== null && v !== "") o[k] = v; };

/** Applies op (a name from OPS) with args to store; returns {id, version, <changed field>: value}. Synchronous. */
export function applyOp(store, op, a = {}, now = isoNow()){
  if (!Object.hasOwn(OPS, op)) throw bad(`unknown op: ${JSON.stringify(op)}`);
  return OPS[op](store, a, now);
}

// Reads the doc, checks the caller's pin, lets fn change a copy, refuses a result with new lint warnings, writes it pinned.
function change(store, col, id, a, fn){
  const cur = store.get(col, id);
  if (!cur) throw new StoreError("notfound", `${col}/${id} not found`);
  if (a.ifVersion !== undefined && a.ifVersion !== null && a.ifVersion !== cur.version) throw new StoreError("conflict", `${col}/${id} is at version ${cur.version}, not ${a.ifVersion}`, cur.version);
  // fn returns the changed field's name, or [name, value] when the report is an appended entry rather than the whole field.
  const data = structuredClone(cur.data), r = fn(data), [field, value] = Array.isArray(r) ? r : [r, data[r]];
  newWarnings(store, col, cur.data, data);
  const doc = store.set(col, id, data, {ifVersion: cur.version});
  return {id, version: doc.version, [field]: value};
}

function newWarnings(store, col, before, after){
  const exists = s => !!store.get("sessions", s);
  const old = new Set(before ? lint(col, before, {sessionExists: exists}) : []);
  const fresh = lint(col, after, {sessionExists: exists}).filter(w => !old.has(w));
  if (fresh.length) throw bad(`the result would not match the data contract: ${fresh.join("; ")}`);
}

function create(store, col, id, data, pin){
  const cur = store.get(col, id), v = cur ? cur.version : 0;
  // A pin on a create follows store.next: an absent doc is version 0, so any pin conflicts.
  if (pin !== undefined && pin !== null && pin !== v) throw new StoreError("conflict", `${col}/${id} is at version ${v}, not ${pin}`, v);
  if (cur) throw bad(`${col}/${id} already exists`);
  newWarnings(store, col, null, data);
  return store.set(col, id, data);
}

// The newest event, or the newest one naming card.
const newest = (events, card) => { for (let i = events.length - 1; i >= 0; i--) if (!card || events[i]?.card === card) return events[i]; return null; };

const OPS = {
  sessionStart(store, a, now){
    const data = {title: a.title};
    optional(data, "ticket", a.ticket); optional(data, "branch", a.branch);
    data.status = a.status || "Planning";
    Object.assign(data, {started: now, updated: now});
    optional(data, "now", a.now);
    if (a.linksTicket) data.links = {ticket: a.linksTicket};
    optional(data, "ado", a.ado);
    data.events = [];
    const doc = create(store, "sessions", a.id, data, a.ifVersion);
    return {id: a.id, version: doc.version, started: now};
  },
  cardAdd(store, a, now){
    if (!store.get("sessions", a.session ?? "")) throw bad(`session ${a.session} does not exist`);
    const labels = Array.isArray(a.stages) ? a.stages.map(s => String(s).trim()).filter(Boolean) : [];
    if (!labels.length) throw bad("stages are required, e.g. Build,Refute,Commit");
    if (new Set(labels).size !== labels.length) throw bad("stage labels must be unique");
    const data = {session: a.session};
    if (a.order !== undefined) { const n = Number(a.order); if (!Number.isFinite(n)) throw bad("order must be a number"); data.order = n; }
    optional(data, "ticket", a.ticket); optional(data, "task", a.task); optional(data, "kind", a.kind);
    Object.assign(data, {title: a.title, updated: now, stages: labels.map(label => ({label, state: "pending"}))});
    const doc = create(store, "cards", a.id, data, a.ifVersion);
    return {id: a.id, version: doc.version, stages: data.stages};
  },
  stage: (store, a, now) => change(store, "cards", a.id, a, d => {
    if (!STATES.includes(a.state)) throw bad(`state must be one of ${STATES.join("|")}, not ${JSON.stringify(a.state)}`);
    const s = Array.isArray(d.stages) ? d.stages.find(x => x?.label === a.label) : null;
    if (!s) throw bad(`card ${a.id} has no stage ${JSON.stringify(a.label)}; its stages: ${(Array.isArray(d.stages) ? d.stages.map(x => x?.label) : []).join(", ") || "(none)"}`);
    s.state = a.state;
    if (a.state === "active" || a.state === "rework") s.started = now;
    d.updated = now;
    return "stages";
  }),
  progress: (store, a, now) => change(store, "cards", a.id, a, d => {
    d.progress = [...(Array.isArray(d.progress) ? d.progress : []), {at: now, text: text(a.text)}];
    d.updated = now;
    return ["progress", d.progress.at(-1)];
  }),
  event: (store, a, now) => change(store, "sessions", a.id, a, d => {
    const e = {at: now, text: text(a.text)};
    optional(e, "card", a.card);
    d.events = [...(Array.isArray(d.events) ? d.events : []), e];
    d.updated = now;
    return ["event", e];
  }),
  checkin: (store, a, now) => change(store, "sessions", a.id, a, d => {
    const e = newest(Array.isArray(d.events) ? d.events : [], a.card);
    if (!e) throw new StoreError("notfound", a.card ? `session ${a.id} has no event naming card ${a.card}` : `session ${a.id} has no events`);
    e.sub = [...(Array.isArray(e.sub) ? e.sub : []), {at: now, text: text(a.text)}];
    d.updated = now;
    return ["sub", e.sub.at(-1)];
  }),
  setField: (store, a, now) => change(store, a.collection, a.id, a, d => {
    if (typeof a.field !== "string" || !a.field || a.field === "__proto__") throw bad("field must be a non-empty string other than __proto__");
    if (a.value === undefined) throw bad("value is required");
    d[a.field] = a.value;
    if (a.collection === "sessions" || a.collection === "cards") d.updated = now;
    return a.field;
  }),
  finish: (store, a, now) => change(store, "sessions", a.id, a, d => {
    d.status = a.status || "Done";
    d.completed = now;
    if (a.now) d.now = a.now;
    d.events = [...(Array.isArray(d.events) ? d.events : []), {at: now, text: a.now || `Session ${d.status}`}];
    d.updated = now;
    return "completed";
  }),
  /** Deletes a session and every card naming it in one batch. */
  deleteCascade(store, a){
    const cur = store.get("sessions", a.id);
    if (!cur) throw new StoreError("notfound", `sessions/${a.id} not found`);
    const cards = store.list("cards").filter(c => c.data.session === a.id);
    store.batch([{op: "delete", collection: "sessions", id: a.id, ifVersion: a.ifVersion ?? cur.version},
      ...cards.map(c => ({op: "delete", collection: "cards", id: c.id, ifVersion: c.version}))]);
    return {id: a.id, deleted: true, cards: cards.map(c => c.id)};
  },
};

