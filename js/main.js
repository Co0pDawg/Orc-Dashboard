// The page's only entry: binds every controller, paints the empty state, then subscribes to the db (read-only).
import {state} from "./state.js";
import {saveSkin, saveShown} from "./prefs.js";
import {$, toggle, render, fitCols, startBoard} from "./board.js";
import {renderChooser, initChooser} from "./chooser.js";
import {initLayoutEdit} from "./layout-edit.js";

function applySkin(){
  const skin = state.skin;
  document.body.classList.toggle("leet", skin === "leet");
  document.body.classList.toggle("sleek", skin !== "leet");
  toggle.checked = skin === "leet";
  $("lbl-sleek").classList.toggle("on", skin !== "leet");
  $("lbl-leet").classList.toggle("on", skin === "leet");
  renderChooser(); render();
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
    renderChooser(); render();
  }, () => {});
}

initChooser();
startBoard();
toggle.addEventListener("change", () => { state.skin = toggle.checked ? "leet" : "sleek"; saveSkin(state.skin); applySkin(); });
initLayoutEdit();
applySkin();
fitCols();
boot();
