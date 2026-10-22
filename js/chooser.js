// The session chooser: plain click shows one session, Shift/Ctrl/Cmd-click or +/× stacks; plus Show finished and the day control.
import {esc, fmtDay, pageHash} from "./util.js";
import {state} from "./state.js";
import {saveShown, saveShowDone} from "./prefs.js";
import {sessionTitle} from "./render/shared.js";
import {$, chooser, say, visible, liveNow, render, tick, doneNow, doneOnDay, setDay, today} from "./board.js";
import {addDays, ymd} from "./time/render.js";
import {searchSessions, lastTouched, keepOpened} from "./search.js";

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
// The search icon and its popover live in the shell, so a snapshot re-renders only the results list, never the input.
const searchBox = leet => `<span class="search"><button type="button" class="btn search-btn" data-search-toggle aria-label="Search sessions" title="Search sessions (/)" aria-expanded="false" aria-controls="search-pop"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 10l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button><div class="search-pop" id="search-pop" hidden>${leet ? `<span class="find" aria-hidden="true">find:</span>` : ""}<input type="search" data-search role="combobox" aria-expanded="false" aria-controls="search-list" aria-autocomplete="list" aria-label="Search sessions" placeholder="Search sessions" autocomplete="off" spellcheck="false"><ul id="search-list" class="search-list" role="listbox" aria-label="Sessions found" hidden></ul></div></span>`;
let active = -1, hits = [];
const box = () => chooser.querySelector("[data-search]"), list = () => $("search-list"), pop = () => $("search-pop"), icon = () => chooser.querySelector("[data-search-toggle]");
/** Opens the search popover under its icon and focuses the field. */
export function openSearch(){ pop().hidden = false; icon().setAttribute("aria-expanded", "true"); box().focus(); }
// Closing clears the field; refocus returns focus to the icon (Esc, a click on nothing focusable).
function closeSearch(refocus){
  if (pop().hidden) return;
  box().value = ""; closeList(); pop().hidden = true; icon().setAttribute("aria-expanded", "false");
  if (refocus) icon().focus();
}
function closeList(){ const b = box(); list().hidden = true; b.setAttribute("aria-expanded", "false"); b.removeAttribute("aria-activedescendant"); active = -1; }
/** Re-renders the search results for the box's current text; an empty box closes the list. */
function renderList(){
  const b = box(), q = b.value.trim();
  if (!q){ closeList(); return; }
  const r = searchSessions(state.sessions, state.cards, q);
  hits = r.hits; if (active >= hits.length) active = hits.length - 1;
  list().innerHTML = hits.length ? hits.map((h, i) => {
    const d = h.s.data, day = h.last ? fmtDay(ymd(h.last)) : "";
    return `<li role="option" id="search-opt-${i}" data-open="${esc(h.s.id)}" aria-selected="${i === active}"><span class="t">${esc(d.title || h.s.id)}</span><span>${doneNow(h.s) ? "Done" : "Open"}</span><span class="m">${d.ticket ? esc(d.ticket) + " · " : ""}${esc(day)}</span></li>`;
  }).join("") + (r.more ? `<li class="note">${r.more} more, refine your search</li>` : "") : `<li class="note">No sessions match</li>`;
  list().hidden = false; b.setAttribute("aria-expanded", "true");
  if (active >= 0) b.setAttribute("aria-activedescendant", "search-opt-" + active); else b.removeAttribute("aria-activedescendant");
}
// Opening a result moves the shared day to its last touch and shows it alone, the same as a plain chip click there.
function openResult(sid){
  const s = state.sessions.find(x => x.id === sid); if (!s) return;
  const last = lastTouched(s, state.cards), d = last ? ymd(last) : today();
  setDay(d); state.dayPicked = true; state.opened = {id: sid, day: d};
  try { location.hash = pageHash("board", d, today()); } catch {}
  closeSearch(false);
  setShown([sid], sid);
  const el = state.views.get(sid)?.el; if (el){ el.tabIndex = -1; el.focus({preventScroll: true}); }
  say(`Opened ${sessionTitle(sid)}, ${fmtDay(d)}.`);
}
// Replays the tour (js/tour-ui.js binds every [data-tour]); the gear goes back between the clock and this.
const helpBtn = `<button type="button" class="btn tour-help" data-tour aria-label="Take the tour" title="Take the tour">?</button>`;
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
      ? `<nav class="status" aria-label="Board status"><span class="tag">[orch]</span>${dayNav(true)}${searchBox(true)}<div class="chip-slot" id="chip-slot"></div><span class="clock" id="clock"></span>${helpBtn}</nav>`
      : `<span class="brand">Orchestration Board</span>${dayNav(false)}${searchBox(false)}<div class="chip-slot" id="chip-slot"></div><span class="clock" id="clock"></span>${helpBtn}`;
    $("clock").after(gear);
    focused?.focus();
  }
  $("chip-slot").innerHTML = chipsHtml();
  if (!list().hidden) renderList();
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
  if (!keepOpened(state.opened, state.day, next)) state.opened = null;
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
  setDay(d); state.opened = null;
  try { location.hash = pageHash("board", d, today()); } catch {}
  renderChooser(); render();
  say(`Showing sessions touched on ${fmtDay(d)}.`);
}

