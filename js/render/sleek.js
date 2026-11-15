// Sleek skin markup. Strings only: nothing here touches the DOM.
import {esc, fmtOr, t12Or, ticketUrl} from "../util.js";
import {LABEL, knownState, cardState, stagesOf, stageLabel, stageSince, subsOf, lastAt, progress, logId} from "../model.js";
import {sinceHtml, progHtml, isOpen, subToggle, cardFoldBtn, editBtn, paneName, prHtml, schedHtml, idLink, cardName} from "./shared.js";

/** A ticket pane's body; ticket links come from the session doc (`links`, else `ado`). */
export function sleekCard(c, sess, min){
  const s = cardState(c), name = cardName(c);
  const steps = stagesOf(c).map(x => knownState(x.state)
    ? `<li class="${esc(x.state)}" title="${esc(x.label)}: ${esc(LABEL[x.state])}"><i></i><span>${esc(x.label)}</span></li>`
    : `<li class="unknown" title="${esc(x.label)}: unknown state ${esc(x.state)}"><i></i><span>${esc(x.label)}: ${esc(x.state)}</span></li>`).join("");
  const meta = [["Agent", c.agent && esc(c.agent)], ["Commit", c.commit && `<span class="mono">${esc(c.commit)}</span>`], ["Tokens", c.tokens && esc(c.tokens)], ["Task", c.task && idLink(c.task, ticketUrl(c.task, sess, "task"), "tid")]]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  return `<div class="chead">${c.ticket ? idLink(c.ticket, ticketUrl(c.ticket, sess), "tid") : ""}<span class="kind">${esc(c.kind)}</span><span class="pill ${s}">${esc(stageLabel(c))}${stageSince(c) ? " · " + sinceHtml(stageSince(c)) : ""}</span>${editBtn(c._id, name, false)}${cardFoldBtn(c._id, name, min, false)}</div>
    <h3>${esc(c.title)}</h3>
    <ol class="steps" aria-label="Stages">${steps}</ol>
    ${progHtml(c)}
    ${meta ? `<dl class="meta">${meta}</dl>` : ""}
    ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
    ${c.updated ? `<div class="cfoot">Updated ${esc(fmtOr(c.updated))}</div>` : ""}`;
}
/** The activity log pane's body, newest first. */
export function sleekLog(events, live, sid, cards){
  const items = events.map((e, i) => {
    const subs = subsOf(events, i, cards), key = sid + "|" + i, open = subs.length > 0 && isOpen(key, i, events.length);
    const nest = open ? `<ol class="subs">${subs.slice().reverse().map(s => `<li><time>${esc(t12Or(s.at))}</time><span>${esc(s.text)}</span></li>`).join("")}</ol>` : "";
    return `<li><time>${esc(fmtOr(e.at))}</time><span>${esc(e.text)}</span>${subs.length ? subToggle(key, subs.length, open, false) : ""}${nest}</li>`;
  }).reverse();
  return `<div class="lhead"><h2>Activity</h2>${live ? sinceHtml(lastAt(events, cards), "Quiet ", true) : ""}${editBtn(logId(sid), paneName(logId(sid)), false)}</div>${items.length ? `<ol>${items.join("")}</ol>` : `<p class="kind">Nothing logged yet.</p>`}`;
}
/** A session's summary header. */
export function sleekHead(sess, cards){
  const s = sess.data, p = progress(cards);
  const pct = p.all ? Math.round(p.done / p.all * 100) : 0;
  return `<div class="session">
    <h1>${esc(s.title)}</h1>
    <div class="facts">
      ${s.ticket ? `<span>Ticket ${idLink(s.ticket, ticketUrl(s.ticket, s), "tid")}</span>` : ""}
      ${s.branch ? `<span>Branch <b class="mono">${esc(s.branch)}</b></span>` : ""}
      ${s.started ? `<span>Started <b>${esc(fmtOr(s.started))}</b></span>` : ""}
      ${s.updated ? `<span>Updated <b>${esc(fmtOr(s.updated))}</b></span>` : ""}
      ${s.scheduledAt && !s.completed ? schedHtml(s.scheduledAt, false) : s.status ? `<span>Status <b>${esc(s.status)}</b></span>` : ""}
      ${s.completed ? `<span>Finished <b>${esc(fmtOr(s.completed))}</b></span>` : ""}
      ${prHtml(s.pr, false)}
    </div>
    <div class="rail"><div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><span>${p.done} of ${p.all} stages done · ${p.ticketsDone} of ${p.tickets} tickets</span></div>
    ${s.now ? `<div class="now"><span class="lbl">Now</span><span>${esc(s.now)}</span></div>` : ""}
  </div>`;
}
