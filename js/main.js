// The page's only entry: binds every controller, paints the empty state, then subscribes to the db (read-only).
import {state} from "./state.js";
import {saveSkin, saveShown} from "./prefs.js";
import {$, toggle, render, fitCols, startBoard, fillLogs} from "./board.js";
import {renderChooser, initChooser} from "./chooser.js";
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

// Board is "#board" or no hash; Time is "#time", "#time-week" or "#time-month", optionally followed by "-yyyy-MM-dd".
// Dev preview flags (leet, pal-<id>, stack, ...) may share the hash, so tokens are found anywhere in it.
function route(){
  const h = location.hash, m = /\btime(?:-(week|month))?/.exec(h), time = !!m;
  document.body.dataset.view = time ? "time" : "board";
  document.querySelectorAll("[data-go]").forEach(b => { if ((b.dataset.go === "time") === time) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  // The stack renders while hidden behind Time, where its logs cannot be measured, so they fill on the way back.
  if (time) showTime(m[1] || "day", /\d{4}-\d{2}-\d{2}/.exec(h)?.[0]); else fillLogs();
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
  route();
}

initChooser();
startBoard();
toggle.addEventListener("change", () => { state.skin = toggle.checked ? "leet" : "sleek"; saveSkin(state.skin); applySkin(); });
initLayoutEdit();
initSettings();
initTime();
document.querySelector(".views").addEventListener("click", e => {
  const b = e.target.closest("[data-go]"); if (!b) return;
  try { location.hash = b.dataset.go; } catch {}
  route();
});
addEventListener("hashchange", route);
route();
applySkin();
fitCols();
boot();
