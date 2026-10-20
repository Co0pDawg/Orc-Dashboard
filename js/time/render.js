// HTML strings for the Time page (Day, Week, Month, entries, scrum). Strings only: nothing here touches the DOM.
// js/time outputs are UTC ISO, so every date and time shown here comes from local Date getters, never iso.slice().
import {esc} from "../util.js";
import {normTicket} from "./segments.js";

const MIN = 60000, HOUR = 60 * MIN;
const pad = n => String(n).padStart(2, "0");
const ms = t => Date.parse(t);

/** Local midnight of a yyyy-MM-dd date, in ms. */
export const dayStartMs = date => new Date(date + "T00:00:00").getTime();
/** The local yyyy-MM-dd of a time (ms, ISO or Date). */
export const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** yyyy-MM-dd n days after date, stepping local days so DST never skips one. */
export const addDays = (date, n) => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
/** The Monday on or before date. */
export const mondayOf = date => addDays(date, -((new Date(date + "T00:00:00").getDay() + 6) % 7));
/** Portal Start Date: MM/DD/YYYY, local. */
const mdy = iso => { const d = new Date(iso); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`; };
// Built by hand, not toLocaleTimeString: newer ICU puts a narrow no-break space before AM/PM, which the portal rejects.
/** Portal time: "11:30 AM", local. */
const hm12 = iso => { const d = new Date(iso), h = d.getHours(); return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`; };
/** "2h 45m", "2h" or "45m". */
export const dur = total => { const m = Math.round(total), h = Math.floor(m / 60); return h && m % 60 ? `${h}h ${m % 60}m` : h ? `${h}h` : `${m % 60}m`; };
const minutes = list => list.reduce((n, x) => n + (ms(x.end) - ms(x.start)) / MIN, 0);
// ponytail: color by ticket number mod 6, so a ticket keeps its color in every view and day; two tickets can share one.
/** The ticket color class: tk-1..tk-6, or tk-none for No ticket. */
export const tkClass = t => t ? "tk-" + (Number(t.slice(4)) % 6 + 1) : "tk-none";
const label = t => t || "No ticket";

/** Review Time suggestion: a ticket every one of whose segments ran in a `review` session; merged into the doc's flags. */
export function withReview(flags = {}, segments = [], sessions = {}){
  const out = Object.fromEntries(Object.entries(flags || {}).map(([k, v]) => [k, {...v}]));
  const by = new Map();
  for (const s of segments){ const t = normTicket(s.ticket); if (t) by.set(t, (by.get(t) ?? true) && !!(sessions && sessions[s.session] && sessions[s.session].review)); }
  for (const [t, review] of by) if (review) out[t] = {...out[t], review: true};
  return out;
}

/** Column titles by ticket: the card whose task is that ticket, else a session for it, else a card for it. */
export function ticketTitles(sessions = [], cards = []){
  const out = {}, put = (t, title) => { if (t && title && !out[t]) out[t] = title; };
  cards.forEach(c => put(normTicket(c.task), c.title));
  sessions.forEach(s => put(normTicket(s.data && s.data.ticket), s.data && s.data.title));
  cards.forEach(c => put(normTicket(c.ticket), c.title));
  return out;
}

/** The empty state when the sync has not written this day yet. */
export function emptyHtml(date){
  return `<div class="empty"><b>No time synced for ${esc(date)} yet</b>Run <code>sync-timeline.ps1 -Date ${esc(date)}</code> from the worklog repo; this page fills in as soon as it uploads.</div>`;
}

// The axis runs from the first activity to the last, padded out to whole hours.
function axis(lo, hi, dayLo){
  const a = dayLo + Math.floor((lo - dayLo) / HOUR) * HOUR, b = Math.max(a + HOUR, dayLo + Math.ceil((hi - dayLo) / HOUR) * HOUR);
  return {a, b, hours: Math.round((b - a) / HOUR)};
}
const pct = (t, ax) => ((t - ax.a) / (ax.b - ax.a) * 100).toFixed(3);
const box = (x, ax) => `top:${pct(ms(x.start), ax)}%;height:${(((ms(x.end) - ms(x.start)) / (ax.b - ax.a)) * 100).toFixed(3)}%`;
const hourLabel = t => { const h = new Date(t).getHours(); return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; };
const range = x => `${hm12(x.start)} to ${hm12(x.end)}`;
function axisHtml(ax){
  let marks = "";
  for (let i = 0; i < ax.hours; i++) marks += `<span style="top:${(i / ax.hours * 100).toFixed(3)}%">${hourLabel(ax.a + i * HOUR)}</span>`;
  return `<div class="tl-axis" aria-hidden="true"><div class="tl-colhead"></div><div class="tl-track">${marks}</div></div>`;
}

