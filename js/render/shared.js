// HTML helpers both skins use. Strings only: nothing here touches the DOM.
import {esc, t12, ago, fmtDay, untilText} from "../util.js";
import {QUIET_MS, cardState, progressOf, isLog, prFinal} from "../model.js";
import {state} from "../state.js";

// Elapsed timers render pre-filled and tick() refreshes every [data-since] span, so no re-render (and no lost focus) is needed.
/** A live elapsed-time span; quiet ones turn stale (amber) after QUIET_MS. */
/** A scheduled session's status: a badge with a live countdown (board.js tick refreshes [data-until]). */
export function schedHtml(iso, leet){
  return `<span class="sched">${leet ? "scheduled" : "Scheduled"} <b data-until="${esc(iso)}">${esc(untilText(iso))}</b></span>`;
}
export function sinceHtml(iso, prefix = "", quiet = false){
  if (!iso || isNaN(new Date(iso))) return "";
  const stale = quiet && Date.now() - new Date(iso) > QUIET_MS;
  return `<span class="since${stale ? " stale" : ""}" data-since="${esc(iso)}" data-prefix="${esc(prefix)}"${quiet ? " data-quiet" : ""}>${esc(prefix + ago(iso))}</span>`;
}
/** Title of a session, falling back to its id. */
export const sessionTitle = sid => state.sessions.find(x => x.id === sid)?.data.title || sid;
/** The card with this pane id in any open view, or null. */
export const findCard = id => { for (const v of state.views.values()){ const c = v.cards.find(x => x._id === id); if (c) return c; } return null; };
/** Accessible name of a pane. */
export const paneName = id => isLog(id) ? (state.shown.length > 1 ? `Activity log, ${sessionTitle(id.slice(4))}` : "Activity log") : (c => c ? `#${c.task || c.ticket} ${c.title}` : id)(findCard(id));

