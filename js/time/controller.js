// The Time page: subscribes to timeline/<date> docs and the cards collection, computes each day with the pure
// js/time modules, renders Day, Week or Month into #time-body, and opens the scrum dialog. Read-only: nothing here writes the db.
import {state} from "../state.js";
import {saveEntryLine} from "../prefs.js";
import {$, say} from "../board.js";
import {drivingSegments, agentSpans, agentMarkers, normTicket} from "./segments.js";
import {buildEntries} from "./entries.js";
import {scrumSummary, ticketTitles} from "./scrum.js";
import {dayHtml, entriesHtml, emptyHtml, weekHtml, monthHtml, scrumHtml, withReview, dayStartMs, ymd, addDays, mondayOf} from "./render.js";

const view = $("time-view"), body = $("time-body"), dateIn = $("time-date"), dlg = $("scrum-dialog");
const T = {view: "day", date: ymd(Date.now()), docs: new Map(), key: "", stop: null, cards: [], cardsOn: false, notes: new Map(), pending: false, opener: null, html: "", down: false, tlKey: ""};
const monthOf = date => date.slice(0, 7);
const lastOfMonth = date => { const [y, m] = date.split("-").map(Number); return ymd(new Date(y, m, 0)); };
/** The first and last date the current view shows. */
const span = () => T.view === "week" ? [mondayOf(T.date), addDays(mondayOf(T.date), 6)] : T.view === "month" ? [monthOf(T.date) + "-01", lastOfMonth(T.date)] : [T.date, T.date];

/** Whether the Time page is showing. */
const active = () => document.body.dataset.view === "time";

// One subscription per shown range (a day, a week or a month), replaced when the range changes.
function subscribe(){
  if (!state.db) return;
  if (!T.cardsOn){
    T.cardsOn = true;
    state.db.collection("cards").onSnapshot(snap => { T.cards = snap.docs.map(d => ({_id: d.id, ...d.data()})); renderTime(); }, () => {});
  }
  const [from, to] = span(), key = from + "|" + to;
  if (key === T.key) return;
  // The old range's docs stay until the new snapshot lands, so Month -> Day never flashes "No time synced".
  T.stop?.(); T.key = key;
  T.stop = state.db.collection("timeline").where("date", ">=", from).where("date", "<=", to).onSnapshot(snap => {
    T.docs = new Map(snap.docs.map(d => { const x = d.data(); return [x.date || d.id, x]; }));
    renderTime();
  }, () => {});
}

/** One day computed from its timeline doc and the board's sessions and cards. */
function dayInfo(date){
  const doc = T.docs.get(date), events = (doc && Array.isArray(doc.events)) ? doc.events : [];
  const dayStart = new Date(dayStartMs(date)).toISOString(), dayEnd = new Date(dayStartMs(addDays(date, 1)) - 1).toISOString();
  const segments = drivingSegments(events, {dayStart, dayEnd, now: new Date().toISOString()}), driven = new Set(segments.map(s => normTicket(s.ticket)));
  return {date, doc, segments, driven, spans: agentSpans(state.sessions, T.cards, dayStart, dayEnd, driven), markers: agentMarkers(events)};
}

function dayView(){
  const d = dayInfo(T.date);
  if (!d.doc) return emptyHtml(T.date, true);
  const result = buildEntries(d.segments, {unit: state.rounding});
  const flags = withReview(d.doc.flags, d.segments, d.doc.sessions);
  return `<div class="day"><div class="day-main">${dayHtml({...d, entries: result, tickets: ticketTitles(state.sessions, T.cards, d.driven), skin: state.skin, marker: state.entryLine})}</div>${entriesHtml(result, {date: T.date, notes: d.doc.notes, flags})}</div>`;
}

function weekView(){
  const [from] = span(), days = [0, 1, 2, 3, 4, 5, 6].map(i => { const d = dayInfo(addDays(from, i)); return {...d, missing: !d.doc}; });
  return days.some(d => d.doc) ? weekHtml(days) : emptyHtml(T.date);
}
function monthView(){
  const days = [...T.docs.keys()].filter(d => d.startsWith(monthOf(T.date))).sort().map(dayInfo);
  return days.length ? monthHtml(monthOf(T.date), days) : emptyHtml(T.date);
}

