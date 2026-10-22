// The tour controller: a spotlight ring and a non-modal popover over the live controls. Steps and copy live in tour.js.
import {STEPS, stepsToShow, placePop} from "./tour.js";
import {loadToured, saveToured} from "./prefs.js";
import {state} from "./state.js";

let list = [], at = 0, pop = null, ring = null, back = null, auto = false;
const shown = sel => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };

function place(){
  const el = pop && document.querySelector(list[at].sel); if (!el) return;
  const r = el.getBoundingClientRect();
  Object.assign(ring.style, {left: r.left - 4 + "px", top: r.top - 4 + "px", width: r.width + 8 + "px", height: r.height + 8 + "px"});
  const p = placePop(r, pop.offsetWidth, pop.offsetHeight, innerWidth, innerHeight);
  pop.style.left = p.left + "px"; pop.style.top = p.top + "px";
}
function show(n){
  at = n; const s = list[at], last = at === list.length - 1, first = auto && at === 0;
  pop.querySelector("[data-tour-n]").textContent = state.skin === "leet" ? `$ tour ${at + 1}/${list.length}` : `Step ${at + 1} of ${list.length}`;
  pop.querySelector("h2").textContent = s.title;
  pop.querySelector("p").textContent = s.text;
  pop.querySelector("[data-tour-back]").hidden = at === 0;
  pop.querySelector("[data-tour-next]").textContent = first ? "Take the tour" : last ? "Done" : "Next";
  pop.querySelector("[data-tour-close]").textContent = first ? "Skip" : "Close";
  document.querySelector(s.sel).scrollIntoView({block: "nearest"});
  place();
}
/** Closes the tour, marks it seen and returns focus. */
export function endTour(){
  if (!pop) return;
  pop.remove(); ring.remove(); pop = ring = null; saveToured();
  removeEventListener("scroll", place, true); removeEventListener("resize", place);
  back?.focus?.();
}
/** Starts the tour at its first step whose target is on the page. */
export function startTour(isAuto = false, from = document.activeElement){
  endTour();
  list = stepsToShow(STEPS, STEPS.map(s => s.sel).filter(shown));
  if (!list.length) return;
  auto = isAuto; back = from;
  ring = document.createElement("div"); ring.className = "tour-ring";
  pop = document.createElement("div"); pop.className = "tour-pop";
  pop.setAttribute("role", "dialog"); pop.setAttribute("aria-labelledby", "tour-title"); pop.tabIndex = -1;
  pop.innerHTML = `<div class="tour-n" data-tour-n></div><h2 id="tour-title"></h2><p></p><div class="tour-btns"><button type="button" class="btn" data-tour-back>Back</button><button type="button" class="btn" data-tour-next>Next</button><button type="button" class="btn" data-tour-close>Close</button></div>`;
  pop.addEventListener("click", e => {
    if (e.target.closest("[data-tour-close]")) endTour();
    else if (e.target.closest("[data-tour-back]")) show(at - 1);
    else if (e.target.closest("[data-tour-next]")) at === list.length - 1 ? endTour() : show(at + 1);
  });
  document.body.append(ring, pop);
  addEventListener("scroll", place, true); addEventListener("resize", place);
  show(0); pop.focus();
}

let tried = false;
/** Starts the tour once per load on a first visit (board.toured unset). */
export function autoTour(){ if (!tried && !loadToured()){ tried = true; startTour(true); } }

/** Binds the tour buttons and keys. */
export function initTour(){
  document.addEventListener("click", e => {
    if (!e.target.closest("[data-tour]")) return;
    // The menu's row closes with the menu, so focus comes back to the gear instead.
    const menu = document.getElementById("settings-menu"), inMenu = menu.contains(e.target);
    menu.open = false;
    startTour(false, inMenu ? menu.querySelector("summary") : e.target.closest("[data-tour]"));
  });
  document.addEventListener("keydown", e => {
    if (!pop) return;
    if (e.key === "Escape") endTour();
    // Arrows step only when focus is in the tour or nowhere, so they never steal a date or select field's keys.
    else if (pop.contains(document.activeElement) || document.activeElement === document.body){
      if (e.key === "ArrowRight" && at < list.length - 1) show(at + 1);
      else if (e.key === "ArrowLeft" && at > 0) show(at - 1);
    }
  });
}