/** Binds the chooser's handlers (chips, stacking, Show finished, the day control). */
export function initChooser(){
  chooser.addEventListener("input", e => { if (e.target.matches("[data-search]")){ active = -1; renderList(); } });
  chooser.addEventListener("keydown", e => {
    if (!e.target.matches("[data-search]")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp"){
      e.preventDefault();
      if (list().hidden){ renderList(); return; }
      if (hits.length) active = e.key === "ArrowDown" ? (active + 1) % hits.length : active <= 0 ? hits.length - 1 : active - 1;
      renderList();
    } else if (e.key === "Enter"){ if (!list().hidden && hits[active]){ e.preventDefault(); openResult(hits[active].s.id); } }
    else if (e.key === "Escape"){ e.preventDefault(); if (!list().hidden) closeList(); else closeSearch(true); }
  });
  // A click outside closes the popover; focus returns to the icon unless the click landed on something focusable.
  document.addEventListener("mousedown", e => {
    if (pop().hidden || e.target.closest?.(".search")) return;
    // Blur first: a hidden field drops focus only at the next style pass, which can land after the check below.
    if (pop().contains(document.activeElement)) document.activeElement.blur();
    closeSearch(false);
    setTimeout(() => { const f = document.activeElement; if (!f || f === document.body || pop().contains(f)) icon().focus(); }, 0);
  });
  // Tab out closes it too; focus stays where it went, or returns to the icon when it went nowhere.
  document.addEventListener("focusout", e => { if (e.target.closest?.(".search-pop") && !e.relatedTarget?.closest?.(".search-pop")) setTimeout(() => closeSearch(document.activeElement === document.body), 0); });
  chooser.addEventListener("mousedown", e => { if (e.target.closest(".search-list")) e.preventDefault(); });
  chooser.addEventListener("change", e => { if (e.target.matches("[data-dday]") && e.target.value) pickDay(e.target.value); });
  chooser.addEventListener("click", e => {
    const nav = e.target.closest("[data-dnav]");
    if (nav){ const n = Number(nav.dataset.dnav); pickDay(n ? addDays(state.day, n) : today()); return; }
    if (e.target.closest("[data-show-done]")){
      state.showDone = !state.showDone; state.opened = null; saveShowDone(state.showDone);
      state.chipFocus = {id: "", kind: "show-done"}; renderChooser(); render();
      say(state.showDone ? "Showing finished sessions." : "Finished sessions hidden.");
      return;
    }
    if (e.target.closest("[data-search-toggle]")){ if (pop().hidden) openSearch(); else closeSearch(true); return; }
    const o = e.target.closest("[data-open]");
    if (o){ openResult(o.dataset.open); return; }
    const t = e.target.closest("[data-toggle]");
    if (t){ state.chipFocus = {id: t.dataset.toggle, kind: "toggle"}; toggleShown(t.dataset.toggle); return; }
    const b = e.target.closest("[data-id]"); if (!b) return;
    state.chipFocus = {id: b.dataset.id, kind: "id"};
    if (e.shiftKey || e.ctrlKey || e.metaKey) toggleShown(b.dataset.id);
    else { setShown([b.dataset.id]); say(`Showing ${sessionTitle(b.dataset.id)}.`); }
  });
}
