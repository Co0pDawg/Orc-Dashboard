// Per-pane edit mode (each pane's ✎): move/resize buttons, grip arrow keys, corner drag, Esc to leave; session reorder;
// the Settings > Layout resets and their undo toast.
import {clamp} from "./util.js";
import {state} from "./state.js";
import {saveLayout, saveCardFold, saveShown} from "./prefs.js";
import {paneName, sessionTitle, isEditing} from "./render/shared.js";
import {$, stack, say, render, slotEl, setOrder, liveNow} from "./board.js";

const RMAX = 6; // tallest pane, in grid rows

// The ✎ is re-rendered with its pane, so focus goes back to the new one.
function setPaneEdit(id, on){
  if (on) state.editing.add(id); else state.editing.delete(id);
  say(on ? `Editing layout of ${paneName(id)}` : `Done editing ${paneName(id)}`);
  render();
  slotEl(id)?.querySelector("[data-edit]")?.focus();
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

// Cards share a grid row when their tops line up; the activity log is never minimized, so it is left out.
// A tall card that started in an earlier row is not counted in this one.
function rowCardIds(slot){
  const top = slot.getBoundingClientRect().top;
  return [...slot.parentElement.children]
    .filter(el => !el.classList.contains("log") && Math.abs(el.getBoundingClientRect().top - top) < 2)
    .map(el => el.dataset.id);
}

// The stack follows state.shown, so reordering sessions rewrites it: the shown sessions in their new order,
// then any saved ids not on screen now (hidden finished sessions keep their place for when they come back).
function setSessionOrder(ids){
  state.shown = ids.concat(state.shown.filter(id => !ids.includes(id)));
  saveShown(state.shown);
}
function moveSession(sid, delta){
  const live = liveNow(), i = live.indexOf(sid), j = clamp(i + delta, 0, live.length - 1);
  if (i < 0 || i === j) return;
  live.splice(j, 0, live.splice(i, 1)[0]);
  setSessionOrder(live);
  say(`${sessionTitle(sid)}, session ${j + 1} of ${live.length}`);
}

/** Binds the undo, Settings > Layout reset and stack (click, keydown, pointerdown) handlers. */
export function initLayoutEdit(){
  // Session blocks drag by their own grip; pane grips belong to each session's tiles Sortable, so the two never mix.
  // Enabled always: only a session whose ✎ is on renders a .sgrip.
  if (window.Sortable) state.stackSortable = Sortable.create(stack, {
    handle: ".sgrip", draggable: ".sess", group: "sessions", animation: 150, delay: 150, delayOnTouchOnly: true, ghostClass: "ghost",
    onStart(){ state.busy = true; },
    onEnd(evt){
      state.busy = false;
      setSessionOrder([...stack.children].filter(x => x.classList.contains("sess")).map(x => x.dataset.sid));
      say(`${sessionTitle(evt.item.dataset.sid)}, session ${evt.newDraggableIndex + 1} of ${state.views.size}`);
      render();
    }
  });
  $("undo").addEventListener("click", () => {
    if (!state.undoLayout) return;
    state.layout = JSON.parse(state.undoLayout); state.undoLayout = null; saveLayout(state.layout);
    $("toast").hidden = true; say("Layout restored."); render();
  });
  $("settings-menu").addEventListener("click", e => {
    const b = e.target.closest("[data-reset]"); if (!b) return;
    state.undoLayout = JSON.stringify(state.layout);
    const what = b.dataset.reset;
    if (what !== "size") state.layout.order = [];
    if (what !== "order") state.layout.size = {};
    saveLayout(state.layout);
    showToast({order: "Order reset", size: "Sizes reset", all: "Layout reset"}[what]);
    render();
  });

  stack.addEventListener("click", e => {
    const pe = e.target.closest("[data-edit]");
    if (pe){ setPaneEdit(pe.dataset.edit, !state.editing.has(pe.dataset.edit)); return; }
    const se = e.target.closest("[data-sedit]");
    if (se){
      const sid = se.dataset.sedit, on = !state.editSess.has(sid);
      if (on) state.editSess.add(sid); else state.editSess.delete(sid);
      say(on ? `Editing position of ${sessionTitle(sid)}` : `Done editing ${sessionTitle(sid)}`); render();
      return;
    }
    const sb = e.target.closest("[data-sact]");
    if (sb){
      if (!state.editSess.has(sb.dataset.sid) || sb.dataset.sact === "grip") return;
      moveSession(sb.dataset.sid, sb.dataset.sact === "up" ? -1 : 1);
      state.sessFocus = {sid: sb.dataset.sid, act: sb.dataset.sact}; render();
      return;
    }
    const f = e.target.closest("[data-cardfold]");
    if (f){
      const id = f.dataset.cardfold, on = !state.cardFold[id];
      const ids = e.shiftKey || e.altKey ? rowCardIds(f.closest(".slot")) : [id];
      for (const x of ids){ if (on) state.cardFold[x] = true; else delete state.cardFold[x]; }
      saveCardFold(state.cardFold);
      say(ids.length > 1 ? `${ids.length} cards in this row ${on ? "minimized" : "expanded"}.` : `${paneName(id)} ${on ? "minimized" : "expanded"}.`); render();
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
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest(".slot").dataset.id, act = b.dataset.act;
    if (!isEditing(id)) return;
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
    const pane = e.target.closest(".slot");
    if (e.key === "Escape" && pane && isEditing(pane.dataset.id)){ e.preventDefault(); const sid = pane.closest(".sess")?.dataset.sid; if (!state.editing.has(pane.dataset.id) && sid && state.editSess.has(sid)){ state.editSess.delete(sid); say("Done editing " + sessionTitle(sid)); render(); stack.querySelector(`[data-sedit="${CSS.escape(sid)}"]`)?.focus(); } else setPaneEdit(pane.dataset.id, false); return; }
    const sg = e.target.closest(".sgrip");
    if (sg && state.editSess.has(sg.dataset.sid)){
      const d = {ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1}[e.key]; if (!d) return;
      e.preventDefault();
      moveSession(sg.dataset.sid, d); state.sessFocus = {sid: sg.dataset.sid, act: "grip"}; render();
      return;
    }
    const g = e.target.closest(".grip"); if (!g || !isEditing(pane.dataset.id)) return;
    const d = {ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1}[e.key]; if (!d) return;
    e.preventDefault();
    const id = pane.dataset.id;
    move(id, d); state.refocus = {id, act: "grip"}; render();
  });

  /* corner grip: width snaps to columns, height to whole grid rows */
  stack.addEventListener("pointerdown", e => {
    const g = e.target.closest(".corner"); if (!g || !isEditing(g.closest(".slot").dataset.id)) return;
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