const fmtDate = (date, o) => new Date(date + "T00:00:00").toLocaleDateString([], o);
function renderBar(){
  view.querySelectorAll("[data-tview]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tview === T.view)));
  const [from, to] = span();
  $("time-label").textContent = T.view === "month" ? fmtDate(from, {month: "long", year: "numeric"})
    : T.view === "week" ? `${fmtDate(from, {month: "short", day: "numeric"})} to ${fmtDate(to, {month: "short", day: "numeric", year: "numeric"})}`
    : fmtDate(T.date, {weekday: "short", month: "short", day: "numeric", year: "numeric"});
  $("time-prev").setAttribute("aria-label", "Previous " + T.view);
  $("time-next").setAttribute("aria-label", "Next " + T.view);
  if (document.activeElement !== dateIn) dateIn.value = T.date;
}

// A live update must not wipe a note being typed, so it waits until the textarea loses focus.
/** Renders the Time page from the loaded docs; deferred while a note is being edited. */
export function renderTime(){
  if (!active()) return;
  if (document.activeElement?.tagName === "TEXTAREA" && body.contains(document.activeElement)){ T.pending = true; return; }
  T.pending = false;
  renderBar();
  const html = T.view === "week" ? weekView() : T.view === "month" ? monthView() : dayView();
  // Card progress arrives often and rarely changes this view: skip identical output, else keep focus and scroll.
  if (html === T.html) return;
  const ctl = () => [...body.querySelectorAll("button,textarea")], f = ctl().indexOf(document.activeElement), old = body.querySelector(".tl"), sx = old?.scrollLeft, sy = old?.scrollTop, ey = body.querySelector(".ent-list")?.scrollTop;
  T.html = html; body.innerHTML = html;
  if (f >= 0) ctl()[f]?.focus({preventScroll: true});
  // A live re-render keeps the calendar's scroll; a newly shown date or view opens at its data-first point.
  const tl = body.querySelector(".tl"), k = T.view + "|" + T.date;
  if (tl && k === T.tlKey){ tl.scrollTop = sy || 0; tl.scrollLeft = sx || 0; const el = body.querySelector(".ent-list"); if (el) el.scrollTop = ey || 0; }
  else if (tl){ T.tlKey = k; tl.scrollTop = Number(tl.dataset.first) * tl.querySelector(".tl-track").offsetHeight; }
  syncMarker(false);
  // Note edits are never saved, but they survive a re-render on this page load.
  body.querySelectorAll("textarea[data-note]").forEach(ta => { if (T.notes.has(ta.dataset.note)) ta.value = T.notes.get(ta.dataset.note); });
}

/** Shows the Time page on a view ("day", "week" or "month") and date (yyyy-MM-dd, default the current one). */
export function showTime(v, date){
  T.view = ["day", "week", "month"].includes(v) ? v : "day";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date || "") && !isNaN(dayStartMs(date))) T.date = date;
  // Showing the page (a tab, a step, a return from the board) always re-renders and re-scrolls to the first activity.
  T.html = T.tlKey = "";
  subscribe();
  renderTime();
}

/** The hash token for a view and date. */
const token = (v, date) => "time" + (v === "day" ? "" : "-" + v) + "-" + date;
// The view lives in the URL as a plain hash token; showTime runs directly too in case the host swallows hashchange.
// The hash setter, not location.replace("#..."), which resolves against a <base> and would leave the page.
function go(v, date){
  try { location.hash = token(v, date); } catch {}
  showTime(v, date);
}

/** One step back or forward in the current view; months step from the 1st so short months never skip. */
function step(n){
  if (T.view !== "month") return addDays(T.date, n * (T.view === "week" ? 7 : 1));
  const [y, m] = T.date.split("-").map(Number);
  return ymd(new Date(y, m - 1 + n, 1));
}

// showModal gives the focus trap and Esc; the close event (button or Esc) hands focus back to the Scrum button.
function openScrum(date, btn){
  const d = dayInfo(date);
  $("scrum-title").textContent = "Scrum " + fmtDate(date, {weekday: "short", month: "short", day: "numeric", year: "numeric"});
  $("scrum-body").innerHTML = scrumHtml(scrumSummary({date, segments: d.segments, sessions: state.sessions, cards: T.cards, notes: (d.doc && d.doc.notes) || {}}), date);
  T.opener = {btn, date};
  dlg.showModal();
}

