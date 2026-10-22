// Pure: the Note for each Work Detail entry, from the day's roll-up blocks and agent runs. No DOM, no storage.
import {normTicket} from "./segments.js";

const ms = t => Date.parse(t);

/** s cut to at most max characters on a word boundary, with no trailing "; ". */
export function capWords(s, max = 300){
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1), i = head.lastIndexOf(" ");
  return (i > 0 ? head.slice(0, i) : s.slice(0, max)).replace(/[;,\s]+$/, "");
}

/**
 * One Note per entry. A driven or mixed entry joins the texts of the same-ticket roll-up blocks it overlaps, in time order.
 * A waiting-only entry names the agent runs on its ticket that overlap it (card title, else dispatch text) and falls back
 * to the blocks rule. Either way the last fallback is notes[ticket], else "". Notes are capped at 300 characters.
 */
export function entryNotes(entries, {blocks, notes, spans, cards} = {}){
  return (entries || []).map(e => {
    const t = normTicket(e.ticket), a = ms(e.start), b = ms(e.end);
    const on = list => (list || []).filter(x => normTicket(x.ticket) === t && Math.min(b, ms(x.end)) - Math.max(a, ms(x.start)) > 0)
      .sort((x, y) => ms(x.start) - ms(y.start));
    if (e.waiting){
      const runs = [...new Set(on(spans).map(s => ((cards || []).find(c => c._id === s.card) || {}).title || s.agent).filter(Boolean))];
      if (runs.length) return capWords(`Waiting on agent run${runs.length > 1 ? "s" : ""}: ${runs.join("; ")}`);
    }
    const texts = [...new Set(on(blocks).map(x => x.text).filter(Boolean))];
    if (texts.length) return capWords(texts.join("; "));
    return (t && notes && notes[t]) || "";
  });
}
