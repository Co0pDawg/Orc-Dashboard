// Pure: rounds a day's driving segments into non-overlapping portal entries. No DOM, no storage.
import {normTicket} from "./segments.js";

const MIN = 60000;

/**
 * Entries for the Work Detail form from driving segments {ticket, start, end}.
 * Merge touching same-ticket segments, round to `unit` minutes, never span a gap, drop a fragment that
 * rounds to nothing into an entry it touches (else it counts as notEntered), then split at maxMin.
 * Times are UTC ISO strings; minutes are whole.
 */
export function buildEntries(segments, {unit = 15, maxMin = 120} = {}){
  const u = unit * MIN;
  const segs = (segments || []).map(s => ({ticket: normTicket(s.ticket), start: Date.parse(s.start), end: Date.parse(s.end)}))
    .filter(s => s.end > s.start).sort((a, b) => a.start - b.start);
  const drivenMin = Math.round(segs.reduce((n, s) => n + (s.end - s.start), 0) / MIN);
  const merged = [];
  for (const s of segs){
    const p = merged[merged.length - 1];
    if (p && p.ticket === s.ticket && s.start <= p.end) p.end = Math.max(p.end, s.end); else merged.push({...s});
  }
  const rnd = t => Math.round(t / u) * u;
  const rounded = merged.map(s => ({ticket: s.ticket, start: rnd(s.start), end: rnd(s.end), exact: (s.end - s.start) / MIN}));
  const kept = rounded.filter(e => e.end > e.start);
  let notEntered = 0;
  for (const z of rounded) if (z.end === z.start && !kept.some(e => e.start === z.start || e.end === z.start)) notEntered += z.exact;
  const entries = [];
  for (const e of kept) for (let s = e.start; s < e.end; s += maxMin * MIN){
    const end = Math.min(e.end, s + maxMin * MIN);
    entries.push({ticket: e.ticket, start: new Date(s).toISOString(), end: new Date(end).toISOString(), minutes: Math.round((end - s) / MIN), needsTicket: e.ticket == null});
  }
  return {entries, notEntered: Math.round(notEntered), drivenMin};
}
