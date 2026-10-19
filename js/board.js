// The session stack: one block per shown session (header + pane grid), live timers, and column fitting.
import {cardState, isDone, visibleSessions, liveIds, logId, isLog, QUIET_MS} from "./model.js";
import {ago} from "./util.js";
import {state} from "./state.js";
import {saveLayout, saveFold} from "./prefs.js";
import {paneName, sessionTitle, editBar, emptyHtml} from "./render/shared.js";
import {sleekCard, sleekLog, sleekHead} from "./render/sleek.js";
import {leetCard, leetLog, leetHead} from "./render/leet.js";

/** Element by id. */
export const $ = id => document.getElementById(id);
export const chooser = $("chooser"), stack = $("stack"), toggle = $("skin-toggle"), resetMenu = $("reset-menu"), customize = $("customize");
const topEl = $("top"), controls = $("controls"), bar = $("layout-bar");

/** Announces msg through the sr live region. */
export function say(msg){ const sr = $("sr"); sr.textContent = ""; setTimeout(() => { sr.textContent = msg; }, 30); }
/** Sessions offered on the chips right now. */
export const visible = () => visibleSessions(state.sessions, state.showDone);
/** Session ids the stack shows right now. */
export const liveNow = () => liveIds(state.shown, visible());
/** Whether a session is minimized: the viewer's choice, else folded when finished. */
const isFolded = s => state.fold[s.id] ?? isDone(s);
/** Flips a session between minimized and expanded. */
function toggleFold(sid){
  const s = state.sessions.find(x => x.id === sid); if (!s) return;
  const on = !isFolded(s);
  state.fold[sid] = on; saveFold(state.fold);
  say(`${sessionTitle(sid)} ${on ? "minimized" : "expanded"}.`);
  render();
}
const headHtml = (sess, cards) => state.skin === "leet" ? leetHead(sess, cards) : sleekHead(sess, cards);

