// Pure data logic over the db documents: no DOM, no storage.

/** Sleek stage-state labels. */
export const LABEL = {done:"Done", active:"In progress", rework:"Rework", pending:"Queued", skipped:"Skipped"};
/** 1337 stage-state words. */
export const WORD = {done:"✓ done", active:"● running", rework:"✗ rework", pending:"· queued", skipped:"– skipped"};
/** The activity log turns amber after this long without an event. */
export const QUIET_MS = 45 * 60000;

// The contract stores stages as [{label, state, started?}], but writers have also stored an object
// ({build: "done"} or {build: {state, started}}), so every reader goes through this.
/** A card's stages as [{label, state, started?}], whatever shape was stored. */
export function stagesOf(c){
  const st = c && c.stages, cap = k => k.charAt(0).toUpperCase() + k.slice(1);
  if (Array.isArray(st)) return st.filter(x => x && typeof x === "object");
  if (st && typeof st === "object") return Object.entries(st).map(([k, v]) => v && typeof v === "object" ? {label: cap(k), ...v} : {label: cap(k), state: String(v)});
  return [];
}
/** A card's overall state: rework beats active beats done (skipped counts as done); otherwise pending. */
export function cardState(c){
  const st = stagesOf(c);
  if (st.some(s => s.state === "rework")) return "rework";
  if (st.some(s => s.state === "active")) return "active";
  if (st.length && st.every(s => s.state === "done" || s.state === "skipped")) return "done";
  return "pending";
}
/** Sleek pill text for a card. */
export function stageLabel(c){
  const st = stagesOf(c), s = cardState(c);
  if (s === "done") return "Done";
  const cur = st.find(x => x.state === "rework") || st.find(x => x.state === "active");
  if (cur) return (s === "rework" ? "Rework: " : "") + cur.label;
  const next = st.find(x => x.state === "pending");
  return st.some(x => x.state === "done") && next ? "Next: " + next.label : "Queued";
}
// The stage a card is waiting on (rework first), timed from its `started`, else the card's last update.
/** Start time of the stage a card is waiting on, or null. */
export function stageSince(c){
  const st = stagesOf(c), cur = st.find(x => x.state === "rework") || st.find(x => x.state === "active");
  return cur ? (cur.started || c.updated) : null;
}
/** "bad", "good" or "" for an event line, by its wording. */
export function tone(text){
  if (/\b(rework|fail(ed|ing|s)?|blocked|error|denied|refused)\b/i.test(text)) return "bad";
  if (/\b(accept(ed)?|committed|pushed|approved|passed|merged)\b/i.test(text)) return "good";
  return "";
}
/** Stage and ticket counts across a session's cards. */
export function progress(cards){
  const all = cards.flatMap(stagesOf);
  return {all: all.length, done: all.filter(x => x.state === "done" || x.state === "skipped").length, tickets: cards.length, ticketsDone: cards.filter(c => cardState(c) === "done").length};
}
// Fable finishes a session by writing `completed` (or status Done). With the "pr" setting a finished session whose
// pull request is still open (draft or active) is not done yet; a session that never recorded a PR finishes as before.
/** True when Fable has marked the session finished. */
export const fableDone = s => !!s.data.completed || /^(done|complete|completed|finished)$/i.test(s.data.status || "");
/** True when a PR status is final (completed or abandoned). */
export const prFinal = status => /^(completed|merged|abandoned)$/i.test(String(status || ""));
/** True when a session is finished under the viewer's setting: "fable" (default) or "pr". */
export const isDone = (s, mode = "fable") => fableDone(s) && (mode !== "pr" || !s.data.pr || !s.data.pr.id || prFinal(s.data.pr.status));
/** A card's agent-posted progress lines, or []. */
export const progressOf = c => Array.isArray(c.progress) ? c.progress : [];
// A dispatch event that names its `card` also nests that card's agent-posted progress from its time until the next
// dispatch for the same card, so a builder's milestones sit under "builder dispatched" and a refuter's under its own.
/** Sub-lines nested under events[i], oldest first. */
export function subsOf(events, i, cards){
  const e = events[i], own = Array.isArray(e.sub) ? e.sub : [];
  const c = e.card && cards.find(x => x._id === e.card);
  if (!c || !Array.isArray(c.progress)) return own;
  const from = Date.parse(e.at), next = events.slice(i + 1).find(x => x.card === e.card), to = next ? Date.parse(next.at) : Infinity;
  return own.concat(c.progress.filter(p => { const t = Date.parse(p.at); return t >= from && t < to; })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
/** Newest activity, counting sub-events and agent-posted card progress; null when none. */
export const lastAt = (events, cards = []) => events.flatMap(e => [e.at, ...(Array.isArray(e.sub) ? e.sub.map(x => x.at) : [])]).concat(cards.flatMap(c => progressOf(c).map(x => x.at))).filter(t => !isNaN(Date.parse(t))).reduce((m, t) => !m || Date.parse(t) > Date.parse(m) ? t : m, null);
// Sessions on the chips: unfinished first (newest update first), finished after them when shown.
/** Sessions offered on the chips. */
export const visibleSessions = (sessions, showDone, mode) => sessions.filter(s => !isDone(s, mode)).concat(showDone ? sessions.filter(s => isDone(s, mode)) : []);
// What the stack shows: the saved list minus hidden finished sessions, else the newest unfinished session.
/** Session ids the stack shows. */
export function liveIds(shown, vis){
  const ids = shown.filter(id => vis.some(s => s.id === id));
  return ids.length || !vis.length ? ids : [vis[0].id];
}
// Each shown session has its own activity log pane, so its id carries the session id.
/** Pane id of a session's activity log. */
export const logId = sid => "log:" + sid;
/** True for an activity log pane id. */
export const isLog = id => id.startsWith("log:");
// A reorder sees only the panes on screen; ids it did not see (cards Hide done keeps out) go back after the id they followed.
/** next with every id of prev it lacks re-inserted after the id that came before it in prev. */
export function mergeOrder(prev, next){
  const out = [...next];
  prev.forEach((id, i) => { if (!out.includes(id)) out.splice(i ? out.indexOf(prev[i - 1]) + 1 : 0, 0, id); });
  return out;
}