// Copy into the clipboard from the click itself; where the frame refuses, select the text so Ctrl+C works.
// A value button (.cv) shows its own text; a ⧉ or Copy button copies the textarea or block just before it.
function copy(btn){
  const src = btn.classList.contains("cv") ? btn : btn.previousElementSibling, text = src && src.tagName === "TEXTAREA" ? src.value : btn.dataset.copy;
  const done = () => { say((btn.getAttribute("aria-label") || btn.title).replace(/^Copy/, "Copied") + "."); btn.classList.add("copied"); setTimeout(() => btn.classList.remove("copied"), 1500); };
  const fallback = () => {
    if (!src) return;
    if (src.tagName === "TEXTAREA") src.select();
    else { const r = document.createRange(); r.selectNodeContents(src); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    say("Selected. Press Ctrl+C to copy.");
  };
  try { navigator.clipboard.writeText(text).then(done, fallback); } catch { fallback(); }
}

/**
 * The entry marker: a line across the Day calendar at the time of the entry centered in the scrolling Entries list,
 * moving through that entry's span as the list scrolls. `follow` scrolls the calendar to keep the line in view.
 * Hidden when the setting is off, or when the list does not scroll (the narrow stacked layout, or a short day).
 */
export function syncMarker(follow){
  const tl = body.querySelector(".tl[data-a]"), line = tl && tl.querySelector(".tl-now"), list = body.querySelector(".ent-list");
  if (!line) return;
  const lis = list ? [...list.children] : [];
  line.hidden = !state.entryLine || !lis.length || list.scrollHeight <= list.clientHeight;
  if (line.hidden) return;
  const cy = list.scrollTop + list.clientHeight / 2, li = lis.filter(x => x.offsetTop <= cy).pop() || lis[0];
  const f = Math.min(1, Math.max(0, (cy - li.offsetTop) / li.offsetHeight)), at = Number(li.dataset.at), to = Number(li.dataset.to);
  const a = Number(tl.dataset.a), b = Number(tl.dataset.b), track = tl.querySelector(".tl-col .tl-track");
  const y = track.offsetTop + (at + f * (to - at) - a) / (b - a) * track.offsetHeight;
  // From the first ticket column across, so the hour labels stay readable.
  line.style.top = `${y}px`; line.style.left = `${track.offsetLeft}px`; line.style.width = `${tl.scrollWidth - track.offsetLeft}px`;
  const head = track.offsetTop;
  if (follow && (y < tl.scrollTop + head + 12 || y > tl.scrollTop + tl.clientHeight - 24)) tl.scrollTop = y - (tl.clientHeight + head) / 2;
}

/** Binds the Time page: tabs, date navigation, the date picker, day clicks, copy buttons, note edits and the scrum dialog. */
export function initTime(){
  // Scroll does not bubble: listen in the capture phase for the Entries list, one marker update per frame.
  let raf = 0;
  body.addEventListener("scroll", e => { if (e.target.classList?.contains("ent-list") && !raf) raf = requestAnimationFrame(() => { raf = 0; syncMarker(true); }); }, true);
  window.addEventListener("resize", () => syncMarker(false));
  view.addEventListener("click", e => {
    // A render deferred by a note edit runs after this click, so the button clicked is never replaced under it.
    if (T.pending) setTimeout(renderTime, 0);
    if (e.target.closest("[data-marker]")){
      state.entryLine = !state.entryLine; saveEntryLine(state.entryLine);
      say(`Entry marker ${state.entryLine ? "on" : "off"}.`); renderTime(); return;
    }
    const tv = e.target.closest("[data-tview]");
    if (tv){ go(tv.dataset.tview, T.date); return; }
    const nav = e.target.closest("[data-tnav]");
    if (nav){ const n = Number(nav.dataset.tnav); go(T.view, n ? step(n) : ymd(Date.now())); return; }
    const sc = e.target.closest("[data-scrum]");
    if (sc){ openScrum(sc.dataset.scrum, sc); return; }
    const cp = e.target.closest("[data-copy]");
    if (cp){ copy(cp); return; }
    const day = e.target.closest("[data-day]");
    if (day) go("day", day.dataset.day);
  });
  dlg.addEventListener("click", e => {
    const cp = e.target.closest("[data-copy]");
    if (cp) copy(cp);
    else if (e.target.closest("#scrum-close")) dlg.close();
  });
  // A live re-render may have replaced the Scrum button while the dialog was open; focus its successor then.
  dlg.addEventListener("close", () => {
    const o = T.opener; T.opener = null; if (!o) return;
    (o.btn.isConnected ? o.btn : body.querySelector(`[data-scrum="${CSS.escape(o.date)}"]`))?.focus();
  });
  dateIn.addEventListener("change", () => { if (dateIn.value) go(T.view, dateIn.value); });
  body.addEventListener("input", e => { if (e.target.dataset.note != null) T.notes.set(e.target.dataset.note, e.target.value); });
  // Leaving a note for a control in the Time body (a press or Tab onto Copy) waits for that click; elsewhere renders now.
  body.addEventListener("pointerdown", () => { T.down = true; });
  for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, () => { if (!T.down) return; T.down = false; if (T.pending) setTimeout(renderTime, 50); });
  body.addEventListener("focusout", e => { if (T.pending && !T.down && !body.contains(e.relatedTarget)) setTimeout(renderTime, 0); });
}
