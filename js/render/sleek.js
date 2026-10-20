// Sleek skin markup. Strings only: nothing here touches the DOM.
import {esc, fmt, t12, adoUrl} from "../util.js";
import {LABEL, cardState, stagesOf, stageLabel, stageSince, subsOf, lastAt, progress} from "../model.js";
import {sinceHtml, progHtml, isOpen, subToggle, cardFoldBtn, prHtml} from "./shared.js";

/** A ticket pane's body; ticket links open in the session's ADO project (`ado`). */
export function sleekCard(c, ado, min){
  const s = cardState(c);
  const steps = stagesOf(c).map(x => `<li class="${esc(x.state)}" title="${esc(x.label)}: ${esc(LABEL[x.state] || x.state)}"><i></i><span>${esc(x.label)}</span></li>`).join("");
  const meta = [["Agent", c.agent && esc(c.agent)], ["Commit", c.commit && `<span class="mono">${esc(c.commit)}</span>`], ["Tokens", c.tokens && esc(c.tokens)], ["Task", c.task && `<a class="tid" href="${esc(adoUrl(c.task, ado))}" target="_blank" rel="noopener">#${esc(c.task)}</a>`]]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  return `<div class="chead">${c.ticket ? `<a class="tid" href="${esc(adoUrl(c.ticket, ado))}" target="_blank" rel="noopener">#${esc(c.ticket)}</a>` : ""}<span class="kind">${esc(c.kind)}</span><span class="pill ${s}">${esc(stageLabel(c))}${stageSince(c) ? " · " + sinceHtml(stageSince(c)) : ""}</span>${cardFoldBtn(c._id, `#${c.task || c.ticket} ${c.title}`, min, false)}</div>
    <h3>${esc(c.title)}</h3>
    <ol class="steps" aria-label="Stages">${steps}</ol>
    ${progHtml(c)}
    ${meta ? `<dl class="meta">${meta}</dl>` : ""}
    ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
    ${c.updated ? `<div class="cfoot">Updated ${esc(fmt(c.updated))}</div>` : ""}`;
}
/** The activity log pane's body, newest first. */
export function sleekLog(events, live, sid, cards){
  const items = events.map((e, i) => {
    const subs = subsOf(events, i, cards), key = sid + "|" + i, open = subs.length > 0 && isOpen(key, i, events.length);
    const nest = open ? `<ol class="subs">${subs.slice().reverse().map(s => `<li><time>${esc(t12(s.at))}</time><span>${esc(s.text)}</span></li>`).join("")}</ol>` : "";
    return `<li><time>${esc(fmt(e.at))}</time><span>${esc(e.text)}</span>${subs.length ? subToggle(key, subs.length, open, false) : ""}${nest}</li>`;
  }).reverse();
  return `<div class="lhead"><h2>Activity</h2>${live ? sinceHtml(lastAt(events, cards), "Quiet ", true) : ""}</div>${items.length ? `<ol>${items.join("")}</ol>` : `<p class="kind">Nothing logged yet.</p>`}`;
}
/** A session's summary header. */
export function sleekHead(sess, cards){
  const s = sess.data, p = progress(cards);
  const pct = p.all ? Math.round(p.done / p.all * 100) : 0;
  return `<div class="session">
    <h1>${esc(s.title)}</h1>
    <div class="facts">
      ${s.ticket ? `<span>Ticket <a class="tid" href="${esc(adoUrl(s.ticket, s.ado))}" target="_blank" rel="noopener">#${esc(s.ticket)}</a></span>` : ""}
      ${s.branch ? `<span>Branch <b class="mono">${esc(s.branch)}</b></span>` : ""}
      ${s.started ? `<span>Started <b>${esc(fmt(s.started))}</b></span>` : ""}
      ${s.updated ? `<span>Updated <b>${esc(fmt(s.updated))}</b></span>` : ""}
      ${s.status ? `<span>Status <b>${esc(s.status)}</b></span>` : ""}
      ${s.completed ? `<span>Finished <b>${esc(fmt(s.completed))}</b></span>` : ""}
      ${prHtml(s.pr, false)}
    </div>
    <div class="rail"><div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><span>${p.done} of ${p.all} stages done · ${p.ticketsDone} of ${p.tickets} tickets</span></div>
    ${s.now ? `<div class="now"><span class="lbl">Now</span><span>${esc(s.now)}</span></div>` : ""}
  </div>`;
}