// The agent's latest milestones on a running card: the last three lines, the newest with time since it posted.
/** Progress rows for a running card, or "". */
export function progHtml(c){
  const st = cardState(c), prog = progressOf(c).slice(-3);
  if (!prog.length || (st !== "active" && st !== "rework")) return "";
  const rows = prog.map((p, k) => {
    const ago = k === prog.length - 1 ? sinceHtml(p.at) : "";
    return `<li class="${ago ? "latest" : ""}"><time>${esc(t12(p.at))}</time><span>${esc(p.text)}</span>${ago ? `<em>${ago} ago</em>` : ""}</li>`;
  }).join("");
  return state.skin === "leet"
    ? `<div><div class="lbl">progress</div><ol class="prog">${rows}</ol></div>`
    : `<ol class="prog" aria-label="Agent progress">${rows}</ol>`;
}
// Events may carry sub-events: events[i].sub = [{at, text}], e.g. check-ins under the dispatch they belong to.
// Each parent expands and collapses; the newest event starts open, older ones closed, and a viewer's toggles hold for this page load.
/** Whether event i of n shows its sub-lines. */
export const isOpen = (key, i, n) => state.subOpen.has(key) ? state.subOpen.get(key) : i === n - 1;
/** The expand/collapse button for an event's sub-lines. */
export function subToggle(key, count, open, leet){
  const n = `${count} update${count > 1 ? "s" : ""}`;
  return `<button type="button" class="more" data-subs="${esc(key)}" aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"} ${n}">${leet ? (open ? "[-]" : `[+${count}]`) : `${open ? "▾" : "▸"} ${n}`}</button>`;
}
// The session's PR, written by the orchestrator when it opens the PR and refreshed at the start of later orchestrated tasks.
// Only an Azure DevOps link is used as a link; anything else shows as plain text.
/** The header fact for a session's pull request, or "". */
export function prHtml(pr, leet){
  if (!pr || !pr.id) return "";
  const url = typeof pr.url === "string" && /^https:\/\/dev\.azure\.com\//.test(pr.url) ? pr.url : "";
  const st = String(pr.status || "open"), id = `#${esc(pr.id)}`;
  const num = url ? `<a${leet ? "" : ' class="tid"'} href="${esc(url)}" target="_blank" rel="noopener">${leet ? `<b>${id}</b>` : id}</a>` : (leet ? `<b>${id}</b>` : id);
  return `<span class="pr${prFinal(st) ? "" : " open"}">${leet ? "pr" : "PR"} ${num} <b>${esc(st)}</b></span>`;
}
/** Edit-mode controls that reorder a stacked session block, shown while that session's ✎ is on. */
export function sessMover(sid, title, i, count){
  const t = esc(title), s = esc(sid);
  return `<span class="sess-move" role="group" aria-label="Reorder ${t}">
    <button type="button" class="btn sgrip" data-sact="grip" data-sid="${s}" aria-label="Drag to reorder ${t}; arrow keys also move it" title="Drag to reorder this session">⠿</button>
    <button type="button" class="btn" data-sact="up" data-sid="${s}" aria-label="Move ${t} up"${i === 0 ? " disabled" : ""} title="Move up">▲</button>
    <button type="button" class="btn" data-sact="down" data-sid="${s}" aria-label="Move ${t} down"${i === count - 1 ? " disabled" : ""} title="Move down">▼</button>
  </span>`;
}
/** The minimize/expand button on a ticket pane. */
export function cardFoldBtn(id, name, min, leet){
  return `<button type="button" class="more cfold" data-cardfold="${esc(id)}" aria-expanded="${!min}" aria-label="${min ? "Expand" : "Minimize"} ${esc(name)}" title="${min ? "Expand" : "Minimize"} · Shift-click for the whole row">${leet ? (min ? "[+]" : "[-]") : (min ? "▸" : "▾")}</button>`;
}
/** The ✎ toggle on a pane's header: edit mode for this pane only; aria-pressed carries whether it is on. */
/** True when a pane is in edit mode: its own ✎ is on, or its session's ✎ is (which opens every pane in that session). */
export function isEditing(id){
  if (state.editing.has(id)) return true;
  const sid = isLog(id) ? id.slice(4) : (state.cards.find(c => c._id === id) || {}).session;
  return !!sid && state.editSess.has(sid);
}
export function editBtn(id, name, leet){
  return `<button type="button" class="more pedit" data-edit="${esc(id)}" aria-pressed="${isEditing(id)}" aria-label="Edit layout of ${esc(name)}" title="Edit layout">${leet ? "[✎]" : "✎"}</button>`;
}
/** The fixed label of a session's Hide done button; aria-pressed carries whether it is on. */
export const hideDoneText = (n, leet) => leet ? `[hide done:${n}]` : `Hide done (${n})`;
/** The edit-mode toolbar for a pane; fixedH drops the height controls (a log that fills its column). */
export function editBar(id, fixedH = false){
  const n = esc(paneName(id)), s = state.layout.size[id] || {}, cols = state.cols;
  const w = Math.min(s.w || 1, cols), h = `${s.r || 1} row${(s.r || 1) > 1 ? "s" : ""}`;
  return `<div class="edit" role="toolbar" aria-label="Layout for ${n}">
    <button type="button" class="btn grip" data-act="grip" aria-label="Drag to reorder ${n}; arrow keys also move it" title="Drag to reorder">⠿</button>
    <button type="button" class="btn" data-act="left" aria-label="Move ${n} earlier" title="Move earlier">◀</button>
    <button type="button" class="btn" data-act="right" aria-label="Move ${n} later" title="Move later">▶</button>
    <span class="sep"></span>
    <span class="w-ctl"><button type="button" class="btn" data-act="w-" aria-label="Narrower" title="Narrower">↔−</button><span class="dim">${w}/${cols} col</span><button type="button" class="btn" data-act="w+" aria-label="Wider" title="Wider">↔+</button><span class="sep"></span></span>
    ${fixedH ? "" : `<button type="button" class="btn" data-act="h-" aria-label="Shorter" title="Shorter">↕−</button><span class="dim">${h}</span><button type="button" class="btn" data-act="h+" aria-label="Taller" title="Taller">↕+</button>
    <span class="sep"></span>`}
    <button type="button" class="btn" data-act="reset" aria-label="Reset size of ${n}" title="Reset this pane's size">⟲</button>
  </div>`;
}
/** A pane's edit bar and resize corner, both "" unless this pane's ✎ is on; fixedH drops the height controls and the corner. */
export function editChrome(id, fixedH = false){
  if (!isEditing(id)) return {bar: "", corner: ""};
  return {bar: editBar(id, fixedH), corner: fixedH ? "" : `<div class="corner" data-act="resize" aria-hidden="true" title="Drag to resize"></div>`};
}
/** The stack's empty state: the day's sessions all finished and hidden, nothing touched that day, or no sessions yet. */
export function emptyHtml(hidden = 0){
  const skin = state.skin;
  if (hidden) return skin === "leet"
    ? `<div class="empty"><b>$ all sessions finished_</b>${hidden} finished session${hidden > 1 ? "s are" : " is"} hidden. Turn on finished: in the status bar to see ${hidden > 1 ? "them" : "it"}.</div>`
    : `<div class="empty"><b>All sessions are finished</b>${hidden} finished session${hidden > 1 ? "s are" : " is"} hidden. Use Show finished at the top to see ${hidden > 1 ? "them" : "it"}.</div>`;
  if (state.sessions.length) return skin === "leet"
    ? `<div class="empty"><b>$ no activity on ${esc(state.day)}_</b>No session or card was touched that day. Step the date in the status bar to look at another.</div>`
    : `<div class="empty"><b>Nothing touched on ${esc(fmtDay(state.day))}</b>No session or card was updated that day. Pick another day at the top.</div>`;
  return skin === "leet"
    ? `<div class="empty"><b>$ waiting for a session_</b>Claude opens a session here when it starts orchestrating a ticket. Each ticket gets a pane that moves through its stages as agents report back.</div>`
    : `<div class="empty"><b>No sessions yet</b>Claude adds a session here when it starts orchestrating a task, then moves each ticket card through its stages as agents report back.</div>`;
}
