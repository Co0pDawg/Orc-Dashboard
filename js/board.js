// The session stack: one block per shown session (header + pane grid), live timers, and column fitting.
import {cardState, isDone, visibleSessions, doneCount, touchedOn, liveIds, logId, isLog, mergeOrder, QUIET_MS} from "./model.js";
import {ago, esc, untilText} from "./util.js";
import {state} from "./state.js";
import {saveLayout, saveFold, saveHideDone} from "./prefs.js";
import {paneName, sessionTitle, editChrome, editBtn, emptyHtml, sessMover, hideDoneText, isEditing} from "./render/shared.js";
import {sleekCard, sleekLog, sleekHead} from "./render/sleek.js";
import {leetCard, leetLog, leetHead} from "./render/leet.js";
import {ymd} from "./time/render.js";

/** Element by id. */
export const $ = id => document.getElementById(id);
export const chooser = $("chooser"), stack = $("stack"), toggle = $("skin-toggle");

/** Announces msg through the sr live region. */
export function say(msg){ const sr = $("sr"); sr.textContent = ""; setTimeout(() => { sr.textContent = msg; }, 30); }
/** Today as a local yyyy-MM-dd. */
export const today = () => ymd(Date.now());
/** Selects a day for the Board and Time; selecting today follows today again, so it rolls over at midnight. */
export function setDay(d){ state.day = d; state.dayPicked = d !== today(); }
const onDay = s => touchedOn(s, state.day, state.cards), past = () => state.day < today();
/** Sessions offered on the chips right now: those touched on the selected day. */
export const visible = () => {
  const v = visibleSessions(state.sessions, state.showDone, state.doneWhen, onDay, past()), o = state.opened && state.sessions.find(s => s.id === state.opened.id);
  return o && onDay(o) && !v.includes(o) ? v.concat(o) : v;
};
/** The Show finished count for the selected day. */
export const doneOnDay = () => doneCount(state.sessions, state.doneWhen, onDay, past());
/** Whether a session is finished under the viewer's setting. */
export const doneNow = s => isDone(s, state.doneWhen);
/** Session ids the stack shows right now. */
export const liveNow = () => liveIds(state.shown, visible());
/** Whether a session is minimized: the viewer's choice, else folded when finished. */
const isFolded = s => state.fold[s.id] ?? doneNow(s);
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
  document.querySelectorAll("[data-until]").forEach(el => { el.textContent = untilText(el.dataset.until); });
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
  // Hide done keeps finished cards out of the grid, so they go back beside the cards they followed.
  const sid = visible.find(isLog)?.slice(4), v = sid && state.views.get(sid);
  const ids = v ? mergeOrder(orderedIds([logId(sid), ...v.cards.map(c => c._id)]), visible) : visible;
  state.layout.order = ids.concat(state.layout.order.filter(id => !ids.includes(id)));
  saveLayout(state.layout);
}
/** Applies a pane's saved column and row span. */
function applySize(el){
  const s = state.layout.size[el.dataset.id] || {};
  el.style.gridColumn = `span ${Math.min(s.w || 1, state.cols)}`;
  // A minimized card spans one row whatever its saved height, so a row of minimized cards slims.
  el.style.gridRow = `span ${el.classList.contains("min") ? 1 : s.r || 1}`;
}
// Settings > Activity log fills its column, for this session's grid right now: two columns or more, and cards beside the log.
const logFills = tiles => state.logFull && state.cols >= 2 && !tiles.classList.contains("log-only");
// Rows no card sits in, which only the log spans: a 0-px track, or a band beside nothing.
function emptyRows(tiles, log){
  const cs = getComputedStyle(tiles), gap = parseFloat(cs.rowGap) || 0, cards = [...tiles.children].filter(x => x !== log).map(x => x.getBoundingClientRect());
  let top = tiles.getBoundingClientRect().top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop), n = 0;
  for (const h of cs.gridTemplateRows.split(" ").filter(Boolean).map(parseFloat)){
    if (!cards.some(c => c.top < top + h - 0.5 && c.bottom > top + 0.5)) n++;
    top += h + gap;
  }
  return n;
}
/**
 * Spans the log one row at a time until it reaches the last card's row, then keeps the longest span that left no
 * empty row. A span may push a card into a new row as long as a later one catches up; one that can never catch up
 * (a full-width card below, or a log saved after a full row) falls back to the last span with every row in use.
 */
