// Session search: pure matching and ranking over every session, on any day. No DOM, no storage.
import {touchTimes} from "./model.js";

// Case and punctuation never matter: "PET-17983", "#17983" and "review/6250" fold to plain words.
const norm = v => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The session's latest touch (same sources as touchedOn) as an ISO string, or null. */
export const lastTouched = (s, cards = []) => touchTimes(s, cards).filter(t => !isNaN(Date.parse(t))).reduce((m, t) => !m || Date.parse(t) > Date.parse(m) ? t : m, null);
/** True while a pinned search result ({id, day}) is still on its day and still in the shown list. */
export const keepOpened = (o, day, shown) => !!o && o.day === day && shown.includes(o.id);
// Every word must start a word somewhere in the session's title, ticket, branch, id or its cards' titles, tickets and tasks.
// A ticket hit (a number inside a ticket or task) or an exact title outranks the rest; then newest touch first.
/** {hits: [{s, last}], more}: the best `cap` matches for query and how many more matched. */
export function searchSessions(sessions, cards, query, cap = 8){
  const q = norm(query).replace(/^pet (?=\d)/, ""), words = q.split(" ").filter(Boolean);
  if (!words.length) return {hits: [], more: 0};
  const all = sessions.flatMap(s => {
    const own = cards.filter(c => c.session === s.id), d = s.data;
    const tickets = [d.ticket, ...own.flatMap(c => [c.ticket, c.task])].map(norm).filter(Boolean);
    const hay = " " + [d.title, d.branch, s.id, ...own.map(c => c.title), ...tickets].map(norm).join(" ");
    // Word starts, so "02" in "2026-10-02" does not also match every "2026".
    if (!words.every(w => hay.includes(" " + w))) return [];
    const top = norm(d.title) === q || words.some(w => /^\d+$/.test(w) && tickets.some(t => (" " + t).includes(" " + w)));
    return [{s, last: lastTouched(s, cards), top}];
  });
  all.sort((a, b) => (b.top - a.top) || (Date.parse(b.last) || 0) - (Date.parse(a.last) || 0));
  return {hits: all.slice(0, cap).map(({s, last}) => ({s, last})), more: Math.max(0, all.length - cap)};
}
