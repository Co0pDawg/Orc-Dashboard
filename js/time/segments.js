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

/** The ticket a card's work counts toward: the first driven of its task, its ticket and the session's ticket, else the first present. */
export function cardTicket(card, sessionTicket, drivenTickets = new Set()){
  // The worklog bills parent stories, so a driven match is the only way a card joins its column.
  const all = [normTicket(card && card.task), normTicket(card && card.ticket), normTicket(sessionTicket)];
  return all.find(t => t && drivenTickets.has(t)) ?? all.find(Boolean) ?? null;
}

const DISPATCH = /\b(dispatched|re-?dispatch\w*|sent to the same builder|fix round)\b/i;
const REPORT = /\b(done|accept\w*|rework|partial|blocked|report\w*)\b/i;

/**
 * Unattended agent time: a dispatch event naming a card starts a span, the next event naming the same card
 * (report, commit, inline) ends it. An unanswered dispatch ends at the session's next report event that names
 * no card, else the card's last progress line after it, else the session's `updated` but at most 2 h on.
 * Every span is capped at 2 h or its last progress line + 15 min, whichever is later.
 * The ticket is cardTicket(card, session ticket, drivenTickets).
 */
export function agentSpans(sessions, cards, dayStart, dayEnd, drivenTickets = new Set()){
  const lo = ms(dayStart), hi = ms(dayEnd), out = [];
  for (const s of sessions || []){
    const byCard = {}, events = ((s.data && s.data.events) || []).filter(e => !isNaN(ms(e.at)));
    for (const e of events) if (e.card) (byCard[e.card] ||= []).push(e);
    for (const [id, list] of Object.entries(byCard)){
      list.sort((a, b) => ms(a.at) - ms(b.at));
      const card = (cards || []).find(c => c._id === id);
      const ticket = cardTicket(card, s.data.ticket, drivenTickets);
      const progress = ((card && card.progress) || []).map(p => ms(p.at)).filter(t => !isNaN(t));
      list.forEach((e, i) => {
        if (!DISPATCH.test(e.text || "")) return;
        const a = ms(e.at), later = progress.filter(t => t >= a), upd = ms(s.data.updated);
        // Report events carry no card, so the session's next one is the best end a legacy dispatch has.
        const report = events.filter(x => !x.card && ms(x.at) > a && REPORT.test(x.text || "")).map(x => ms(x.at));
        let b = list[i + 1] ? ms(list[i + 1].at) : report.length ? Math.min(...report) : later.length ? Math.max(...later) : Math.min(isNaN(upd) ? Infinity : upd, a + 120 * MIN);
        // A paused or silent agent is not working: past 2 h a span lasts only to its last progress line + 15 min.
        const inside = later.filter(t => t <= b);
        b = Math.min(b, Math.max(a + 120 * MIN, (inside.length ? Math.max(...inside) : -Infinity) + 15 * MIN));
        const start = Math.max(a, lo), end = Math.min(b, hi);
        if (end > start) out.push({ticket, card: id, agent: e.text, start: iso(start), end: iso(end)});
      });
    }
  }
  return out.sort((a, b) => ms(a.start) - ms(b.start));
}

/**
 * Agent-only time as segments: a moment an agent span covers while Cooper is not driving (viewing and waiting), but only
 * between two of his turns no more than maxGapMin apart, so a run nobody came back to (overnight) never counts.
 * At a moment several agents cover, the ticket he last drove wins if one of them has it, else the latest-started span.
 * Returns [{ticket, start, end, waiting: true}] (UTC ISO), sorted, non-overlapping, never overlapping `driving`.
 */
export function waitingSegments(driving, spans, {maxGapMin = 120} = {}){
  const dv = (driving || []).map(s => ({ticket: normTicket(s.ticket), a: ms(s.start), b: ms(s.end)})).sort((x, y) => x.a - y.a);
  const sp = (spans || []).map(s => ({ticket: normTicket(s.ticket), a: ms(s.start), b: ms(s.end)})).filter(s => s.b > s.a);
  // ponytail: O(points x spans) over one day's few dozen spans; an interval tree if a day ever holds thousands.
  const pts = [...new Set([...sp, ...dv].flatMap(s => [s.a, s.b]))].sort((x, y) => x - y), out = [];
  for (let i = 0; i + 1 < pts.length; i++){
    const a = pts[i], b = pts[i + 1], mid = (a + b) / 2;
    if (dv.some(d => d.a <= mid && mid < d.b)) continue;
    const on = sp.filter(s => s.a <= mid && mid < s.b);
    if (!on.length) continue;
    const last = dv.filter(d => d.b <= a).pop(), next = dv.find(d => d.a >= b);
    if (!last || !next || next.a - last.b > maxGapMin * MIN) continue;
    const pick = on.find(s => last && s.ticket === last.ticket) || on.reduce((x, y) => y.a > x.a ? y : x);
    const p = out[out.length - 1];
    if (p && p.ticket === pick.ticket && p.b === a) p.b = b; else out.push({ticket: pick.ticket, a, b});
  }
  return out.map(o => ({ticket: o.ticket, start: iso(o.a), end: iso(o.b), waiting: true}));
}
