// Pure: builds the morning-meeting summary of one day from segments and the board data. No DOM, no storage, no model.
import {normTicket} from "./segments.js";
import {stagesOf, cardState, fableDone} from "../model.js";

const pad = n => String(n).padStart(2, "0");
const localDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const t = e => Date.parse(e.at);
/** "2h 45m", "2h" or "45m". */
const dur = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`; };
const OUTCOME = /commit|\bPR\b|accept|rework|done/i;

/**
 * {yesterday, today, blockers}, each a list of plain lines. `date` is the day being summarized (YYYY-MM-DD, local).
 * Yesterday: a line per driven ticket, longest first. Today: unfinished sessions active that day.
 * Blockers: cards still in rework, with the last REWORK event's text.
 */
export function scrumSummary({date, segments = [], sessions = [], cards = [], notes = {}}){
  const next = new Date(date + "T00:00:00"); next.setDate(next.getDate() + 1);
  const dayEnd = next.getTime();
  const sessionTicket = s => normTicket(s.data.ticket);
  const eventsOf = s => (Array.isArray(s.data.events) ? s.data.events : []).filter(e => !isNaN(t(e)) && t(e) < dayEnd);
  const todays = sessions.map(s => ({s, evs: eventsOf(s).filter(e => localDate(e.at) === date)}));
  const ticketOfEvent = (s, e) => { const c = e.card && cards.find(x => x._id === e.card); return c && c.ticket != null && c.ticket !== "" ? normTicket(c.ticket) : sessionTicket(s); };

  const driven = new Map();
  for (const g of segments) driven.set(normTicket(g.ticket), (driven.get(normTicket(g.ticket)) || 0) + (Date.parse(g.end) - Date.parse(g.start)) / 60000);
  const yesterday = [...driven].sort((a, b) => b[1] - a[1]).map(([tk, min]) => {
    const card = tk && cards.find(c => normTicket(c.ticket) === tk && c.title);
    const sess = tk && sessions.find(s => sessionTicket(s) === tk && s.data.title);
    const title = card ? card.title : sess ? sess.data.title : "";
    const out = todays.flatMap(({s, evs}) => evs.filter(e => ticketOfEvent(s, e) === tk && OUTCOME.test(e.text || "")))
      .sort((a, b) => t(a) - t(b)).map(e => e.text);
    const outcomes = out.length ? [...new Set(out)].join("; ") : (tk && notes[tk]) || "";
    return `${tk || "No ticket"}${title ? " " + title : ""}, ${dur(min)}${outcomes ? ": " + outcomes : ""}`;
  });

  const activeIds = new Set(segments.map(g => g.session));
  const finished = s => fableDone(s) && (!s.data.completed || Date.parse(s.data.completed) < dayEnd);
  const open = sessions.filter(s => !finished(s));
  const today = open.filter(s => activeIds.has(s.id) || todays.find(x => x.s === s).evs.length).map(s => {
    const nextStage = cards.filter(c => c.session === s.id).flatMap(stagesOf).find(x => x.state === "pending");
    const pr = s.data.pr && s.data.pr.id && /^(draft|active)$/i.test(s.data.pr.status || "") ? `PR #${s.data.pr.id} (${s.data.pr.status.toLowerCase()})` : "";
    const head = (s.data.title || sessionTicket(s) || s.id) + (s.data.now ? ": " + s.data.now : "");
    return [head, nextStage ? "next: " + nextStage.label : "", pr].filter(Boolean).join("; ");
  });

  const blockers = cards.filter(c => cardState(c) === "rework").flatMap(c => {
    const s = sessions.find(x => x.id === c.session);
    if (s && finished(s)) return [];
    const evs = (s ? eventsOf(s) : []).filter(e => /rework/i.test(e.text || ""));
    const last = (evs.filter(e => e.card === c._id).length ? evs.filter(e => e.card === c._id) : evs).sort((a, b) => t(a) - t(b)).pop();
    const tk = normTicket(c.ticket != null && c.ticket !== "" ? c.ticket : s && s.data.ticket);
    return [`${[tk, c.title].filter(Boolean).join(" ")}: ${last ? last.text : "in rework"}`];
  });

  return {yesterday: yesterday.length ? yesterday : ["Nothing logged"], today: today.length ? today : ["None"], blockers: blockers.length ? blockers : ["None"]};
}

/** The summary as plain text: three headed sections of "- " bullets. */
export function scrumText(summary, date){
  const sec = (h, lines) => `${h}\n${lines.map(l => "- " + l).join("\n")}`;
  return [`Scrum ${date}`, sec("Yesterday", summary.yesterday), sec("Today", summary.today), sec("Blockers", summary.blockers)].join("\n\n") + "\n";
}
