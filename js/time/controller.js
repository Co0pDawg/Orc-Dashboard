// The Time page: subscribes to timeline/<date> docs and the cards collection, computes each day with the pure
// js/time modules, and renders Day, Week or Month into #time-body. Read-only: nothing here writes the db.
import {state} from "../state.js";
import {$, say} from "../board.js";
import {drivingSegments, agentSpans, agentMarkers} from "./segments.js";
import {buildEntries} from "./entries.js";
import {dayHtml, entriesHtml, emptyHtml, withReview, ticketTitles, dayStartMs, ymd, addDays} from "./render.js";

const view = $("time-view"), body = $("time-body"), dateIn = $("time-date");
const T = {view: "day", date: ymd(Date.now()), docs: new Map(), key: "", stop: null, cards: [], cardsOn: false, notes: new Map(), pending: false};

/** Whether the Time page is showing. */
const active = () => document.body.dataset.view === "time";

// One subscription per shown range (a day, a week or a month), replaced when the range changes.
function subscribe(){
  if (!state.db) return;
  if (!T.cardsOn){
    T.cardsOn = true;
    state.db.collection("cards").onSnapshot(snap => { T.cards = snap.docs.map(d => ({_id: d.id, ...d.data()})); renderTime(); }, () => {});
  }
  const [from, to] = [T.date, T.date], key = from + "|" + to;
  if (key === T.key) return;
  T.stop?.(); T.key = key; T.docs = new Map();
  T.stop = state.db.collection("timeline").where("date", ">=", from).where("date", "<=", to).onSnapshot(snap => {
    T.docs = new Map(snap.docs.map(d => { const x = d.data(); return [x.date || d.id, x]; }));
    renderTime();
  }, () => {});
}

/** One day computed from its timeline doc and the board's sessions and cards. */
function dayInfo(date){
  const doc = T.docs.get(date), events = (doc && Array.isArray(doc.events)) ? doc.events : [];
  const dayStart = new Date(dayStartMs(date)).toISOString(), dayEnd = new Date(dayStartMs(addDays(date, 1)) - 1).toISOString();
  return {date, doc, segments: drivingSegments(events, {dayStart, dayEnd, now: new Date().toISOString()}),
    spans: agentSpans(state.sessions, T.cards, dayStart, dayEnd), markers: agentMarkers(events)};
}

function dayView(){
  const d = dayInfo(T.date);
  if (!d.doc) return emptyHtml(T.date);
  const result = buildEntries(d.segments, {unit: state.rounding});
  const flags = withReview(d.doc.flags, d.segments, d.doc.sessions);
  return `<div class="day"><div class="day-main">${dayHtml({...d, entries: result, tickets: ticketTitles(state.sessions, T.cards), skin: state.skin})}</div>${entriesHtml(result, {date: T.date, notes: d.doc.notes, flags})}</div>`;
}

const longDate = date => new Date(date + "T00:00:00").toLocaleDateString([], {weekday: "short", month: "short", day: "numeric", year: "numeric"});
function renderBar(){
  view.querySelectorAll("[data-tview]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tview === T.view)));
  $("time-label").textContent = longDate(T.date);
  $("time-prev").setAttribute("aria-label", "Previous day");
  $("time-next").setAttribute("aria-label", "Next day");
  dateIn.value = T.date;
}

// A live update must not wipe a note being typed, so it waits until the textarea loses focus.
/** Renders the Time page from the loaded docs; deferred while a note is being edited. */
export function renderTime(){
  if (!active()) return;
  if (document.activeElement?.tagName === "TEXTAREA" && body.contains(document.activeElement)){ T.pending = true; return; }
  T.pending = false;
  renderBar();
  body.innerHTML = dayView();
  // Note edits are never saved, but they survive a re-render on this page load.
  body.querySelectorAll("textarea[data-note]").forEach(ta => { if (T.notes.has(ta.dataset.note)) ta.value = T.notes.get(ta.dataset.note); });
}

/** Shows the Time page on a view ("day", "week" or "month") and date (yyyy-MM-dd, default the current one). */
export function showTime(v, date){
  T.view = ["day", "week", "month"].includes(v) ? v : "day";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date || "") && !isNaN(dayStartMs(date))) T.date = date;
  subscribe();
  renderTime();
}

/** The hash token for a view and date. */
const token = (v, date) => "time" + (v === "day" ? "" : "-" + v) + "-" + date;
// The view lives in the URL as a plain hash token; showTime runs directly too in case the host swallows hashchange.
function go(v, date){
  try { location.replace("#" + token(v, date)); } catch {}
  showTime(v, date);
}

// Copy into the clipboard from the click itself; where the frame refuses, select the text so Ctrl+C works.
function copy(btn){
  const src = btn.previousElementSibling, text = src && src.tagName === "TEXTAREA" ? src.value : btn.dataset.copy;
  const done = () => { say(btn.title.replace(/^Copy/, "Copied") + "."); btn.classList.add("copied"); setTimeout(() => btn.classList.remove("copied"), 1500); };
  const fallback = () => {
    if (!src) return;
    if (src.tagName === "TEXTAREA") src.select();
    else { const r = document.createRange(); r.selectNodeContents(src); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    say("Selected. Press Ctrl+C to copy.");
  };
  try { navigator.clipboard.writeText(text).then(done, fallback); } catch { fallback(); }
}

/** Binds the Time page: tabs, date navigation, the date picker, copy buttons and note edits. */
export function initTime(){
  view.addEventListener("click", e => {
    const tv = e.target.closest("[data-tview]");
    if (tv){ go(tv.dataset.tview, T.date); return; }
    const nav = e.target.closest("[data-tnav]");
    if (nav){ const n = Number(nav.dataset.tnav); go(T.view, n ? addDays(T.date, n) : ymd(Date.now())); return; }
    const cp = e.target.closest("[data-copy]");
    if (cp){ copy(cp); return; }
  });
  dateIn.addEventListener("change", () => { if (dateIn.value) go(T.view, dateIn.value); });
  body.addEventListener("input", e => { if (e.target.dataset.note != null) T.notes.set(e.target.dataset.note, e.target.value); });
  body.addEventListener("focusout", () => { if (T.pending) setTimeout(renderTime, 0); });
}
