// Write-time checks for board docs against README "Data contract". Pure: warnings only, never blocks a write.

/** The five stage states the page knows. */
export const STATES = ["pending", "active", "rework", "done", "skipped"];
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/;
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);

/** True when s is an ISO time with seconds optional and an offset (or Z). */
export const isIso = s => typeof s === "string" && ISO.test(s) && !Number.isNaN(Date.parse(s));

/** Warnings for a sessions or cards doc; opts.sessionExists(id) adds the card-to-session check (server side). */
export function lint(collection, data, {sessionExists} = {}){
  if (collection !== "sessions" && collection !== "cards") return [];
  if (!isObj(data)) return ["doc is not an object"];
  const w = [];
  const time = (v, where) => { if (v !== undefined && !isIso(v)) w.push(`${where} is not an ISO time with offset: ${JSON.stringify(v)}`); };
  const lines = (arr, where, sub) => {
    if (arr === undefined) return;
    if (!Array.isArray(arr)) { w.push(`${where} is not an array`); return; }
    arr.forEach((e, i) => {
      if (!isObj(e) || e.at === undefined || typeof e.text !== "string") { w.push(`${where}[${i}] needs at and text`); return; }
      time(e.at, `${where}[${i}].at`);
      if (sub) lines(e.sub, `${where}[${i}].sub`, false);
    });
  };
  if (typeof data.title !== "string" || !data.title) w.push("missing title");
  time(data.updated, "updated");
  time(data.started, "started");
  if (collection === "sessions"){
    lines(data.events, "events", true);
    if (data.links !== undefined){
      if (!isObj(data.links)) w.push("links is not an object");
      else for (const [k, t] of Object.entries(data.links))
        if (typeof t !== "string" || !t.startsWith("https://") || !t.includes("{id}")) w.push(`links.${k} must be an https:// template containing {id}`);
    }
  } else {
    if (data.stages !== undefined && !isLegacyStages(data.stages)){
      if (!Array.isArray(data.stages)) w.push("stages is not an array of {label, state}");
      else data.stages.forEach((s, i) => {
        if (!isObj(s) || typeof s.label !== "string" || typeof s.state !== "string") { w.push(`stages[${i}] is not {label, state}`); return; }
        if (!STATES.includes(s.state)) w.push(`stages[${i}] (${s.label}) state ${JSON.stringify(s.state)} is not one of ${STATES.join("|")}`);
        time(s.started, `stages[${i}].started`);
      });
    }
    lines(data.progress, "progress", false);
    if (sessionExists && typeof data.session === "string" && !exists(sessionExists, data.session)) w.push(`session ${data.session} does not exist`);
  }
  return w;
}

// A lookup that throws (an id the store rejects, like "sessions/abc") means the reference is bad: a warning, never an error,
// because lint runs after a write was applied and must not change that write's answer.
const exists = (fn, id) => { try { return !!fn(id); } catch { return false; } };

// The page also reads stages stored as an object ({build: "done"} or {build: {state, started}}); js/model.js stagesOf.
const isLegacyStages = st => isObj(st);

/** Lower-severity notes that never fail `lint` or block a write: today only the legacy stages object. */
export function notes(collection, data){
  return collection === "cards" && isObj(data) && isLegacyStages(data.stages) ? ["legacy stages object; write the array form"] : [];
}

/**
 * A card's stages as [{label, state, started?}] in stored order, whatever shape was stored. Mirrors js/model.js stagesOf
 * (an object entry {build: "done"} or {build: {state, started}} becomes one stage, the key capitalised); an object entry
 * without a state gets "pending", so every entry is a valid {label, state}. An unknown state stays raw (lint warns).
 */
export function stagesArray(st){
  const cap = k => k.charAt(0).toUpperCase() + k.slice(1);
  if (Array.isArray(st)) return st;
  if (isObj(st)) return Object.entries(st).map(([k, v]) => isObj(v) ? {label: cap(k), ...v, state: v.state == null ? "pending" : String(v.state)} : {label: cap(k), state: String(v)});
  return [];
}

// README "Data contract", the chips rule: a session is touched by its started, updated, completed, every event and
// sub-event at, and each of its cards' updated, progress[].at and stages[].started. Mirrors js/model.js touchTimes,
// which local/ cannot import (the CLI must run from a copy of local/ alone).
/** Every touch time (ms) of session doc s ({id, data}) and its cards ({data}); unparseable times are left out. */
export function touchTimes(s, cards = []){
  const d = isObj(s.data) ? s.data : {}, list = x => Array.isArray(x) ? x.filter(isObj) : [];
  return [d.started, d.updated, d.completed, ...list(d.events).flatMap(e => [e.at, ...list(e.sub).map(x => x.at)]),
    ...cards.map(c => c.data).filter(c => isObj(c) && c.session === s.id).flatMap(c => [c.updated, ...list(c.progress).map(p => p.at), ...stagesArray(c.stages).filter(isObj).map(x => x.started)])]
    .map(t => typeof t === "string" ? Date.parse(t) : NaN).filter(Number.isFinite);
}
