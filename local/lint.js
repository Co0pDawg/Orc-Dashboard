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
    if (data.stages !== undefined){
      if (!Array.isArray(data.stages)) w.push("stages is not an array of {label, state}");
      else data.stages.forEach((s, i) => {
        if (!isObj(s) || typeof s.label !== "string" || typeof s.state !== "string") { w.push(`stages[${i}] is not {label, state}`); return; }
        if (!STATES.includes(s.state)) w.push(`stages[${i}] (${s.label}) state ${JSON.stringify(s.state)} is not one of ${STATES.join("|")}`);
        time(s.started, `stages[${i}].started`);
      });
    }
    lines(data.progress, "progress", false);
    if (sessionExists && typeof data.session === "string" && !sessionExists(data.session)) w.push(`session ${data.session} does not exist`);
  }
  return w;
}
