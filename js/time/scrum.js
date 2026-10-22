// Pure: builds the morning-meeting summary of one day from segments and the board data. No DOM, no storage, no model.
import {normTicket, cardTicket} from "./segments.js";
import {stagesOf, cardState, fableDone} from "../model.js";

const t = e => Date.parse(e.at);
// Process talk (agents, reviews, commits, PR housekeeping, test runs, reading and filing) is not what the work was.
const PROCESS = /\b(refut\w*|review agents?|ran .*review|reviewed|checklist|release[- ]notes?|commit\w*|merg\w*|pipeline|build logs?|requeue\w*|mutation|tests? (?:pass\w*|green|run)|playwright|builder|dispatch\w*|retitl\w*|PR description|created the .*PR|worktree|fetch\w*|read|quer\w*|filed)\b/i;
// A note that is only the ADO "<Type>: <title>" fallback says nothing the label does not.
const ADO_NOTE = /^(?:User Story|Task|Bug|Support Item|Feature|Epic): /;

/** A line with commit hashes, PR numbers, counts, model names, arrows and the brackets they leave empty removed. */
export function scrub(s){
  return String(s ?? "")
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/g, "")
    .replace(/\b(PR)\s*#?\d{3,}\b/gi, "$1").replace(/(^|[\s(])#\d{3,}\b/g, "$1")
    .replace(/\(\d+(?:\.\d+)?k\)/gi, "").replace(/\b\d+(?:\/\d+)+\b/g, "")
    .replace(/\b\d[\d,]*\s+(?:pass\w*|fail\w*|tests?|findings?|must-fix)\b/gi, "")
    .replace(/\b(?:opus|sonnet|haiku)\b/gi, "").replace(/->|\u2192/g, "")
    .replace(/\(\s*\)|\[\s*\]/g, "").replace(/\s+([,.;:)])/g, "$1").replace(/([,;:])[,;:]+/g, "$1").replace(/\s{2,}/g, " ")
    .trim().replace(/^[\s,;:.-]+|[\s,;:-]+$/g, "");
}

/** Up to 3 plain "what the work was" clauses from roll-up texts, in order, joined with "; " as whole clauses within 160 chars; only an over-long first clause is cut on a word, with "…". */
export function plainSummary(texts = []){
  const out = [];
  for (const text of texts) for (const raw of String(text ?? "").replace(/^[A-Z][a-z]+(?: [a-z]+)?:\s+/, "").split(";")) {
    if (PROCESS.test(raw)) continue;
    // An acronym ("PR", "UI") keeps its capital.
    const c = scrub(raw).replace(/\.$/, "").replace(/^[A-Z](?![A-Z])/, m => m.toLowerCase());
    if (c && !out.includes(c)) out.push(c);
  }
  const [first = "", ...rest] = out.slice(0, 3);
  // Whole clauses only: a later clause that would pass 160 chars is dropped with everything after it, never cut.
  if (first.length > 160) { const cut = first.lastIndexOf(" ", 159); return first.slice(0, cut > 0 ? cut : 159).replace(/[\s,;:]+$/, "") + "…"; }
  let s = first;
  for (const c of rest) { if (s.length + 2 + c.length > 160) break; s += "; " + c; }
  return s;
}

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
 * {yesterday, today, blockers}, each a list of plain, high-level lines. `date` is the day being summarized (YYYY-MM-DD, local).
 * Yesterday: a line per driven ticket, longest first, labelled by its ADO title (`titles`) and summarized from the day's roll-up
 * `blocks`, else its note. Today: unfinished sessions active that day, with the next stage and whether a PR is in review.
 * Blockers: cards still in rework whose session and rework began by day end, with the last REWORK event's reason.
 */
export function scrumSummary({date, segments = [], sessions = [], cards = [], notes = {}, blocks = [], titles = {}}){
  const next = new Date(date + "T00:00:00"); next.setDate(next.getDate() + 1);
  const dayEnd = next.getTime();
  const sessionTicket = s => normTicket(s.data.ticket);
  const eventsOf = s => (Array.isArray(s.data.events) ? s.data.events : []).filter(e => !isNaN(t(e)) && t(e) < dayEnd);
  const driven = new Map();
  for (const g of segments) driven.set(normTicket(g.ticket), (driven.get(normTicket(g.ticket)) || 0) + (Date.parse(g.end) - Date.parse(g.start)) / 60000);
  const drivenTickets = new Set(driven.keys()), boardTitles = ticketTitles(sessions, cards, drivenTickets);
  const yesterday = [...driven].sort((a, b) => b[1] - a[1]).map(([tk]) => {
    if (!tk) return "Other work";
    const label = `${tk} ${scrub(titles[tk] || boardTitles[tk] || "")}`.trim();
    const texts = blocks.filter(b => normTicket(b.ticket) === tk).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).map(b => b.text);
    const note = notes[tk] && !ADO_NOTE.test(notes[tk]) ? notes[tk] : "";
    const summary = plainSummary(texts) || plainSummary([note]);
    return summary ? `${label}: ${summary}` : label;
  });

  const finished = s => fableDone(s) && (!s.data.completed || Date.parse(s.data.completed) < dayEnd);
  const open = sessions.filter(s => !finished(s) && (!s.data.started || Date.parse(s.data.started) < dayEnd));
  const today = open.map(s => {
    const nextStage = cards.filter(c => c.session === s.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).flatMap(stagesOf).find(x => x.state === "pending");
    const inReview = s.data.pr && s.data.pr.id && /^(draft|active)$/i.test(s.data.pr.status || "");
    const head = scrub(s.data.title) || sessionTicket(s) || s.id;
    return head + (nextStage ? ": next up " + nextStage.label.toLowerCase() : "") + (inReview ? "; PR in review" : "");
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
    return [`${[tk, scrub(c.title)].filter(Boolean).join(" ")}: ${reason(last && last.text)}`];
  });

  return {yesterday: yesterday.length ? yesterday : ["Nothing logged"], today: today.length ? today : ["None"], blockers: blockers.length ? blockers : ["None"]};
}

/** A REWORK event's text without the verdict word, agent names or numbers, cut at 120 chars on a word; "changes requested" when nothing is left. */
function reason(text){
  const r = scrub(String(text ?? "").replace(/\brework\b:?|\b(?:refuter|builder|scout|researcher|debugger)\b/gi, ""));
  return (r.length <= 120 ? r : r.slice(0, 121).replace(/\s+\S*$/, "").replace(/[\s,;:]+$/, "")) || "changes requested";
}

/** The summary as plain text: three headed sections of "- " bullets. */
export function scrumText(summary, date){
  const sec = (h, lines) => `${h}\n${lines.map(l => "- " + l).join("\n")}`;
  return [`Scrum ${date}`, sec("Yesterday", summary.yesterday), sec("Today", summary.today), sec("Blockers", summary.blockers)].join("\n\n") + "\n";
}