function fillLog(tiles){
  const log = tiles.querySelector(":scope > .slot.log");
  if (!log || !logFills(tiles) || !tiles.offsetParent) return;
  const reaches = () => log.getBoundingClientRect().bottom >= Math.max(...[...tiles.children].filter(x => x !== log).map(x => x.getBoundingClientRect().bottom)) - 1;
  log.style.gridRow = "span 1";
  let n = 1, keep = 1;
  // ponytail: one forced layout per step, 8 at most, so a log beside more than 8 rows of cards stops short of the last.
  for (let i = 1; i < 8 && !reaches(); i++){
    log.style.gridRow = `span ${++n}`;
    if (!emptyRows(tiles, log)) keep = n;
  }
  if (keep !== n) log.style.gridRow = `span ${keep}`;
}
const gridCols = () => `repeat(${state.cols}, minmax(0, 1fr))`;
// Moves a node only when it is out of place, so focus and inner scroll survive a live update.
function place(parent, el, i){ if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] || null); }
/** The pane element with this id, if shown. */
export const slotEl = id => stack.querySelector(`.slot[data-id="${CSS.escape(id)}"]`);
function renderTiles(v, sess){
  const skin = state.skin;
  // The session's "Hide done" button drops finished cards from the grid; the log still nests their progress.
  const cards = state.hideDone[sess.id] ? v.cards.filter(c => cardState(c) !== "done") : v.cards;
  const tiles = v.tiles, want = orderedIds([logId(sess.id), ...cards.map(c => c._id)]);
  tiles.style.gridTemplateColumns = gridCols();
  tiles.classList.toggle("log-only", !cards.length);
  const fills = logFills(tiles);
  for (const el of [...tiles.children]) if (!want.includes(el.dataset.id)) el.remove();
  const events = sess.data.events || [];
  want.forEach((id, i) => {
    let el = [...tiles.children].find(x => x.dataset.id === id);
    if (!el){ el = document.createElement("section"); el.dataset.id = id; }
    place(tiles, el, i);
    const log = isLog(id), c = log ? null : cards.find(x => x._id === id);
    const st = c ? cardState(c) : "", min = !log && !!state.cardFold[id];
    el.className = "slot" + (log ? " log" : "") + (min ? " min" : "") + (isEditing(id) ? " editing" : "") + (skin === "leet" ? ` pane ${st}` : (st ? ` is-${st}` : ""));
    el.setAttribute("aria-label", paneName(id));
    // One unreadable doc must not stop the rest of the board, so a pane that throws shows why and logs the error.
    let body;
    try {
      body = log
        ? (skin === "leet" ? leetLog(events, sess.data.updated, !doneNow(sess), sess.id, v.cards) : sleekLog(events, !doneNow(sess), sess.id, v.cards))
        : (skin === "leet" ? leetCard(c, sess.data.ado, min) : sleekCard(c, sess.data.ado, min));
    } catch (err){
      console.error("Orc-istrator: pane", id, err);
      body = `<p class="note">${editBtn(id, paneName(id), skin === "leet")} This ${log ? "log" : "card"} (${esc(id)}) could not be shown: ${esc(err.message)}</p>`;
    }
    // A log that fills its column takes no saved height, so its edit bar drops the height controls and the corner.
    const {bar, corner} = editChrome(id, log && fills);
    // A live snapshot rewrites the pane, so a focused control inside it (the ✎, an edit button, a toggle) gets focus back.
    const f = el.contains(document.activeElement) && document.activeElement, key = f && ["edit", "act", "cardfold", "subs"].find(k => f.dataset?.[k] !== undefined);
    const sel = key && `[data-${key}="${CSS.escape(f.dataset[key])}"]`;
    el.innerHTML = bar + body + corner;
    if (sel) el.querySelector(sel)?.focus({preventScroll: true});
    applySize(el);
  });
  fillLog(tiles);
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
  const mover = mk("span", "mover"), hide = mk("button", "btn hide-done"), sedit = mk("button", "btn sedit");
  hide.type = "button"; sedit.type = "button"; sedit.dataset.sedit = sid; sedit.title = "Edit position";
  hide.addEventListener("click", () => {
    if (state.hideDone[sid]) delete state.hideDone[sid]; else state.hideDone[sid] = true;
    saveHideDone(state.hideDone); say(`Finished cards ${state.hideDone[sid] ? "hidden" : "shown"}.`); render();
  });
  ctl.append(mover, sedit, hide, fold); shead.append(summary, ctl); el.append(shead, tiles);
  const v = {el, summary, ctl, mover, sedit, hide, fold, tiles, cards: [], stop: null, sortable: null};
  v.stop = state.db.collection("cards").where("session", "==", sid).onSnapshot(snap => {
    v.cards = snap.docs.map(d => ({_id: d.id, ...d.data()})).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    render();
  }, () => {});
  // Sortable is wired here, not in layout-edit.js, so this module never imports a DOM controller above it.
  // It stays enabled: only a pane in edit mode renders a .grip, so only that pane can be dragged.
  if (window.Sortable) v.sortable = Sortable.create(tiles, {
    group: "s:" + sid, handle: ".grip", animation: 150, delay: 150, delayOnTouchOnly: true, ghostClass: "ghost",
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
  v.stop?.(); v.sortable?.destroy(); v.el.remove(); state.views.delete(sid);
}

/** Renders the stack from state, reusing nodes; deferred while a drag is in progress. */
export function render(){
  if (state.busy){ state.pending = true; return; }
  state.pending = false;
  const live = liveNow().map(sid => state.sessions.find(x => x.id === sid));
  for (const sid of [...state.views.keys()]) if (!live.some(s => s.id === sid)) closeView(sid);
  stack.dataset.cols = state.cols;
  if (!live.length){ state.editing.clear(); state.editSess.clear(); stack.innerHTML = emptyHtml(state.showDone ? 0 : doneOnDay()); return; }
  stack.querySelector(":scope > .empty")?.remove();
  live.forEach((sess, i) => {
    const v = state.views.get(sess.id) || openView(sess.id), t = sess.data.title || sess.id, f = isFolded(sess);
    place(stack, v.el, i);
    v.el.setAttribute("aria-label", t);
    v.el.classList.toggle("folded", f);
    v.fold.setAttribute("aria-expanded", String(!f));
    v.fold.setAttribute("aria-label", `${f ? "Expand" : "Minimize"} ${t}`);
    // A session's ✎ opens every pane in it for editing, and also shows the session mover when there is another to move past.
    const sEdit = state.editSess.has(sess.id);
    v.sedit.hidden = f;
    v.sedit.setAttribute("aria-pressed", String(sEdit));
    v.sedit.setAttribute("aria-label", `Edit layout of ${t}`);
    v.sedit.textContent = state.skin === "leet" ? "[✎]" : "✎";
    v.mover.innerHTML = sEdit && live.length > 1 ? sessMover(sess.id, t, i, live.length) : "";
    v.fold.textContent = state.skin === "leet" ? (f ? "[+]" : "[-]") : (f ? "+" : "−");
    v.fold.title = f ? "Expand" : "Minimize";
    // Shown only while the session has finished cards and is expanded.
    const nDone = v.cards.filter(c => cardState(c) === "done").length, hid = !!state.hideDone[sess.id];
    v.hide.hidden = !nDone || f;
    v.hide.setAttribute("aria-pressed", String(hid));
    v.hide.textContent = hideDoneText(nDone, state.skin === "leet");
    v.hide.title = hid ? "Show this session's finished cards" : "Hide this session's finished cards";
    try { v.summary.innerHTML = headHtml(sess, v.cards); }
    catch (err){ console.error("Orc-istrator: header", sess.id, err); v.summary.innerHTML = `<p class="note">This session's header could not be shown: ${esc(err.message)}</p>`; }
    renderTiles(v, sess);
  });
  // A pane or session that left the screen (Hide done, a day change, a hidden session) leaves edit mode.
  for (const id of state.editing) if (!slotEl(id)) state.editing.delete(id);
  for (const sid of state.editSess) if (!state.views.has(sid)) state.editSess.delete(sid);
  if (state.refocus){ slotEl(state.refocus.id)?.querySelector(`[data-act="${state.refocus.act}"]`)?.focus(); state.refocus = null; }
  if (state.sessFocus){
    const s = stack.querySelector(`[data-sact="${state.sessFocus.act}"][data-sid="${CSS.escape(state.sessFocus.sid)}"]`);
    (s && !s.disabled ? s : stack.querySelector(`[data-sact="grip"][data-sid="${CSS.escape(state.sessFocus.sid)}"]`))?.focus(); state.sessFocus = null;
  }
}

/* ---------- columns follow the container width ---------- */
/** Picks 1-4 columns from the stack width and re-spans the panes. */
export function fitCols(){
  const w = stack.clientWidth || document.documentElement.clientWidth;
  const next = w < 640 ? 1 : w < 1000 ? 2 : w < 1400 ? 3 : 4;
  if (next === state.cols && stack.dataset.cols) return;
  state.cols = next;
  stack.dataset.cols = state.cols;
  if (state.editing.size) render();
  else for (const v of state.views.values()){ v.tiles.style.gridTemplateColumns = gridCols(); [...v.tiles.children].forEach(applySize); fillLog(v.tiles); }
}

/** Starts the 30 s clock/timer tick and the column observer. */
export function startBoard(){
  setInterval(tick, 30000);
  new ResizeObserver(fitCols).observe(stack);
}
