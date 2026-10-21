// HTML strings for the Time page (Day, Week, Month, entries, scrum). Strings only: nothing here touches the DOM.
// js/time outputs are UTC ISO, so every date and time shown here comes from local Date getters, never iso.slice().
import {esc} from "../util.js";
import {normTicket} from "./segments.js";
import {scrumText} from "./scrum.js";

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

/** The empty state when the sync has not written this day yet; the Day tab passes scrum so every day keeps its Scrum button. */
export function emptyHtml(date, scrum = false){
  return `${scrum ? `<div class="day-head"><span class="facts"></span>${scrumBtn(date)}</div>` : ""}<div class="empty"><b>No time synced for ${esc(date)} yet</b>Run <code>sync-timeline.ps1 -Date ${esc(date)}</code> from the worklog repo; this page fills in as soon as it uploads.</div>`;
}

// The axis is always the whole local day, midnight to midnight, so a day reads like the portal calendar.
function axis(date){
  const a = dayStartMs(date), b = dayStartMs(addDays(date, 1));
  return {a, b, hours: Math.round((b - a) / HOUR)};
}
const pct = (t, ax) => ((t - ax.a) / (ax.b - ax.a) * 100).toFixed(3);
// Clamped to the axis, so a run past midnight stops at the bottom edge instead of stretching the scroll box.
const box = (x, ax) => { const a = Math.max(ms(x.start), ax.a), b = Math.min(ms(x.end), ax.b); return `top:${pct(a, ax)}%;height:${((b - a) / (ax.b - ax.a) * 100).toFixed(3)}%`; };
// Where the controller first scrolls a date to, as a fraction of the axis: the half-hour line at least 30 minutes above
// the first activity, so a whole label tops the view; 8 AM with no activity.
const firstAt = (ax, first) => { const t = first == null ? 8 * HOUR : Math.max(0, Math.floor((first - 30 * MIN - ax.a) / (30 * MIN)) * 30 * MIN); return (t / (ax.b - ax.a)).toFixed(4); };
/** Axis label like the portal's: "2 PM" on the hour, "2:30" on the half hour, local. */
const tick = t => { const d = new Date(t), h = d.getHours(), m = d.getMinutes(); return m ? `${h % 12 || 12}:${pad(m)}` : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; };
const range = x => `${hm12(x.start)} to ${hm12(x.end)}`;
function axisHtml(ax){
  let marks = "";
  for (let i = 0; i <= ax.hours * 2; i++) marks += `<span style="top:${(i / (ax.hours * 2) * 100).toFixed(3)}%">${tick(ax.a + i * 30 * MIN)}</span>`;
  return `<div class="tl-axis" aria-hidden="true"><div class="tl-colhead"></div><div class="tl-track">${marks}</div></div>`;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const md = date => { const d = new Date(date + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}`; };
const scrumBtn = date => `<button type="button" class="btn scrum" data-scrum="${esc(date)}" aria-label="Scrum summary for ${esc(date)}">Scrum</button>`;

/** The Day tab's timeline: totals, a Scrum button, then the hour axis and one column per ticket. */
export function dayHtml({date, segments = [], spans = [], markers = [], entries, tickets = {}, skin}){
  const leet = skin === "leet";
  const drivenMin = minutes(segments), agentMin = minutes(spans);
  const head = `<div class="day-head"><span class="facts"><span>Driven <b>${dur(drivenMin)}</b></span>${entries ? `<span>Entries <b>${dur(entries.entries.reduce((n, e) => n + e.minutes, 0))}</b></span>` : ""}<span>Agents <b>${dur(agentMin)}</b></span></span>${scrumBtn(date)}</div>`;
  const times = [...segments.flatMap(s => [ms(s.start), ms(s.end)]), ...spans.flatMap(s => [ms(s.start), ms(s.end)]), ...markers.map(m => ms(m.at))].filter(t => !isNaN(t));
  if (!times.length) return `${head}<div class="empty"><b>${leet ? `$ nothing logged on ${esc(date)}_` : `Nothing logged on ${esc(date)}`}</b>No prompts were recorded this day.</div>`;
  const ax = axis(date);
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
  // data-a/data-b and the hidden .tl-now let the controller draw the entry marker where the Entries list is centered.
  return `${head}<div class="tl" style="--hours:${ax.hours}" data-first="${firstAt(ax, Math.min(...times))}" data-a="${ax.a}" data-b="${ax.b}"><i class="tl-now" aria-hidden="true" hidden></i>${axisHtml(ax)}${colsHtml}</div>`;
}

// A value is its own copy button; a missing value (a needs-a-ticket Ticket) is plain text, not clickable.
const field = (k, v, extra = "") => `<div class="fld"><span class="k">${k}</span>${v ? `<button type="button" class="v cv" data-copy="${esc(v)}" title="Click to copy" aria-label="Copy ${k} ${esc(v)}">${esc(v)}</button>` : `<span class="v">${extra}</span>`}</div>`;

/** The Entries panel: one Work Detail-shaped entry per row, each value click-to-copy, totals and Not entered. */
export function entriesHtml(result, {date, notes = {}, flags = {}} = {}){
  const list = (result && result.entries) || [], entered = list.reduce((n, e) => n + e.minutes, 0);
  const rows = list.map((e, i) => {
    const f = (e.ticket && flags && flags[e.ticket]) || {}, note = (e.ticket && notes && notes[e.ticket]) || "", id = `note-${esc(date)}-${i}`;
    return `<li class="entry ${tkClass(e.ticket)}" data-at="${ms(e.start)}" data-to="${ms(e.end)}">
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


// Each moment of a week day is split into bands for what ran then: the driven ticket solid, agents fainter beside it.
function bandsHtml(segments, spans, shift, ax){
  const items = [...segments.map(s => ({kind: "drv", t: normTicket(s.ticket), a: ms(s.start), b: ms(s.end)})),
    ...spans.map(s => ({kind: "agt", t: normTicket(s.ticket), a: ms(s.start), b: ms(s.end)}))].filter(x => x.b > x.a);
  const cuts = [...new Set(items.flatMap(x => [x.a, x.b]))].sort((x, y) => x - y);
  const runs = [];
  for (let i = 0; i < cuts.length - 1; i++){
    const on = items.filter(x => x.a < cuts[i + 1] && x.b > cuts[i]).sort((x, y) => (x.kind < y.kind) - (x.kind > y.kind));
    if (!on.length) continue;
    const sig = on.map(x => x.kind + x.t).join(), last = runs[runs.length - 1];
    if (last && last.sig === sig && last.b === cuts[i]) last.b = cuts[i + 1]; else runs.push({sig, on, a: cuts[i], b: cuts[i + 1]});
  }
  return runs.map(r => {
    const what = r.on.map(x => `${label(x.t)} ${x.kind === "drv" ? "driving" : "agent"}`).join(", ");
    return `<div class="band" style="top:${pct(r.a + shift, ax)}%;height:${((r.b - r.a) / (ax.b - ax.a) * 100).toFixed(3)}%" role="img" aria-label="${esc(what)}" title="${esc(what)}">${r.on.map(x => `<i class="${x.kind} ${tkClass(x.t)}"></i>`).join("")}</div>`;
  }).join("");
}

/** The Week tab: seven day columns, Monday first, on one time-of-day axis; each column opens its day. */
export function weekHtml(days){
  const ref = dayStartMs(days[0].date);
  // Every day is laid on the first day's clock, so 9 AM lines up across the week.
  const shiftOf = d => ref - dayStartMs(d.date);
  const times = days.flatMap(d => [...d.segments, ...d.spans].flatMap(x => [ms(x.start), ms(x.end)]).map(t => t + shiftOf(d)));
  const ax = axis(days[0].date);
  const total = days.reduce((n, d) => n + minutes(d.segments), 0);
  const cols = days.map((d, i) => `<div class="wk-col tl-col${d.missing ? " missing" : ""}" data-day="${esc(d.date)}">
    <div class="tl-colhead wk-head"><button type="button" class="wk-date" aria-label="Open ${esc(d.date)}">${DOW[i]} ${md(d.date)}</button><span class="tl-tot">${d.missing ? "not synced" : dur(minutes(d.segments))}</span>${scrumBtn(d.date)}</div>
    <div class="tl-track">${bandsHtml(d.segments, d.spans, shiftOf(d), ax)}</div></div>`).join("");
  return `<div class="wk-sum">Week total <b>${dur(total)} driven</b></div><div class="tl wk" style="--hours:${ax.hours}" data-first="${firstAt(ax, times.length ? Math.min(...times) : null)}">${axisHtml(ax)}${cols}</div>`;
}

/** The Month tab: Monday-first weeks of day cells (total, ticket bar, agent mark, Scrum), week totals at row ends. */
export function monthHtml(month, days){
  const by = new Map((days || []).filter(d => d.segments.length || d.spans.length).map(d => [d.date, d]));
  const [y, m] = month.split("-").map(Number), last = ymd(new Date(y, m, 0));
  let rows = "", total = 0;
  for (let cur = mondayOf(month + "-01"); cur <= last; cur = addDays(cur, 7)){
    let wk = 0;
    for (let i = 0; i < 7; i++){
      const date = addDays(cur, i), x = by.get(date);
      if (!date.startsWith(month)){ rows += `<div class="mo-cell blank"></div>`; continue; }
      const num = Number(date.slice(8)), top = mark => `<div class="mo-top"><button type="button" class="mo-date" aria-label="Open ${esc(date)}"><span class="mo-dow-s">${DOW[i]} </span>${num}</button>${mark}</div>`;
      if (!x){ rows += `<div class="mo-cell" data-day="${esc(date)}">${top("")}</div>`; continue; }
      const min = minutes(x.segments), per = new Map();
      wk += min;
      x.segments.forEach(s => { const t = normTicket(s.ticket); per.set(t, (per.get(t) || 0) + (ms(s.end) - ms(s.start)) / MIN); });
      // Widths in hundredths, the last one taking the remainder so the bar always adds up to exactly 100%.
      const parts = [...per].sort((a, b) => b[1] - a[1]);
      let used = 0;
      const bar = parts.map(([t, n], k) => { const w = k === parts.length - 1 ? +(100 - used).toFixed(2) : +(n / min * 100).toFixed(2); used += w; return `<i class="${tkClass(t)}" style="width:${w}%" title="${esc(label(t))} ${dur(n)}"></i>`; }).join("");
      const agents = x.spans.length ? `<span class="mo-agent" role="img" aria-label="Agents ran" title="Agents ran">◆</span>` : "";
      rows += `<div class="mo-cell has" data-day="${esc(date)}">${top(agents)}<span class="mo-tot">${dur(min)}</span>${min ? `<span class="mo-bar">${bar}</span>` : ""}${scrumBtn(date)}</div>`;
    }
    total += wk;
    rows += `<div class="mo-week">${wk ? dur(wk) : ""}</div>`;
  }
  return `<div class="mo-head">Month total <b>${dur(total)} driven</b></div><div class="mo-grid">${DOW.map(d => `<div class="mo-dow">${d}</div>`).join("")}<div class="mo-dow">Week</div>${rows}</div>`;
}

/** The scrum dialog body: the plain-text summary in a selectable block and one Copy button for all of it. */
export function scrumHtml(summary, date){
  const text = scrumText(summary, date);
  return `<pre class="scrum-text">${esc(text)}</pre><button type="button" class="btn" data-copy="${esc(text)}" title="Copy the summary">Copy</button>`;
}
