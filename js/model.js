// Pure data logic over the db documents: no DOM, no storage.

/** Sleek stage-state labels. */
export const LABEL = {done:"Done", active:"In progress", rework:"Rework", pending:"Queued", skipped:"Skipped"};
/** 1337 stage-state words. */
export const WORD = {done:"✓ done", active:"● running", rework:"✗ rework", pending:"· queued", skipped:"– skipped"};
/** The activity log turns amber after this long without an event. */
export const QUIET_MS = 45 * 60000;

/** A card's overall state: rework beats active beats done (skipped counts as done); otherwise pending. */
export function cardState(c){
  const st = c.stages || [];
  if (st.some(s => s.state === "rework")) return "rework";
  if (st.some(s => s.state === "active")) return "active";
  if (st.length && st.every(s => s.state === "done" || s.state === "skipped")) return "done";
  return "pending";
}
/** Sleek pill text for a card. */
export function stageLabel(c){
  const st = c.stages || [], s = cardState(c);
  if (s === "done") return "Done";
  const cur = st.find(x => x.state === "rework") || st.find(x => x.state === "active");
  if (cur) return (s === "rework" ? "Rework: " : "") + cur.label;
  const next = st.find(x => x.state === "pending");
  return st.some(x => x.state === "done") && next ? "Next: " + next.label : "Queued";
}
// The stage a card is waiting on (rework first), timed from its `started`, else the card's last update.
/** Start time of the stage a card is waiting on, or null. */
export function stageSince(c){
  const st = c.stages || [], cur = st.find(x => x.state === "rework") || st.find(x => x.state === "active");
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
  const all = cards.flatMap(c => c.stages || []);
  return {all: all.length, done: all.filter(x => x.state === "done" || x.state === "skipped").length, tickets: cards.length, ticketsDone: cards.filter(c => cardState(c) === "done").length};
}
// A session is finished once Fable writes `completed` (or status Done); finished sessions start minimized
// and stay off the chips until "Show finished" is on.
/** True when a session is finished. */
export const isDone = s => !!s.data.completed || /^(done|complete|completed|finished)$/i.test(s.data.status || "");
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
export const visibleSessions = (sessions, showDone) => sessions.filter(s => !isDone(s)).concat(showDone ? sessions.filter(isDone) : []);
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
