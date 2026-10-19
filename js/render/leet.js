// 1337 skin markup. Strings only: nothing here touches the DOM.
import {esc, fmt, t12, adoUrl} from "../util.js";
import {WORD, cardState, stageSince, subsOf, lastAt, tone, progress} from "../model.js";
import {sinceHtml, progHtml, isOpen, subToggle} from "./shared.js";

/** The activity log pane's body, oldest first with a cursor on the last line. */
export function leetLog(events, updated, live, sid, cards){
  const rows = [];
  events.forEach((e, i) => {
    const subs = subsOf(events, i, cards), key = sid + "|" + i, open = subs.length > 0 && isOpen(key, i, events.length);
    rows.push({cls: tone(e.text), html: `<time>${esc(t12(e.at))}</time><span>${esc(e.text)}${subs.length ? " " + subToggle(key, subs.length, open, true) : ""}</span>`});
    if (open) subs.forEach((s, j) => rows.push({cls: "sub " + tone(s.text), html: `<time>${esc(t12(s.at))}</time><i class="tree">${j === subs.length - 1 ? "└" : "├"}</i><span>${esc(s.text)}</span>`}));
  });
  return `<div class="ph"><span class="id">activity</span><span>${events.length} events</span>${live ? sinceHtml(lastAt(events, cards), "quiet ", true) : ""}${updated ? `<span class="st">${esc(t12(updated))}</span>` : ""}</div>
    ${rows.length ? `<ol class="feed">${rows.map((r, i) => `<li class="${r.cls}${i === rows.length - 1 ? " cursor" : ""}">${r.html}</li>`).join("")}</ol>` : `<p class="lbl">nothing logged yet</p>`}`;
}
/** A ticket pane's body; ticket links open in the session's ADO project (`ado`). */
export function leetCard(c, ado){
  const s = cardState(c);
  const plan = (c.stages || []).map((x, i) => `<li class="${esc(x.state)}"><span class="n">${i + 1}.</span><span class="k">${esc(x.label)}</span><span class="s">${esc(WORD[x.state] || x.state)}${x.state === "active" || x.state === "rework" ? " " + sinceHtml(x.started || c.updated) : ""}</span></li>`).join("");
  const kv = [["agent", c.agent], ["tokens", c.tokens], ["commit", c.commit]].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
  return `<div class="ph">
      ${c.updated ? `<time>${esc(t12(c.updated))}</time>` : ""}
      ${c.task ? `<a class="id" href="${esc(adoUrl(c.task, ado))}" target="_blank" rel="noopener">#${esc(c.task)}</a>` : ""}
      ${c.ticket && c.ticket !== c.task ? `<span>‹ <a class="id" href="${esc(adoUrl(c.ticket, ado))}" target="_blank" rel="noopener">#${esc(c.ticket)}</a></span>` : ""}
      <span>${esc(c.kind)}</span><span class="st ${s}">${esc(WORD[s])}${stageSince(c) ? " " + sinceHtml(stageSince(c)) : ""}</span>
    </div>
    <h3>${esc(c.title)}</h3>
    <div><div class="lbl">plan</div><ol class="plan">${plan}</ol></div>
    ${progHtml(c)}
    ${kv ? `<dl class="kv">${kv}</dl>` : ""}
    ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}`;
}
/** A session's summary header with the text progress meter. */
export function leetHead(sess, cards){
  const s = sess.data, p = progress(cards);
  const width = 24, fill = p.all ? Math.round(p.done / p.all * width) : 0;
  return `<div class="head">
      <div class="prompt"><b>fable@orch</b>:<i>~/${esc(sess.id)}</i>$ watch board</div>
      <h1 class="title">${esc(s.title)}</h1>
      <div class="facts">
        ${s.ticket ? `<span>ticket <a href="${esc(adoUrl(s.ticket, s.ado))}" target="_blank" rel="noopener"><b>#${esc(s.ticket)}</b></a></span>` : ""}
        ${s.branch ? `<span>branch <b>${esc(s.branch)}</b></span>` : ""}
        ${s.started ? `<span>started <b>${esc(fmt(s.started))}</b></span>` : ""}
        ${s.status ? `<span>status <b>${esc(s.status)}</b></span>` : ""}
        ${s.completed ? `<span>finished <b>${esc(fmt(s.completed))}</b></span>` : ""}
      </div>
      <div class="meter" role="progressbar" aria-valuenow="${p.done}" aria-valuemin="0" aria-valuemax="${p.all}">[<b>${"#".repeat(fill)}</b>${".".repeat(width - fill)}] ${p.done}/${p.all} stages · ${p.ticketsDone}/${p.tickets} tickets</div>
      ${s.now ? `<div class="now">${esc(s.now)}</div>` : ""}
    </div>`;
}