/** The Day tab's timeline: totals, a Scrum button, then the hour axis and one column per ticket. */
export function dayHtml({date, segments = [], spans = [], markers = [], entries, tickets = {}, skin}){
  const leet = skin === "leet";
  const drivenMin = minutes(segments), agentMin = minutes(spans);
  const head = `<div class="day-head"><span class="facts"><span>Driven <b>${dur(drivenMin)}</b></span>${entries ? `<span>Entries <b>${dur(entries.entries.reduce((n, e) => n + e.minutes, 0))}</b></span>` : ""}<span>Agents <b>${dur(agentMin)}</b></span></span><button type="button" class="btn scrum" data-scrum="${esc(date)}">${leet ? "[scrum]" : "Scrum"}</button></div>`;
  const times = [...segments.flatMap(s => [ms(s.start), ms(s.end)]), ...spans.flatMap(s => [ms(s.start), ms(s.end)]), ...markers.map(m => ms(m.at))].filter(t => !isNaN(t));
  if (!times.length) return `${head}<div class="empty"><b>Nothing logged on ${esc(date)}</b>No prompts were recorded this day.</div>`;
  const ax = axis(Math.min(...times), Math.max(...times), dayStartMs(date));
  const cols = new Map(), col = (t, at) => { if (!cols.has(t)) cols.set(t, {t, first: at, segs: [], spans: [], marks: []}); const c = cols.get(t); c.first = Math.min(c.first, at); return c; };
  segments.forEach(s => col(normTicket(s.ticket), ms(s.start)).segs.push(s));
  spans.forEach(s => col(normTicket(s.ticket), ms(s.start)).spans.push(s));
  markers.forEach(m => col(normTicket(m.ticket), ms(m.at)).marks.push(m));
  // Time order of first activity, with No ticket last.
  const list = [...cols.values()].sort((a, b) => (a.t == null) - (b.t == null) || a.first - b.first);
  const colsHtml = list.map(c => {
    const name = label(c.t), title = c.t && tickets[c.t];
    const blocks = c.segs.map(s => `<i class="drv" style="${box(s, ax)}" role="img" aria-label="${esc(name)} driving ${range(s)}" title="Driving ${range(s)}"></i>`).join("")
      + c.spans.map(s => `<i class="agt" style="${box(s, ax)}" role="img" aria-label="${esc(name)} agent ${range(s)}" title="${esc(s.agent || "Agent")}, ${range(s)}"></i>`).join("")
      + c.marks.map(m => `<b class="mk" style="top:${pct(ms(m.at), ax)}%" role="img" aria-label="Agent dispatched ${hm12(m.at)}" title="Agent dispatched ${hm12(m.at)}"></b>`).join("");
    return `<div class="tl-col ${tkClass(c.t)}"><div class="tl-colhead"><b>${esc(name)}</b>${title ? `<span class="tl-title" title="${esc(title)}">${esc(title)}</span>` : ""}<span class="tl-tot">${dur(minutes(c.segs))} driven${c.spans.length ? ` · ${dur(minutes(c.spans))} agents` : ""}</span></div><div class="tl-track">${blocks}</div></div>`;
  }).join("");
  return `${head}<div class="tl" style="--hours:${ax.hours}">${axisHtml(ax)}${colsHtml}</div>`;
}

const field = (k, v, extra = "") => `<div class="fld"><span class="k">${k}</span><span class="v">${v ? esc(v) : extra}</span><button type="button" class="btn cp" data-copy="${esc(v)}" title="Copy ${k}" aria-label="Copy ${k}${v ? " " + esc(v) : ""}"${v ? "" : " disabled"}>⧉</button></div>`;

/** The Entries panel: one Work Detail-shaped entry per row, a copy button per field, totals and Not entered. */
export function entriesHtml(result, {date, notes = {}, flags = {}} = {}){
  const list = (result && result.entries) || [], entered = list.reduce((n, e) => n + e.minutes, 0);
  const rows = list.map((e, i) => {
    const f = (e.ticket && flags && flags[e.ticket]) || {}, note = (e.ticket && notes && notes[e.ticket]) || "", id = `note-${esc(date)}-${i}`;
    return `<li class="entry ${tkClass(e.ticket)}">
      <div class="ent-top"><b>${esc(label(e.ticket))}</b><span>${hm12(e.start)} to ${hm12(e.end)} · ${dur(e.minutes)}</span></div>
      ${field("Ticket", e.ticket || "", `<em class="needs">needs a ticket</em>`)}
      ${field("Start Date", mdy(e.start))}
      ${field("Start Time", hm12(e.start))}
      ${field("End Time", hm12(e.end))}
      <div class="fld note"><label class="k" for="${id}">Note</label><textarea id="${id}" data-note="${esc((e.ticket || "") + "|" + e.start)}" rows="2">${esc(note)}</textarea><button type="button" class="btn cp" data-copy="${esc(note)}" title="Copy Note" aria-label="Copy Note">⧉</button></div>
      <p class="sugg"><span class="${f.review ? "on" : ""}">Review Time: ${f.review ? "on" : "off"}</span><span class="${f.unplanned ? "on" : ""}">Unplanned Time: ${f.unplanned ? "on" : "off"}</span></p>
    </li>`;
  }).join("");
  const drivenMin = result ? result.drivenMin : 0, notEntered = result ? result.notEntered : 0;
  return `<section class="entries" aria-label="Entries">
    <div class="ent-head"><h2>Entries</h2><span class="ent-tot">${dur(entered)} entered · ${dur(drivenMin)} driven</span></div>
    ${rows ? `<ol class="ent-list">${rows}</ol>` : `<p class="note">No entries for this day.</p>`}
    ${notEntered ? `<p class="not-entered">Not entered: ${notEntered} min</p>` : ""}
  </section>`;
}