/* ---------- live timers ---------- */
/** Refreshes every [data-since] span in place. */
function tickSince(){
  document.querySelectorAll("[data-since]").forEach(el => {
    el.textContent = el.dataset.prefix + ago(el.dataset.since);
    if (el.hasAttribute("data-quiet")) el.classList.toggle("stale", Date.now() - new Date(el.dataset.since) > QUIET_MS);
  });
}
/** Refreshes the timers and the header clock. */
export function tick(){ tickSince(); const c = $("clock"); if (c) c.textContent =new Date().toLocaleString([], {weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit", hour12:true}); }

/* ---------- tiles: stable per-pane slots so drag/resize survive live data ---------- */
function orderedIds(ids){
  const pos = new Map(state.layout.order.map((id, i) => [id, i]));
  return ids.map((id, i) => ({id, k: pos.has(id) ? pos.get(id) : 1e6 + i})).sort((a, b) => a.k - b.k).map(x => x.id);
}
/** Saves a session's pane order, keeping other sessions' saved order after it. */
export function setOrder(visible){
  state.layout.order = visible.concat(state.layout.order.filter(id => !visible.includes(id)));
  saveLayout(state.layout);
}
/** Applies a pane's saved column and row span. */
function applySize(el){
  const s = state.layout.size[el.dataset.id] || {};
  el.style.gridColumn = `span ${Math.min(s.w || 1, state.cols)}`;
  el.style.gridRow = `span ${s.r || 1}`;
}
const gridCols = () => `repeat(${state.cols}, minmax(0, 1fr))`;
// Moves a node only when it is out of place, so focus and inner scroll survive a live update.
function place(parent, el, i){ if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] || null); }
/** The pane element with this id, if shown. */
export const slotEl = id => stack.querySelector(`.slot[data-id="${CSS.escape(id)}"]`);
function renderTiles(v, sess){
  const skin = state.skin, editing = state.editing;
  const tiles = v.tiles, want = orderedIds([logId(sess.id), ...v.cards.map(c => c._id)]);
  tiles.style.gridTemplateColumns = gridCols();
  for (const el of [...tiles.children]) if (!want.includes(el.dataset.id)) el.remove();
  const events = sess.data.events || [];
  want.forEach((id, i) => {
    let el = [...tiles.children].find(x => x.dataset.id === id);
    if (!el){ el = document.createElement("section"); el.dataset.id = id; }
    place(tiles, el, i);
    const log = isLog(id), c = log ? null : v.cards.find(x => x._id === id);
    const st = c ? cardState(c) : "";
    el.className = "slot" + (log ? " log" : "") + (skin === "leet" ? ` pane ${st}` : (st ? ` is-${st}` : ""));
    el.setAttribute("aria-label", paneName(id));
    const body = log
      ? (skin === "leet" ? leetLog(events, sess.data.updated, !isDone(sess), sess.id, v.cards) : sleekLog(events, !isDone(sess), sess.id, v.cards))
      : (skin === "leet" ? leetCard(c) : sleekCard(c));
    el.innerHTML = (editing ? editBar(id) : "") + body + (editing ? `<div class="corner" data-act="resize" aria-hidden="true" title="Drag to resize"></div>` : "");
    applySize(el);
  });
  const feed = skin === "leet" && tiles.querySelector(".slot.log .feed");
  if (feed) feed.scrollTop = feed.scrollHeight;
}

/* ---------- one block per shown session: header, pane grid, its own Sortable and cards subscription ---------- */
function openView(sid){
  const mk = (tag, cls) => { const n = document.createElement(tag); n.className = cls; return n; };
  const el = mk("section", "sess"), shead = mk("div", "shead"), summary = mk("div", "summary"), ctl = mk("div", "ctl"), fold = mk("button", "btn fold"), tiles = mk("div", "tiles");
  el.dataset.sid = sid; tiles.id = "tiles-" + (++state.viewSeq);
  fold.type = "button"; fold.setAttribute("aria-controls", tiles.id);
  fold.addEventListener("click", () => toggleFold(sid));
  ctl.append(fold); shead.append(summary, ctl); el.append(shead, tiles);
  const v = {el, summary, ctl, fold, tiles, cards: [], stop: null, sortable: null};
  v.stop = state.db.collection("cards").where("session", "==", sid).onSnapshot(snap => {
    v.cards = snap.docs.map(d => ({_id: d.id, ...d.data()})).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    render();
  }, () => {});
  // Sortable is wired here, not in layout-edit.js, so this module never imports a DOM controller above it.
  if (window.Sortable) v.sortable = Sortable.create(tiles, {
    group: "s:" + sid, handle: ".grip", animation: 150, delay: 150, delayOnTouchOnly: true, ghostClass: "ghost", disabled: !state.editing,
    onStart(){ state.busy = true; },
    onEnd(evt){
      state.busy = false;
      setOrder([...tiles.children].map(x => x.dataset.id));
      say(`${paneName(evt.item.dataset.id)}, position ${evt.newIndex + 1} of ${tiles.children.length}`);
      render();
    }
  });
  state.views.set(sid, v);
  return v;
}
function closeView(sid){
  const v = state.views.get(sid); if (!v) return;
  if (v.el.contains(controls)) topEl.append(controls);
  v.stop?.(); v.sortable?.destroy(); v.el.remove(); state.views.delete(sid);
}

/** Renders the stack from state, reusing nodes; deferred while a drag is in progress. */
export function render(){
  if (state.busy){ state.pending = true; return; }
  state.pending = false;
  const live = liveNow().map(sid => state.sessions.find(x => x.id === sid));
  for (const sid of [...state.views.keys()]) if (!live.some(s => s.id === sid)) closeView(sid);
  bar.hidden = !live.length;
  stack.dataset.cols = state.cols;
  if (!live.length){ if (controls.parentElement !== topEl) topEl.append(controls); stack.innerHTML = emptyHtml(); return; }
  stack.querySelector(":scope > .empty")?.remove();
  live.forEach((sess, i) => {
    const v = state.views.get(sess.id) || openView(sess.id), t = sess.data.title || sess.id, f = isFolded(sess);
    place(stack, v.el, i);
    if (i === 0 && controls.parentElement !== v.ctl) v.ctl.prepend(controls);
    v.el.setAttribute("aria-label", t);
    v.el.classList.toggle("folded", f);
    v.fold.setAttribute("aria-expanded", String(!f));
    v.fold.setAttribute("aria-label", `${f ? "Expand" : "Minimize"} ${t}`);
    v.fold.textContent = state.skin === "leet" ? (f ? "[+] expand" : "[-] minimize") : (f ? "▸ Expand" : "▾ Minimize");
    v.summary.innerHTML = headHtml(sess, v.cards);
    renderTiles(v, sess);
  });
  if (state.refocus){ slotEl(state.refocus.id)?.querySelector(`[data-act="${state.refocus.act}"]`)?.focus(); state.refocus = null; }
}

/* ---------- columns follow the container width ---------- */
/** Picks 1-4 columns from the stack width and re-spans the panes. */
export function fitCols(){
  const w = stack.clientWidth || document.documentElement.clientWidth;
  const next = w < 640 ? 1 : w < 1000 ? 2 : w < 1400 ? 3 : 4;
  if (next === state.cols && stack.dataset.cols) return;
  state.cols = next;
  stack.dataset.cols = state.cols;
  if (state.editing) render();
  else for (const v of state.views.values()){ v.tiles.style.gridTemplateColumns = gridCols(); [...v.tiles.children].forEach(applySize); }
}

/** Starts the 30 s clock/timer tick and the column observer. */
export function startBoard(){
  setInterval(tick, 30000);
  new ResizeObserver(fitCols).observe(stack);
}
