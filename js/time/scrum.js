// Pure: builds the morning-meeting summary of one day from segments and the board data. No DOM, no storage, no model.
import {normTicket, cardTicket} from "./segments.js";
import {stagesOf, cardState, fableDone} from "../model.js";

const pad = n => String(n).padStart(2, "0");
const localDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const t = e => Date.parse(e.at);
/** "2h 45m", "2h" or "45m". */
const dur = total => { const min = Math.round(total), h = Math.floor(min / 60), m = min % 60; return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`; };
// "pre-PR review", a bare "PR 6218" and "commit groups 1-3" are not outcomes; a PR opened, updated or merged is, and a commit names its hash.
const OUTCOME = /\b(?:accept|rework)|\bdone\b|\bcommit(?:s|ted)?\b[^.;]*?\b[0-9a-f]{7,40}\b|(?<![\w-])PR\b.{0,40}?\b(?:opened|updated|merged)\b/i;

/** Titles by ticket: a session whose ticket it is, else the earliest card (session start, then order) whose cardTicket it is. */
export function ticketTitles(sessions = [], cards = [], drivenTickets = new Set()){
  const out = {}, put = (t, title) => { if (t && title && !out[t]) out[t] = title; };
  const data = c => { const s = sessions.find(x => x.id === c.session); return (s && s.data) || {}; };
  const started = c => { const x = Date.parse(data(c).started); return isNaN(x) ? Infinity : x; };
  sessions.forEach(s => put(normTicket(s.data && s.data.ticket), s.data && s.data.title));
  [...cards].sort((a, b) => (started(a) - started(b) || 0) || (a.order ?? 0) - (b.order ?? 0))
    .forEach(c => put(cardTicket(c, data(c).ticket, drivenTickets), c.title));
  return out;
}

/**
 * {yesterday, today, blockers}, each a list of plain lines. `date` is the day being summarized (YYYY-MM-DD, local).
 * Yesterday: a line per driven ticket, longest first. Today: unfinished sessions active that day.
 * Blockers: cards still in rework whose session and rework began by day end, with the last REWORK event's text.
 */
export function scrumSummary({date, segments = [], sessions = [], cards = [], notes = {}}){
  const next = new Date(date + "T00:00:00"); next.setDate(next.getDate() + 1);
  const dayEnd = next.getTime();
  const sessionTicket = s => normTicket(s.data.ticket);
  const eventsOf = s => (Array.isArray(s.data.events) ? s.data.events : []).filter(e => !isNaN(t(e)) && t(e) < dayEnd);
  const todays = sessions.map(s => ({s, evs: eventsOf(s).filter(e => localDate(e.at) === date)}));
  const driven = new Map();
  for (const g of segments) driven.set(normTicket(g.ticket), (driven.get(normTicket(g.ticket)) || 0) + (Date.parse(g.end) - Date.parse(g.start)) / 60000);
  const drivenTickets = new Set(driven.keys()), titles = ticketTitles(sessions, cards, drivenTickets);
  const ticketOfEvent = (s, e) => { const c = e.card && cards.find(x => x._id === e.card); return c ? cardTicket(c, s.data.ticket, drivenTickets) : sessionTicket(s); };
  const yesterday = [...driven].sort((a, b) => b[1] - a[1]).map(([tk, min]) => {
    const title = (tk && titles[tk]) || "";
    const out = todays.flatMap(({s, evs}) => evs.filter(e => ticketOfEvent(s, e) === tk && OUTCOME.test(e.text || "")))
      .sort((a, b) => t(a) - t(b)).map(e => e.text);
    const outcomes = out.length ? [...new Set(out)].slice(-3).join("; ") : (tk && notes[tk]) || "";
    return `${tk || "No ticket"}${title ? " " + title : ""}, ${dur(min)}${outcomes ? ": " + outcomes : ""}`;
  });

  const finished = s => fableDone(s) && (!s.data.completed || Date.parse(s.data.completed) < dayEnd);
  const open = sessions.filter(s => !finished(s) && (!s.data.started || Date.parse(s.data.started) < dayEnd));
  const today = open.map(s => {
    const nextStage = cards.filter(c => c.session === s.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).flatMap(stagesOf).find(x => x.state === "pending");
    const pr = s.data.pr && s.data.pr.id && /^(draft|active)$/i.test(s.data.pr.status || "") ? `PR #${s.data.pr.id} (${s.data.pr.status.toLowerCase()})` : "";
    const head = (s.data.title || sessionTicket(s) || s.id) + (s.data.now ? ": " + s.data.now : "");
    return [head, nextStage ? "next: " + nextStage.label : "", pr].filter(Boolean).join("; ");
  });

  const blockers = cards.filter(c => cardState(c) === "rework").flatMap(c => {
    const s = sessions.find(x => x.id === c.session);
    if (s && finished(s)) return [];
    // A card holds only its current state, so a session or rework stage begun after the day was not that day's blocker.
    if (s && Date.parse(s.data.started) >= dayEnd) return [];
    if (stagesOf(c).some(x => x.state === "rework" && Date.parse(x.started) >= dayEnd)) return [];
    const evs = (s ? eventsOf(s) : []).filter(e => /rework/i.test(e.text || ""));
    const own = evs.filter(e => e.card === c._id), last = (own.length ? own : evs.filter(e => !e.card)).sort((a, b) => t(a) - t(b)).pop();
    const tk = cardTicket(c, s && s.data.ticket, drivenTickets);
    return [`${[tk, c.title].filter(Boolean).join(" ")}: ${last ? last.text : "in rework"}`];
  });

  return {yesterday: yesterday.length ? yesterday : ["Nothing logged"], today: today.length ? today : ["None"], blockers: blockers.length ? blockers : ["None"]};
}

/** The summary as plain text: three headed sections of "- " bullets. */
export function scrumText(summary, date){
  const sec = (h, lines) => `${h}\n${lines.map(l => "- " + l).join("\n")}`;
  return [`Scrum ${date}`, sec("Yesterday", summary.yesterday), sec("Today", summary.today), sec("Blockers", summary.blockers)].join("\n\n") + "\n";
}
