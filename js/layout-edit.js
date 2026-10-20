// Customize mode: per-pane move/resize buttons, grip arrow keys, corner drag, the reset menu and its undo toast.
import {clamp} from "./util.js";
import {state} from "./state.js";
import {saveLayout, saveCardFold} from "./prefs.js";
import {paneName} from "./render/shared.js";
import {$, stack, resetMenu, customize, say, render, slotEl, setOrder} from "./board.js";

const RMAX = 6; // tallest pane, in grid rows

function setEditing(on){
  state.editing = on;
  customize.setAttribute("aria-pressed", String(on));
  customize.textContent = on ? "Done" : "Customize layout";
  resetMenu.hidden = !on; resetMenu.open = false;
  document.body.classList.toggle("editing", on);
  for (const v of state.views.values()) v.sortable?.option("disabled", !on);
  say(on ? "Customizing layout. Use the buttons on each pane, or drag the grip and the corner." : "Layout saved.");
  render();
}
function showToast(msg){
  $("toast-msg").textContent = msg; $("toast").hidden = false; say(msg + ". Undo available.");
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { $("toast").hidden = true; state.undoLayout = null; }, 8000);
}
function move(id, delta){
  const list = [...slotEl(id).parentElement.children].map(x => x.dataset.id);
  const i = list.indexOf(id), j = clamp(i + delta, 0, list.length - 1);
  if (i === j) return;
  list.splice(j, 0, list.splice(i, 1)[0]);
  setOrder(list);
  say(`${paneName(id)}, position ${j + 1} of ${list.length}`);
}
function resize(id, dw, dh){
  const cols = state.cols;
  const s = {...(state.layout.size[id] || {})};
  if (dw){ s.w = clamp(Math.min(s.w || 1, cols) + dw, 1, cols); say(`Width ${s.w} of ${cols} columns`); }
  if (dh){ s.r = clamp((s.r || 1) + dh, 1, RMAX); say(`Height ${s.r} row${s.r > 1 ? "s" : ""}`); }
  state.layout.size[id] = s; saveLayout(state.layout);
}

/** Binds the customize, undo, reset-menu, document and stack (click, keydown, pointerdown) handlers. */
export function initLayoutEdit(){
  customize.addEventListener("click", () => setEditing(!state.editing));
  $("undo").addEventListener("click", () => {
    if (!state.undoLayout) return;
    state.layout = JSON.parse(state.undoLayout); state.undoLayout = null; saveLayout(state.layout);
    $("toast").hidden = true; say("Layout restored."); render();
  });
  resetMenu.addEventListener("click", e => {
    const b = e.target.closest("[data-reset]"); if (!b) return;
    state.undoLayout = JSON.stringify(state.layout);
    const what = b.dataset.reset;
    if (what !== "size") state.layout.order = [];
    if (what !== "order") state.layout.size = {};
    saveLayout(state.layout); resetMenu.open = false;
    showToast({order: "Order reset", size: "Sizes reset", all: "Layout reset"}[what]);
    render();
  });
  document.addEventListener("click", e => { if (resetMenu.open && !resetMenu.contains(e.target)) resetMenu.open = false; });

  stack.addEventListener("click", e => {
    const f = e.target.closest("[data-cardfold]");
    if (f){
      const id = f.dataset.cardfold, on = !state.cardFold[id];
      if (on) state.cardFold[id] = true; else delete state.cardFold[id];
      saveCardFold(state.cardFold);
      say(`${paneName(id)} ${on ? "minimized" : "expanded"}.`); render();
      stack.querySelector(`[data-cardfold="${CSS.escape(id)}"]`)?.focus();
      return;
    }
    const m = e.target.closest("[data-subs]");
    if (m){
      const key = m.dataset.subs, open = m.getAttribute("aria-expanded") !== "true";
      state.subOpen.set(key, open); render();
      stack.querySelector(`[data-subs="${CSS.escape(key)}"]`)?.focus();
      return;
    }
    const b = e.target.closest("[data-act]"); if (!b || !state.editing) return;
    const id = b.closest(".slot").dataset.id, act = b.dataset.act;
    if (act === "left") move(id, -1);
    else if (act === "right") move(id, 1);
    else if (act === "w-") resize(id, -1, 0);
    else if (act === "w+") resize(id, 1, 0);
    else if (act === "h-") resize(id, 0, -1);
    else if (act === "h+") resize(id, 0, 1);
    else if (act === "reset"){ state.undoLayout = JSON.stringify(state.layout); delete state.layout.size[id]; saveLayout(state.layout); showToast(`${paneName(id)} size reset`); }
    else return;
    state.refocus = {id, act};
    render();
  });
  stack.addEventListener("keydown", e => {
    const g = e.target.closest(".grip"); if (!g || !state.editing) return;
    const d = {ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1}[e.key]; if (!d) return;
    e.preventDefault();
    const id = g.closest(".slot").dataset.id;
    move(id, d); state.refocus = {id, act: "grip"}; render();
  });

  /* corner grip: width snaps to columns, height to whole grid rows */
  stack.addEventListener("pointerdown", e => {
    const g = e.target.closest(".corner"); if (!g || !state.editing) return;
    e.preventDefault();
    const el = g.closest(".slot"), id = el.dataset.id, tiles = el.parentElement;
    const r = el.getBoundingClientRect(), tr = tiles.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(tiles).columnGap) || 0, colW = (tr.width - gap * (state.cols - 1)) / state.cols;
    const s = {...(state.layout.size[id] || {})};
    // ponytail: rows differ in height, so the drag uses this pane's average row height; the buttons step exact rows
    const rowH = (r.height + gap) / (s.r || 1);
    state.busy = true; g.setPointerCapture(e.pointerId);
    const onMove = ev => {
      if (state.cols > 1) s.w = clamp(Math.round((ev.clientX - r.left + gap) / (colW + gap)), 1, state.cols);
      s.r = clamp(Math.round((ev.clientY - r.top) / rowH), 1, RMAX);
      el.style.gridColumn = `span ${Math.min(s.w || 1, state.cols)}`; el.style.gridRow = `span ${s.r}`;
    };
    const onEnd = () => {
      g.removeEventListener("pointermove", onMove); g.removeEventListener("pointerup", onEnd); g.removeEventListener("pointercancel", onEnd);
      state.busy = false; state.layout.size[id] = s; saveLayout(state.layout);
      say(`${paneName(id)} resized to ${Math.min(s.w || 1, state.cols)} of ${state.cols} columns, ${s.r} row${s.r > 1 ? "s" : ""} tall`);
      render();
    };
    g.addEventListener("pointermove", onMove); g.addEventListener("pointerup", onEnd); g.addEventListener("pointercancel", onEnd);
  });
}
