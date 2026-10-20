// Pure: turns a day's worklog events into driving segments and agent spans. No DOM, no storage.

const MIN = 60000;
const iso = ms => new Date(ms).toISOString();
const ms = t => Date.parse(t);

/** "PET-NNNNN" for PET-17619, PET-17619*, 17619, #17619 or 17619 (number); null for UNKNOWN, PR-6243, "-", "" or null. */
export function normTicket(t){
  const m = /^(?:PET-|#)?(\d+)\*?$/i.exec(String(t ?? "").trim());
  return m ? "PET-" + m[1] : null;
}

/** The `agent` events as markers. */
export const agentMarkers = events => (events || []).filter(e => e.kind === "agent").map(e => ({session: e.session, ticket: e.ticket, at: e.at}));

/**
 * Cooper driving: from a prompt through its turn's stop, then tailMin more, cut short by the next
 * prompt for another session or ticket. Events outside [dayStart, dayEnd] are ignored and spans are
 * clipped to it. A turn with no stop ends at the session's last event + tail, or at `now` if earlier.
 * Returns [{session, ticket (as logged), start, end}] (UTC ISO), sorted, non-overlapping.
 */
export function drivingSegments(events, opts = {}){
  const tail = (opts.tailMin ?? 15) * MIN;
  const lo = opts.dayStart ? ms(opts.dayStart) : -Infinity, hi = opts.dayEnd ? ms(opts.dayEnd) : Infinity;
  const nowMs = opts.now ? ms(opts.now) : Infinity;
  const evs = (events || []).map(e => ({...e, t: ms(e.at)})).filter(e => e.t >= lo && e.t <= hi).sort((a, b) => a.t - b.t);
  const turns = [], cur = {};
  const close = s => { const c = cur[s]; if (c) { turns.push({session: s, ticket: c.ticket, start: c.start, end: c.end ?? c.last + tail}); delete cur[s]; } };
  for (const e of evs){
    if (e.kind === "notify") continue;
    if (e.kind === "prompt"){ close(e.session); cur[e.session] = {ticket: e.ticket, start: e.t, last: e.t, end: null}; }
    else if (cur[e.session] && cur[e.session].end == null){
      cur[e.session].last = e.t;
      if (e.kind === "stop") cur[e.session].end = e.t + tail;
    }
  }
  Object.keys(cur).forEach(close);
  turns.sort((a, b) => a.start - b.start);
  const key = t => t.session + "\n" + normTicket(t.ticket);
  const out = [];
  turns.forEach((t, i) => {
    let end = Math.min(t.end, nowMs, hi);
    const next = turns.slice(i + 1).find(n => n.start < end && key(n) !== key(t));
    if (next) end = next.start;
    if (end <= t.start) return;
    const prev = out[out.length - 1];
    if (prev && key(prev) === key(t) && t.start <= prev.end) prev.end = Math.max(prev.end, end);
    else out.push({session: t.session, ticket: t.ticket, start: t.start, end});
  });
  return out.map(o => ({...o, start: iso(o.start), end: iso(o.end)}));
}

/**
 * Unattended agent time: a "dispatched" event naming a card starts a span, the next event naming the same card
 * (report, commit, inline) ends it. An unanswered dispatch ends at the card's last progress line after it, else
 * the session's `updated`. The ticket is the card's task, else its ticket, else the session's.
 */
export function agentSpans(sessions, cards, dayStart, dayEnd){
  const lo = ms(dayStart), hi = ms(dayEnd), out = [];
  for (const s of sessions || []){
    const byCard = {};
    for (const e of (s.data && s.data.events) || []) if (e.card && !isNaN(ms(e.at))) (byCard[e.card] ||= []).push(e);
    for (const [id, list] of Object.entries(byCard)){
      list.sort((a, b) => ms(a.at) - ms(b.at));
      const card = (cards || []).find(c => c._id === id);
      const ticket = normTicket(card && card.task || card && card.ticket || s.data.ticket);
      const progress = ((card && card.progress) || []).map(p => ms(p.at)).filter(t => !isNaN(t));
      list.forEach((e, i) => {
        if (!/\bdispatched\b/i.test(e.text || "")) return;
        const a = ms(e.at), later = progress.filter(t => t >= a), upd = ms(s.data.updated);
        const b = list[i + 1] ? ms(list[i + 1].at) : later.length ? Math.max(...later) : upd;
        const start = Math.max(a, lo), end = Math.min(b, hi);
        if (end > start) out.push({ticket, card: id, agent: e.text, start: iso(start), end: iso(end)});
      });
    }
  }
  return out.sort((a, b) => ms(a.start) - ms(b.start));
}
