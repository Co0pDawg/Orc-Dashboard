// The session chooser: plain click shows one session, Shift/Ctrl/Cmd-click or +/× stacks; plus Show finished and the day control.
import {esc, fmtDay, pageHash} from "./util.js";
import {state} from "./state.js";
import {saveShown, saveShowDone} from "./prefs.js";
import {sessionTitle} from "./render/shared.js";
import {$, chooser, say, visible, liveNow, render, tick, doneNow, doneOnDay, setDay, today} from "./board.js";
import {addDays} from "./time/render.js";

function chipsHtml(){
  const skin = state.skin, showDone = state.showDone;
  const vis = visible(), live = liveNow(), multi = vis.length > 1, done = doneOnDay();
  const doneBtn = done ? `<span class="chip show-done${showDone ? " on" : ""}"><button type="button" class="chip-main" data-show-done aria-pressed="${showDone}" title="${showDone ? "Hide" : "Show"} finished sessions">${skin === "leet" ? `finished:${done}` : `Show finished (${done})`}</button></span>` : "";
  if (!multi && skin !== "leet") return doneBtn && `<div class="chips" role="group" aria-label="Sessions">${doneBtn}</div>`;
  return `<div class="chips" role="group" aria-label="Sessions">${vis.map((x, i) => {
    const on = live.includes(x.id), t = x.data.title || x.id, mark = doneNow(x) ? "✓ " : x.data.scheduledAt && !x.data.completed && /^scheduled$/i.test(x.data.status || "") ? "⏱ " : "";
    const label = skin === "leet" ? `<span class="n">${i}</span> ${mark}${esc(t)}` : mark + esc(t);
    const tog = !multi || (on && live.length === 1) ? ""
      : `<button type="button" class="chip-x" data-toggle="${esc(x.id)}" aria-label="${on ? "Hide" : "Stack"} ${esc(t)}" title="${on ? "Hide this session" : "Stack below the others"}">${on ? "×" : "+"}</button>`;
    return `<span class="chip${on ? " on" : ""}${mark ? " done" : ""}"><button type="button" class="chip-main" data-id="${esc(x.id)}" aria-pressed="${on}" title="${esc(t)}${mark ? " (finished)" : ""}${multi ? " · Shift- or Ctrl-click to stack" : ""}">${label}</button>${tog}</span>`;
  }).join("")}${doneBtn}</div>`;
}
// The day control: the chips show the sessions touched on this day. It lives in the shell, so a snapshot never closes its date picker.
const dayNav = leet => `<span class="tnav day-nav" role="group" aria-label="Day"><button type="button" class="btn" data-dnav="-1" aria-label="Previous day" title="Previous day">◀</button><input type="date" data-dday aria-label="Go to date"><button type="button" class="btn" data-dnav="1" aria-label="Next day" title="Next day">▶</button><button type="button" class="btn" data-dnav="0" title="Back to today">${leet ? "today" : "Today"}</button></span>`;
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
      ? `<nav class="status" aria-label="Board status"><span class="tag">[orch]</span><div class="chip-slot" id="chip-slot"></div>${dayNav(true)}<span class="clock" id="clock"></span></nav>`
      : `<span class="brand">Orchestration Board</span><div class="chip-slot" id="chip-slot"></div>${dayNav(false)}<span class="clock" id="clock"></span>`;
    $("clock").after(gear);
    focused?.focus();
  }
  $("chip-slot").innerHTML = chipsHtml();
  const input = chooser.querySelector("[data-dday]");
  if (document.activeElement !== input) input.value = state.day;
  chooser.querySelector('[data-dnav="0"]').setAttribute("aria-pressed", String(state.day === today()));
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
// Same as Time's go(): the hash records the day, and the board renders directly in case the host swallows hashchange.
function pickDay(d){
  setDay(d);
  try { location.hash = pageHash("board", d, today()); } catch {}
  renderChooser(); render();
  say(`Showing sessions touched on ${fmtDay(d)}.`);
}

/** Binds the chooser's handlers (chips, stacking, Show finished, the day control). */
export function initChooser(){
  chooser.addEventListener("change", e => { if (e.target.matches("[data-dday]") && e.target.value) pickDay(e.target.value); });
  chooser.addEventListener("click", e => {
    const nav = e.target.closest("[data-dnav]");
    if (nav){ const n = Number(nav.dataset.dnav); pickDay(n ? addDays(state.day, n) : today()); return; }
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
