// The session chooser: plain click shows one session, Shift/Ctrl/Cmd-click or +/× stacks; plus Show finished and the 1337 bar color.
import {esc} from "./util.js";
import {state} from "./state.js";
import {saveShown, saveShowDone} from "./prefs.js";
import {sessionTitle} from "./render/shared.js";
import {$, chooser, say, visible, liveNow, render, tick, doneNow} from "./board.js";

function chipsHtml(){
  const skin = state.skin, showDone = state.showDone;
  const vis = visible(), live = liveNow(), multi = vis.length > 1, done = state.sessions.filter(doneNow).length;
  const doneBtn = done ? `<span class="chip show-done${showDone ? " on" : ""}"><button type="button" class="chip-main" data-show-done aria-pressed="${showDone}" title="${showDone ? "Hide" : "Show"} finished sessions">${skin === "leet" ? `finished:${done}` : `Show finished (${done})`}</button></span>` : "";
  if (!multi && skin !== "leet") return doneBtn && `<div class="chips" role="group" aria-label="Sessions">${doneBtn}</div>`;
  return `<div class="chips" role="group" aria-label="Sessions">${vis.map((x, i) => {
    const on = live.includes(x.id), t = x.data.title || x.id, mark = doneNow(x) ? "✓ " : "";
    const label = skin === "leet" ? `<span class="n">${i}</span> ${mark}${esc(t)}` : mark + esc(t);
    const tog = !multi || (on && live.length === 1) ? ""
      : `<button type="button" class="chip-x" data-toggle="${esc(x.id)}" aria-label="${on ? "Hide" : "Stack"} ${esc(t)}" title="${on ? "Hide this session" : "Stack below the others"}">${on ? "×" : "+"}</button>`;
    return `<span class="chip${on ? " on" : ""}${mark ? " done" : ""}"><button type="button" class="chip-main" data-id="${esc(x.id)}" aria-pressed="${on}" title="${esc(t)}${mark ? " (finished)" : ""}${multi ? " · Shift- or Ctrl-click to stack" : ""}">${label}</button>${tog}</span>`;
  }).join("")}${doneBtn}</div>`;
}
// The bar shell is built once per skin and only the chips re-render, so live data never closes an open color picker.
/** Renders the chooser bar and its chips, restoring chip focus. */
export function renderChooser(){
  const skin = state.skin;
  if (chooser.dataset.skin !== skin){
    // The gear is one permanent element (its open state, radios and color picker must survive a skin switch made
    // from inside it), so take it out before the shell is rebuilt, put it back after the clock, and restore focus.
    const gear = $("settings-menu"), focused = gear.contains(document.activeElement) ? document.activeElement : null;
    gear.remove();
    chooser.dataset.skin = skin;
    chooser.innerHTML = skin === "leet"
      ? `<nav class="status" aria-label="Board status"><span class="tag">[orch]</span><div class="chip-slot" id="chip-slot"></div><span class="clock" id="clock"></span></nav>`
      : `<span class="brand">Orchestration Board</span><div class="chip-slot" id="chip-slot"></div><span class="clock" id="clock"></span>`;
    $("clock").after(gear);
    focused?.focus();
  }
  $("chip-slot").innerHTML = chipsHtml();
  if (state.chipFocus){
    const q = k => chooser.querySelector(`[data-${k}="${CSS.escape(state.chipFocus.id)}"]`);
    (q(state.chipFocus.kind) || q("id"))?.focus(); state.chipFocus = null;
  }
  tick();
}
function setShown(next, scrollTo){
  state.shown = next; saveShown(state.shown); renderChooser(); render();
  if (scrollTo) state.views.get(scrollTo)?.el.scrollIntoView({block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
}
function toggleShown(sid){
  const live = liveNow();
  if (!live.includes(sid)){ setShown([...live, sid], sid); say(`Stacked ${sessionTitle(sid)}. ${live.length + 1} sessions shown.`); }
  else if (live.length > 1){ setShown(live.filter(x => x !== sid)); say(`Hid ${sessionTitle(sid)}.`); }
}

/** Binds the chooser's click handler (chips, stacking, Show finished). */
export function initChooser(){
  chooser.addEventListener("click", e => {
    if (e.target.closest("[data-show-done]")){
      state.showDone = !state.showDone; saveShowDone(state.showDone);
      state.chipFocus = {id: "", kind: "show-done"}; renderChooser(); render();
      say(state.showDone ? "Showing finished sessions." : "Finished sessions hidden.");
      return;
    }
    const t = e.target.closest("[data-toggle]");
    if (t){ state.chipFocus = {id: t.dataset.toggle, kind: "toggle"}; toggleShown(t.dataset.toggle); return; }
    const b = e.target.closest("[data-id]"); if (!b) return;
    state.chipFocus = {id: b.dataset.id, kind: "id"};
    if (e.shiftKey || e.ctrlKey || e.metaKey) toggleShown(b.dataset.id);
    else { setShown([b.dataset.id]); say(`Showing ${sessionTitle(b.dataset.id)}.`); }
  });
}
