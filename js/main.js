// The page's only entry: binds every controller, paints the empty state, then subscribes to the db (read-only).
// First: the partial fills the Settings menu before any module looks up its controls.
import "./partials/settings-menu.js";
import {state} from "./state.js";
import {saveSkin, saveShown} from "./prefs.js";
import {$, toggle, render, fitCols, startBoard, setDay, today, visible, doneOnDay} from "./board.js";
import {hashDay, pageHash} from "./util.js";
import {renderChooser, initChooser, openSearch} from "./chooser.js";
import {initLayoutEdit} from "./layout-edit.js";
import {initSettings} from "./settings.js";
import {initTime, showTime, renderTime} from "./time/controller.js";

function applySkin(){
  const skin = state.skin;
  document.body.classList.toggle("leet", skin === "leet");
  document.body.classList.toggle("sleek", skin !== "leet");
  toggle.checked = skin === "leet";
  $("lbl-sleek").classList.toggle("on", skin !== "leet");
  $("lbl-leet").classList.toggle("on", skin === "leet");
  renderChooser(); render(); renderTime();
}

// Board is "#board" or no hash (today) or "#board-yyyy-MM-dd"; Time is "#time", "#time-week" or "#time-month", optionally
// followed by "-yyyy-MM-dd". A Time hash without a date keeps the shared day. Dev preview flags (leet, pal-<id>, stack, ...)
// may share the hash, so tokens are found anywhere in it.
function route(){
  const h = location.hash, m = /\btime(?:-(week|month))?/.exec(h), time = !!m;
  // A dated hash picks the day; plain "#board" is today; plain "#time" keeps the shared day (today on a fresh load).
  setDay(hashDay(h) || (time && state.day) || today());
  document.body.dataset.view = time ? "time" : "board";
  document.querySelectorAll("[data-go]").forEach(b => { if ((b.dataset.go === "time") === time) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  // Time may have moved the day, and the stack's logs cannot be measured behind Time, so the board renders on the way back.
  if (time) showTime(m[1] || "day", state.day); else { renderChooser(); render(); }
}
// A viewer who never picked a day follows today: at midnight the hash's old date (Time writes one) moves to today too.
function rollDay(){
  if (state.dayPicked || state.day === today()) return;
  const h = location.hash.slice(1);
  if (hashDay(h)) try { location.hash = h.replace(hashDay(h), today()); } catch {}
  setDay(today()); route();
}

// window.claude.use("db") resolves after first paint, so the empty state renders before any data arrives.
async function boot(){
  state.db = await (window.claude?.use?.("db") ?? null);
  if (!state.db) return;
  state.db.collection("sessions").orderBy("updated", "desc").onSnapshot(snap => {
    state.sessions = snap.docs.map(d => ({id: d.id, data: d.data()}));
    if (!state.sessions.length) return;
    const keep = state.shown.filter(id => state.sessions.some(x => x.id === id));
    if (keep.length !== state.shown.length){ state.shown = keep; saveShown(state.shown); }
    renderChooser(); render(); renderTime();
  }, () => {});
  // Progress lines arrive often: the chips re-render only when the day's chip set changes, so a focused chip keeps focus.
  const chipKey = () => visible().map(s => s.id).join() + "|" + doneOnDay();
  state.db.collection("cards").onSnapshot(snap => {
    const before = chipKey();
    state.cards = snap.docs.map(d => ({_id: d.id, ...d.data()}));
    if (chipKey() !== before) renderChooser();
    render(); renderTime();
  }, () => {});
  try { route(); } catch (err){ console.error("Orchestration Board: route", err); }
}

initChooser();
startBoard();
toggle.addEventListener("change", () => { state.skin = toggle.checked ? "leet" : "sleek"; saveSkin(state.skin); applySkin(); });
initLayoutEdit();
initSettings();
initTime();
document.querySelector(".views").addEventListener("click", e => {
  const b = e.target.closest("[data-go]"); if (!b) return;
  try { location.hash = pageHash(b.dataset.go, state.dayPicked && state.day, today()); } catch {}
  route();
});
addEventListener("hashchange", route);
// "/" jumps to session search unless the viewer is typing somewhere already.
addEventListener("keydown", e => {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || document.body.dataset.view === "time" || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  e.preventDefault(); openSearch();
});
setInterval(rollDay, 30000);
// A failed first route must not stop the skin, the columns or the db subscription.
try { route(); } catch (err){ console.error("Orchestration Board: route", err); }
applySkin();
fitCols();
boot();
